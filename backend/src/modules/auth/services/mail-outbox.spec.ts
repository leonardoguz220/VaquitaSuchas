import { jest } from '@jest/globals';
import type { MailMessage, MailService } from '../../../shared/ports/mail.service.js';
import { MailDeliveryError } from '../../../shared/ports/mail.service.js';
import { RetryMailJob } from '../jobs/retry-mail.job.js';
import { MailOutbox } from './mail-outbox.js';

const message: MailMessage = { to: 'a@example.com', subject: 's', html: '<p>h</p>', text: 'h' };

function outboxWith(send: jest.Mock<MailService['send']>): MailOutbox {
  return new MailOutbox({ send } as unknown as MailService);
}

describe('MailOutbox', () => {
  it('RF-003-10: un envío exitoso no deja pendientes', async () => {
    const outbox = outboxWith(jest.fn<MailService['send']>(() => Promise.resolve()));
    await outbox.send(message);
    expect(outbox.pendingCount()).toBe(0);
  });

  it('un envío fallido no lanza y queda para reintentar', async () => {
    const send = jest.fn<MailService['send']>(() => Promise.reject(new MailDeliveryError('x')));
    const outbox = outboxWith(send);
    await expect(outbox.send(message)).resolves.toBeUndefined();
    expect(outbox.pendingCount()).toBe(1);
  });

  it('el reintento exitoso vacía la cola', async () => {
    const send = jest
      .fn<MailService['send']>()
      .mockRejectedValueOnce(new MailDeliveryError('x'))
      .mockResolvedValue(undefined);
    const outbox = outboxWith(send);
    await outbox.send(message);
    await expect(outbox.retryPending()).resolves.toBe(1);
    expect(outbox.pendingCount()).toBe(0);
  });

  it('se descarta tras 3 intentos en total (1 envío + 2 reintentos)', async () => {
    const send = jest.fn<MailService['send']>(() => Promise.reject(new MailDeliveryError('x')));
    const outbox = outboxWith(send);
    await outbox.send(message);
    await expect(outbox.retryPending()).resolves.toBe(0);
    expect(outbox.pendingCount()).toBe(1);
    await expect(outbox.retryPending()).resolves.toBe(1);
    expect(outbox.pendingCount()).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('la tarea auth.retry_mail corre cada minuto y delega en la cola', async () => {
    const outbox = outboxWith(jest.fn<MailService['send']>(() => Promise.resolve()));
    const job = new RetryMailJob(outbox);
    expect(job.name).toBe('auth.retry_mail');
    expect(job.intervalSeconds).toBe(60);
    await expect(job.run({ now: new Date(), trigger: 'cron', db: {} as never })).resolves.toBe(0);
  });
});
