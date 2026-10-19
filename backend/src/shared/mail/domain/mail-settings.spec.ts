import { readMailSettings } from './mail-settings.js';

const reader =
  (env: Record<string, string>) =>
  (name: string): string | undefined =>
    env[name];

describe('readMailSettings', () => {
  it('RF-000-12: en dev usa Mailpit en localhost:1025 y un remitente local por defecto', () => {
    expect(readMailSettings(reader({ MAIL_MODE: 'dev' }))).toEqual({
      mode: 'dev',
      host: 'localhost',
      port: 1025,
      from: { name: 'Vaquita', address: 'no-reply@vaquita.local' },
    });
  });

  it('RF-000-12: en dev respeta SMTP_HOST, SMTP_PORT y MAIL_FROM', () => {
    const settings = readMailSettings(
      reader({
        MAIL_MODE: 'dev',
        SMTP_HOST: 'mail',
        SMTP_PORT: '2525',
        MAIL_FROM: 'otro@vaquita.test',
      }),
    );

    expect(settings).toEqual({
      mode: 'dev',
      host: 'mail',
      port: 2525,
      from: { address: 'otro@vaquita.test' },
    });
  });

  it.each(['0', '70000', 'abc', '10.5'])('RF-000-12: rechaza SMTP_PORT=%s', (port) => {
    expect(() => readMailSettings(reader({ MAIL_MODE: 'dev', SMTP_PORT: port }))).toThrow(
      /SMTP_PORT/,
    );
  });

  it('RF-000-12: en prod usa Resend por defecto', () => {
    const settings = readMailSettings(
      reader({ MAIL_MODE: 'prod', RESEND_API_KEY: 're_clave', MAIL_FROM: 'Vaquita <a@b.com>' }),
    );

    expect(settings).toEqual({
      mode: 'prod',
      provider: 'resend',
      apiKey: 're_clave',
      from: { name: 'Vaquita', address: 'a@b.com' },
    });
  });

  it('RF-000-12: MAIL_PROVIDER=brevo usa BREVO_API_KEY', () => {
    const settings = readMailSettings(
      reader({
        MAIL_MODE: 'prod',
        MAIL_PROVIDER: 'brevo',
        BREVO_API_KEY: 'xkeysib-clave',
        RESEND_API_KEY: 're_otra',
        MAIL_FROM: 'a@b.com',
      }),
    );

    expect(settings).toMatchObject({ mode: 'prod', provider: 'brevo', apiKey: 'xkeysib-clave' });
  });

  it('RF-000-12: en prod falta la clave o el remitente y el error nombra la variable, no su valor', () => {
    expect(() => readMailSettings(reader({ MAIL_MODE: 'prod', MAIL_FROM: 'a@b.com' }))).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() =>
      readMailSettings(reader({ MAIL_MODE: 'prod', RESEND_API_KEY: 're_clave' })),
    ).toThrow(/MAIL_FROM/);
    expect(() =>
      readMailSettings(
        reader({ MAIL_MODE: 'prod', RESEND_API_KEY: 're_clave', MAIL_FROM: 'inválido' }),
      ),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('inválido') }));
  });
});
