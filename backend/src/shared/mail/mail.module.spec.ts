import { jest } from '@jest/globals';
import { FakeClock } from '../clock/fake-clock.js';
import type { MailSettings } from './domain/mail-settings.js';
import { BrevoMailService, ResendMailService, type FetchFn } from './http-mail.service.js';
import { createMailService } from './mail.module.js';
import { SmtpMailService } from './smtp-mail.service.js';

const FROM = { address: 'no-reply@vaquita.app' };
const clock = new FakeClock();

describe('createMailService', () => {
  it('RF-000-12: MAIL_MODE=dev elige el transporte SMTP y nunca toca fetch', () => {
    const fetchFn = jest.fn<FetchFn>();
    const settings: MailSettings = { mode: 'dev', host: 'localhost', port: 1025, from: FROM };

    expect(createMailService(settings, clock, fetchFn)).toBeInstanceOf(SmtpMailService);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('RF-000-12: MAIL_MODE=prod elige Resend por defecto', () => {
    const settings: MailSettings = { mode: 'prod', provider: 'resend', apiKey: 'k', from: FROM };

    expect(createMailService(settings, clock)).toBeInstanceOf(ResendMailService);
  });

  it('RF-000-12: MAIL_PROVIDER=brevo elige Brevo', () => {
    const settings: MailSettings = { mode: 'prod', provider: 'brevo', apiKey: 'k', from: FROM };

    expect(createMailService(settings, clock)).toBeInstanceOf(BrevoMailService);
  });
});
