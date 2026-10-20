import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { categoryFor, type NotificationType, type RecipientRole } from '../domain/catalog.js';
import { dedupeKey } from '../domain/dedupe.js';
import { decodeNotificationCursor } from '../domain/notification-cursor.js';
import { render, type NotificationData } from '../domain/templates.js';
import {
  NotificationsRepository,
  type NotificationRecord,
} from '../repositories/notifications.repository.js';

export const NOTIFICATIONS_DEFAULT_LIMIT = 20;
export const NOTIFICATIONS_MAX_LIMIT = 100;

/** Entrada de `notify`: lo que sabe quien origina el hecho (manejadores de eventos de otras specs). */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** Rol del destinatario; solo para los tipos cuya categoría depende de él. */
  role?: RecipientRole;
  entity: { type: string; id: string };
  data: NotificationData;
  /** Período (`AAAA-MM`) o número de recordatorio que distinguen repeticiones legítimas. */
  period?: string;
  n?: number;
}

export interface NotificationView {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}

const toView = (r: NotificationRecord): NotificationView => ({
  id: r.id,
  type: r.type,
  category: r.category,
  title: r.title,
  body: r.body,
  link: r.link,
  readAt: r.readAt ? r.readAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

/**
 * Avisos dentro de la app (spec 005, parte A). `notify` y `cancelForEntity` reciben la transacción
 * del hecho que los origina: si el hecho se revierte, el aviso también (RF-005-01).
 * Los envíos por correo y Telegram (partes B y C) se agregan aquí sin cambiar esta firma.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  /** Crea el aviso con su clave; si ya existía no hace nada más. `true` si lo creó (RNF-005-01). */
  async notify(tx: DbTransaction, input: NotifyInput): Promise<boolean> {
    const rendered = render(input.type, input.data);
    const category = categoryFor(input.type, input.role);
    const id = await this.repository.insert(tx, {
      userId: input.userId,
      type: input.type,
      category,
      title: rendered.title,
      body: rendered.body,
      link: rendered.link,
      entityType: input.entity.type,
      entityId: input.entity.id,
      // El destinatario va siempre en la clave: una entidad puede avisar a varias personas.
      dedupeKey: dedupeKey(input.type, input.entity, input.period, input.n, input.userId),
      createdAt: this.clock.now(),
    });
    return id !== null;
  }

  /** RN-005-02: cancela los envíos pendientes de esos tipos para la entidad (pago o cancelación). */
  cancelForEntity(
    tx: DbTransaction,
    entityType: string,
    entityId: string,
    types: readonly NotificationType[],
  ): Promise<number> {
    return this.repository.cancelForEntity(tx, entityType, entityId, types);
  }

  /** `GET /notifications` (RF-005-01, RF-005-02; CA-005-21). */
  async list(
    userId: string,
    query: { unread?: boolean; limit?: number; cursor?: string },
  ): Promise<NotificationsPage> {
    const limit = Math.min(
      Math.max(query.limit ?? NOTIFICATIONS_DEFAULT_LIMIT, 1),
      NOTIFICATIONS_MAX_LIMIT,
    );
    const after = query.cursor === undefined ? null : decodeNotificationCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const [page, unreadCount] = await Promise.all([
      this.repository.list(this.db, userId, { unreadOnly: query.unread === true, limit, after }),
      this.repository.countUnread(this.db, userId),
    ]);
    return { items: page.items.map(toView), nextCursor: page.nextCursor, unreadCount };
  }

  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.repository.countUnread(this.db, userId) };
  }

  /** `POST /notifications/:id/read` (CA-005-22). Ajena o inexistente: 404. */
  async markRead(userId: string, id: string): Promise<void> {
    const found = await this.repository.markRead(this.db, userId, id, this.clock.now());
    if (!found) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
    }
  }

  /** `POST /notifications/read-all` (CA-005-22). */
  async markAllRead(userId: string): Promise<void> {
    await this.repository.markAllRead(this.db, userId, this.clock.now());
  }
}
