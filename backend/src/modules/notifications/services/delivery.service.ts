import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { InvalidMailMessageError, MailService } from '../../../shared/ports/mail.service.js';
import { deliveryPlan, inSendWindow, nextWindowOpening } from '../domain/delivery-rules.js';
import { buildEmailContent } from '../domain/email-content.js';
import { nextRetry } from '../domain/retry.js';
import { Clock } from '../../../shared/clock/clock.js';
import { DeliveriesRepository, type DueDelivery } from '../repositories/deliveries.repository.js';
import { UnsubscribeLinksService } from './unsubscribe-links.service.js';

export const DELIVERY_BATCH_SIZE = 50;
const MAX_BATCHES_PER_RUN = 20;

/**
 * Tarea `notifications.deliver` (RF-005-19, RF-005-20, RNF-005-03, RNF-005-04). Toma lotes de
 * envíos de correo pendientes con `FOR UPDATE SKIP LOCKED` (dos ejecuciones nunca mandan el mismo),
 * vuelve a comprobar cuenta y preferencias, respeta la ventana horaria de los recordatorios y
 * reintenta a los 5 minutos, 30 minutos y 2 horas. Un fallo del proveedor solo afecta al envío;
 * la notificación dentro de la app y la operación del usuario no se tocan. Nunca registra
 * direcciones ni texto de avisos.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly deliveries: DeliveriesRepository,
    private readonly mail: MailService,
    private readonly links: UnsubscribeLinksService,
  ) {}

  /** Devuelve cuántos envíos resolvió (enviados, omitidos, fallidos o reprogramados por fallo). */
  async deliver(now: Date = this.clock.now()): Promise<number> {
    let processed = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const handled = await this.db.withTransaction(async (tx) => {
        const due = await this.deliveries.claimDueEmails(tx, now, DELIVERY_BATCH_SIZE);
        let count = 0;
        for (const item of due) count += await this.process(tx, item, now);
        return { claimed: due.length, count };
      });
      processed += handled.count;
      if (handled.claimed < DELIVERY_BATCH_SIZE) break;
    }
    return processed;
  }

  private async process(
    tx: Parameters<DeliveriesRepository['markSent']>[0],
    item: DueDelivery,
    now: Date,
  ): Promise<number> {
    // Se vuelve a decidir con el estado de hoy: la cuenta o las preferencias pudieron cambiar.
    const [decision] = deliveryPlan(
      { category: item.category, timing: item.respectWindow ? 'ventana' : 'inmediato' },
      item.prefs,
      { status: item.userStatus },
      ['email'],
    );
    if (decision?.status === 'skipped') {
      await this.deliveries.markSkipped(tx, item.id, decision.reason);
      return 1;
    }
    if (item.respectWindow && !inSendWindow(now)) {
      await this.deliveries.defer(tx, item.id, nextWindowOpening(now));
      return 0;
    }

    const attempts = item.attempts + 1;
    try {
      const content = buildEmailContent({
        type: item.type,
        title: item.title,
        body: item.body,
        link: item.link,
        appUrl: this.links.appUrl,
        unsubscribeUrl: this.links.urlFor(item.userId, item.category),
      });
      await this.mail.send({ to: item.userEmail, ...content });
      await this.deliveries.markSent(tx, item.id, now, attempts);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      // Un mensaje inválido no mejora al reintentar.
      const next =
        error instanceof InvalidMailMessageError
          ? ({ status: 'failed' } as const)
          : nextRetry(attempts, now);
      await this.deliveries.markAttemptFailed(tx, item.id, attempts, next, name);
      // Solo el id del envío y el tipo de error: sin dirección ni texto del aviso.
      this.logger.warn(
        `Envío ${item.id} falló (${name}): ${next.status === 'failed' ? 'agotado' : 'se reintentará'}.`,
      );
    }
    return 1;
  }
}
