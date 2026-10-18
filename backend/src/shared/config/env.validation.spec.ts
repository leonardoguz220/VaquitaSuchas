import { validateEnv } from './env.validation.js';

type RawEnv = Record<string, unknown>;

// Valores de prueba ficticios (no son secretos reales).
const HEX_32_BYTES = 'ab'.repeat(32);

function devEnv(): RawEnv {
  return {
    NODE_ENV: 'development',
    PORT: '3001',
    DATABASE_URL: 'postgresql://app:app@localhost:5432/vaquita',
    JWT_SECRET: 'j'.repeat(32),
    FINGERPRINT_KEY: 'fingerprint-test-key',
    CI_ENCRYPTION_KEY: HEX_32_BYTES,
    JOBS_TOKEN: HEX_32_BYTES,
    MAIL_MODE: 'dev',
    TELEGRAM_MODE: 'dev',
    STORAGE_DRIVER: 'local',
  };
}

function prodEnv(): RawEnv {
  return {
    ...devEnv(),
    NODE_ENV: 'production',
    MAIL_MODE: 'prod',
    TELEGRAM_MODE: 'prod',
    STORAGE_DRIVER: 'supabase',
    RESEND_API_KEY: 'resend-test-key',
    TELEGRAM_BOT_TOKEN: 'telegram-test-token',
    TELEGRAM_WEBHOOK_SECRET: 'telegram-test-secret',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_KEY: 'supabase-test-key',
    SUPABASE_BUCKET: 'receipts',
  };
}

function without(env: RawEnv, ...keys: string[]): RawEnv {
  const copy = { ...env };
  for (const key of keys) delete copy[key];
  return copy;
}

function errorMessageOf(env: RawEnv): string {
  try {
    validateEnv(env);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }
  throw new Error('validateEnv no lanzó un error y debía hacerlo');
}

describe('validateEnv', () => {
  describe('entorno válido', () => {
    it('acepta un entorno de desarrollo completo sin las variables del modo prod', () => {
      expect(() => validateEnv(devEnv())).not.toThrow();
    });

    it('acepta un entorno de producción completo', () => {
      expect(() => validateEnv(prodEnv())).not.toThrow();
    });

    it('conserva las variables que no valida (por ejemplo las del sistema)', () => {
      const result = validateEnv({ ...devEnv(), PATH: '/usr/bin' });

      expect(result['PATH']).toBe('/usr/bin');
      expect(result['DATABASE_URL']).toBe(devEnv()['DATABASE_URL']);
    });
  });

  describe('variables obligatorias (CA-000-05)', () => {
    it('CA-000-05: si falta DATABASE_URL falla y el mensaje nombra la variable', () => {
      const message = errorMessageOf(without(devEnv(), 'DATABASE_URL'));

      expect(message).toContain('DATABASE_URL');
    });

    it('CA-000-05: el mensaje nombra todas las variables faltantes, no solo la primera', () => {
      const missing = [
        'DATABASE_URL',
        'JWT_SECRET',
        'FINGERPRINT_KEY',
        'CI_ENCRYPTION_KEY',
        'JOBS_TOKEN',
      ];

      const message = errorMessageOf(without(devEnv(), ...missing));

      for (const name of missing) expect(message).toContain(name);
    });

    it('CA-000-05: con el entorno vacío nombra todas las obligatorias en un único error', () => {
      const required = [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'JWT_SECRET',
        'FINGERPRINT_KEY',
        'CI_ENCRYPTION_KEY',
        'JOBS_TOKEN',
        'MAIL_MODE',
        'TELEGRAM_MODE',
        'STORAGE_DRIVER',
      ];

      const message = errorMessageOf({});

      for (const name of required) expect(message).toContain(name);
    });

    it('CA-000-05: una variable en blanco (como en .env.example) cuenta como faltante', () => {
      const message = errorMessageOf({ ...devEnv(), DATABASE_URL: '', JWT_SECRET: '' });

      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_SECRET');
    });

    it('no nombra las variables que sí están bien', () => {
      const message = errorMessageOf(without(devEnv(), 'DATABASE_URL'));

      expect(message).not.toContain('JWT_SECRET');
      expect(message).not.toContain('MAIL_MODE');
    });
  });

  describe('modo prod', () => {
    it('MAIL_MODE=prod exige RESEND_API_KEY', () => {
      const message = errorMessageOf({ ...devEnv(), MAIL_MODE: 'prod' });

      expect(message).toContain('RESEND_API_KEY');
      expect(message).not.toContain('TELEGRAM_BOT_TOKEN');
      expect(message).not.toContain('SUPABASE_URL');
    });

    it('TELEGRAM_MODE=prod exige TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET', () => {
      const message = errorMessageOf({ ...devEnv(), TELEGRAM_MODE: 'prod' });

      expect(message).toContain('TELEGRAM_BOT_TOKEN');
      expect(message).toContain('TELEGRAM_WEBHOOK_SECRET');
      expect(message).not.toContain('RESEND_API_KEY');
    });

    it('STORAGE_DRIVER=supabase exige las credenciales del almacén', () => {
      const message = errorMessageOf({ ...devEnv(), STORAGE_DRIVER: 'supabase' });

      expect(message).toContain('SUPABASE_URL');
      expect(message).toContain('SUPABASE_SERVICE_KEY');
      expect(message).toContain('SUPABASE_BUCKET');
      expect(message).not.toContain('RESEND_API_KEY');
    });

    it('con los tres servicios en prod nombra todas las credenciales faltantes a la vez', () => {
      const credentials = [
        'RESEND_API_KEY',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_WEBHOOK_SECRET',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_KEY',
        'SUPABASE_BUCKET',
      ];

      const message = errorMessageOf(without(prodEnv(), ...credentials));

      for (const name of credentials) expect(message).toContain(name);
    });

    it('una credencial de prod en blanco cuenta como faltante', () => {
      const message = errorMessageOf({ ...prodEnv(), RESEND_API_KEY: '' });

      expect(message).toContain('RESEND_API_KEY');
    });

    it('en dev y local no se exigen las credenciales de prod', () => {
      expect(() => validateEnv(devEnv())).not.toThrow();
      expect(() => validateEnv({ ...devEnv(), RESEND_API_KEY: '' })).not.toThrow();
    });
  });

  describe('valores inválidos', () => {
    it.each([
      ['MAIL_MODE', 'smtp'],
      ['TELEGRAM_MODE', 'live'],
      ['STORAGE_DRIVER', 's3'],
      ['NODE_ENV', 'staging'],
    ])('rechaza %s con un valor fuera de los permitidos', (name, value) => {
      const message = errorMessageOf({ ...devEnv(), [name]: value });

      expect(message).toContain(name);
    });

    it('indica los valores permitidos de un enum', () => {
      const message = errorMessageOf({ ...devEnv(), MAIL_MODE: 'smtp' });

      expect(message).toContain('dev');
      expect(message).toContain('prod');
    });

    it.each([['abc'], ['3001.5'], ['0'], ['70000'], ['-1']])('rechaza PORT=%s', (port) => {
      const message = errorMessageOf({ ...devEnv(), PORT: port });

      expect(message).toContain('PORT');
    });

    it('acepta PORT numérico en texto, como llega desde process.env', () => {
      expect(() => validateEnv({ ...devEnv(), PORT: '8080' })).not.toThrow();
    });

    it('rechaza una DATABASE_URL que no es una URL de PostgreSQL', () => {
      const message = errorMessageOf({ ...devEnv(), DATABASE_URL: 'TODO' });

      expect(message).toContain('DATABASE_URL');
    });

    it('rechaza un JWT_SECRET de menos de 32 caracteres', () => {
      const message = errorMessageOf({ ...devEnv(), JWT_SECRET: 'corto' });

      expect(message).toContain('JWT_SECRET');
    });

    it('rechaza una CI_ENCRYPTION_KEY que no son 32 bytes en hexadecimal o base64', () => {
      const message = errorMessageOf({ ...devEnv(), CI_ENCRYPTION_KEY: 'abcd' });

      expect(message).toContain('CI_ENCRYPTION_KEY');
    });

    it('acepta una CI_ENCRYPTION_KEY de 32 bytes en base64', () => {
      const base64Key = Buffer.alloc(32, 7).toString('base64');

      expect(() => validateEnv({ ...devEnv(), CI_ENCRYPTION_KEY: base64Key })).not.toThrow();
    });

    it('rechaza un JOBS_TOKEN de menos de 32 caracteres', () => {
      const message = errorMessageOf({ ...devEnv(), JOBS_TOKEN: 'corto' });

      expect(message).toContain('JOBS_TOKEN');
    });
  });

  describe('seguridad: el mensaje no filtra valores', () => {
    it('nunca imprime los valores de las variables inválidas, solo sus nombres', () => {
      const leaked = 'VALOR-SECRETO-NO-FILTRAR';
      const env: RawEnv = {
        ...devEnv(),
        NODE_ENV: leaked,
        PORT: leaked,
        DATABASE_URL: leaked,
        JWT_SECRET: leaked.slice(0, 10),
        CI_ENCRYPTION_KEY: leaked,
        JOBS_TOKEN: leaked.slice(0, 10),
        MAIL_MODE: leaked,
        TELEGRAM_MODE: leaked,
        STORAGE_DRIVER: leaked,
      };

      const message = errorMessageOf(env);

      expect(message).not.toContain('VALOR-SECRETO');
      expect(message).not.toContain(leaked.slice(0, 10));
      for (const name of [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'JWT_SECRET',
        'CI_ENCRYPTION_KEY',
        'JOBS_TOKEN',
      ]) {
        expect(message).toContain(name);
      }
    });

    it('no imprime el valor de los secretos válidos cuando otra variable falla', () => {
      const env = without(prodEnv(), 'TELEGRAM_BOT_TOKEN');

      const message = errorMessageOf(env);

      expect(message).not.toContain(String(env['JWT_SECRET']));
      expect(message).not.toContain(String(env['RESEND_API_KEY']));
      expect(message).not.toContain(String(env['SUPABASE_SERVICE_KEY']));
    });
  });
});
