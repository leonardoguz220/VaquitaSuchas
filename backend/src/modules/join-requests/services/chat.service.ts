import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { ChatMessageSent } from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { FileStorage, StorageObjectNotFoundError } from '../../../shared/ports/file-storage.js';
import { RateLimitRepository } from '../../auth/repositories/rate-limit.repository.js';
import { RECEIPT_URL_TTL_SECONDS } from '../../billing/domain/receipt-file.js';
import {
  CHAT_MESSAGES_PER_MINUTE,
  chatRateAllowed,
  validateChatMessage,
  type ChatRule,
} from '../domain/chat-rules.js';
import { chatImageKeyOf } from '../domain/request-files.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { MessagesRepository, type JoinMessageRecord } from '../repositories/messages.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';
import type { SignedFile } from './entry-payment.service.js';
import { JoinRequestsService } from './join-requests.service.js';
import { RequestLifecycle } from './request-lifecycle.js';

export const CHAT_RATE_BUCKET = 'chat_msg';
export const DEFAULT_CHAT_PAGE = 50;
export const MAX_CHAT_PAGE = 100;

/** `JoinMessage` del contrato: el texto va como texto plano y la imagen se pide aparte. */
export interface JoinMessageView {
  id: string;
  seq: number;
  senderId: string;
  body: string | null;
  imageAvailable: boolean;
  createdAt: string;
}

export interface SendMessageInput {
  text: string | null;
  imageBytes: Uint8Array | undefined;
}

type Outcome = { error: DomainError } | { error?: undefined };

const readOnly = (): DomainError =>
  new DomainError(
    'CHAT_READ_ONLY',
    422,
    'La solicitud ya terminó: el chat quedó en solo lectura.',
    { rule: 'RF-010-07' },
  );

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

const storageUnavailable = (): DomainError =>
  new DomainError(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'No pudimos guardar el archivo, intenta de nuevo.',
  );

/** Reglas rotas del mensaje → error HTTP del contrato (400, 413 o 415). */
function messageError(broken: readonly ChatRule[]): DomainError {
  if (broken.includes('image_too_large')) {
    return new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);
  }
  if (broken.includes('image_type')) {
    return new DomainError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      415,
      'Solo se aceptan imágenes JPG o PNG.',
    );
  }
  const field = broken.includes('text_too_long') ? 'TOO_LONG' : 'REQUIRED';
  return new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { text: [field] },
  });
}

const toView = (m: JoinMessageRecord, purged: boolean): JoinMessageView => ({
  id: m.id,
  seq: m.seq,
  senderId: m.senderId,
  body: m.body,
  imageAvailable: m.imageKey !== null && !purged,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Chat de la solicitud (spec 010, US5): texto o imagen entre solicitante y titular, de solo
 * anexado (RF-010-06). Nunca registra el texto de los mensajes en los logs (RNF-010-02).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly storage: FileStorage,
    private readonly requestsService: JoinRequestsService,
    private readonly requests: RequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly events: RequestEventsRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly rateLimit: RateLimitRepository,
  ) {}

  /** `GET /join-requests/:id/messages` (RF-010-09): `seq` ascendente, solo lo posterior a `afterSeq`. */
  async list(
    userId: string,
    requestId: string,
    afterSeq: number,
    limit: number,
  ): Promise<{ items: JoinMessageView[]; serverNow: string }> {
    const { record } = await this.requestsService.access(this.db, requestId, userId);
    const rows = await this.messages.listAfter(
      this.db,
      requestId,
      Math.max(afterSeq, 0),
      Math.min(Math.max(limit, 1), MAX_CHAT_PAGE),
    );
    return {
      items: rows.map((m) => toView(m, record.contentPurgedAt !== null)),
      serverNow: this.clock.now().toISOString(),
    };
  }

  /**
   * `POST /join-requests/:id/messages` (RF-010-05, RF-010-10). Con la solicitud bloqueada (así el
   * conteo del límite y el alta no se cruzan) persiste el vencimiento si ya llegó, exige estado
   * activo, aplica 20 mensajes por minuto por persona y solicitud, guarda la imagen y el mensaje.
   */
  async send(userId: string, requestId: string, input: SendMessageInput): Promise<JoinMessageView> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    const image = input.imageBytes ?? null;
    const broken = validateChatMessage(input.text, image);
    if (broken.length > 0) throw messageError(broken);
    const text = input.text !== null && input.text.trim().length > 0 ? input.text : null;

    const stored: string[] = [];
    let created: JoinMessageRecord | undefined;
    try {
      const outcome = await this.db.withTransaction<Outcome>(async (tx) => {
        const now = this.clock.now();
        const locked = await this.requests.findByIdForUpdate(tx, requestId);
        if (!locked) throw notFound();
        const record = await this.lifecycle.expireIfDue(tx, locked, now);
        // El vencimiento recién persistido debe confirmarse: el error se lanza fuera de la transacción.
        if (record.status === 'expirada') return { error: readOnly() };
        if (
          record.status === 'aceptada' ||
          record.status === 'rechazada' ||
          record.status === 'cancelada'
        ) {
          return { error: readOnly() };
        }
        await this.enforceRate(tx, requestId, userId, now);

        let imageRef: { key: string; mime: string; sizeBytes: number } | null = null;
        if (image) {
          const type = image[0] === 0x89 ? 'png' : 'jpeg';
          const key = chatImageKeyOf({
            groupId: record.groupId,
            requestId: record.id,
            fileId: randomUUID(),
            type,
          });
          const mime = type === 'png' ? 'image/png' : 'image/jpeg';
          try {
            await this.storage.put(key, image, { contentType: mime });
          } catch {
            this.logger.warn('El almacén de archivos falló al guardar una imagen del chat.');
            throw storageUnavailable();
          }
          stored.push(key);
          imageRef = { key, mime, sizeBytes: image.length };
        }
        created = await this.messages.insert(tx, {
          requestId: record.id,
          senderId: userId,
          body: text,
          image: imageRef,
        });
        await this.rateLimit.record(tx, CHAT_RATE_BUCKET, rateKey(requestId, userId), now);
        const recipientId =
          userId === record.applicantId ? access.group.owner_id : record.applicantId;
        const event: ChatMessageSent = {
          type: 'join-requests.chat-message-sent',
          requestId: record.id,
          groupId: record.groupId,
          applicantId: record.applicantId,
          hostId: access.group.owner_id,
          messageId: created.id,
          senderId: userId,
          recipientId,
        };
        await this.bus.publish(tx, event);
        return {};
      });
      if (outcome.error) throw outcome.error;
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
    return toView(created as JoinMessageRecord, false);
  }

  /** `POST /join-requests/:id/read` (RF-010-09): nunca marca más allá del último mensaje. */
  async markRead(userId: string, requestId: string, upToSeq: number): Promise<void> {
    await this.requestsService.access(this.db, requestId, userId);
    const last = await this.messages.lastSeq(this.db, requestId);
    await this.messages.markRead(this.db, requestId, userId, Math.min(Math.max(upToSeq, 0), last));
  }

  /** `GET /join-requests/:id/messages/:messageId/image` (RNF-010-02): URL firmada de ≤ 10 minutos. */
  async imageUrl(userId: string, requestId: string, messageId: string): Promise<SignedFile> {
    const { record } = await this.requestsService.access(this.db, requestId, userId);
    const message = await this.messages.findById(this.db, requestId, messageId);
    if (!message || message.imageKey === null || message.imageMime === null) throw notFound();
    if (record.contentPurgedAt !== null) {
      throw new DomainError('FILE_DELETED', 410, 'El archivo ya fue eliminado.');
    }
    let url: string;
    try {
      url = await this.storage.signedUrl(message.imageKey, RECEIPT_URL_TTL_SECONDS);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw notFound();
      this.logger.warn('El almacén de archivos falló al firmar la URL de una imagen del chat.');
      throw storageUnavailable();
    }
    return {
      url,
      expiresAt: new Date(
        this.clock.now().getTime() + RECEIPT_URL_TTL_SECONDS * 1000,
      ).toISOString(),
      mime: message.imageMime,
    };
  }

  /** 20 mensajes por minuto por persona y solicitud (RF-010-10); el cubo es `chat_msg`. */
  private async enforceRate(
    tx: DbTransaction,
    requestId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const since = new Date(now.getTime() - 60_000);
    const sent = await this.rateLimit.timestampsSince(
      tx,
      CHAT_RATE_BUCKET,
      rateKey(requestId, userId),
      since,
    );
    if (chatRateAllowed(sent, now)) return;
    // Cuando salga del minuto el mensaje más antiguo de los últimos 20 vuelve a haber lugar.
    const recent = sent.filter((d) => d.getTime() > since.getTime());
    const blocking = recent[recent.length - CHAT_MESSAGES_PER_MINUTE] as Date;
    const retryAfterSeconds = Math.max(
      Math.ceil((blocking.getTime() + 60_000 - now.getTime()) / 1000),
      1,
    );
    throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
      retryAfterSeconds,
    });
  }

  private async discard(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch {
        this.logger.warn('No se pudo borrar una imagen del chat tras una operación fallida.');
      }
    }
  }
}

/** Huella del cubo: ni el identificador de la persona ni el de la solicitud van en claro. */
const rateKey = (requestId: string, userId: string): string =>
  createHash('sha256').update(`${requestId}:${userId}`).digest('hex');
