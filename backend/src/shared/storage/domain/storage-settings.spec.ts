import { DEFAULT_LOCAL_DIR, readStorageSettings } from './storage-settings.js';

function env(values: Record<string, string>): (name: string) => string | undefined {
  return (name) => values[name];
}

describe('readStorageSettings', () => {
  it('RF-000-12: STORAGE_DRIVER=local usa la carpeta por omisión y deriva la clave de firma', () => {
    const settings = readStorageSettings(
      env({ STORAGE_DRIVER: 'local', JWT_SECRET: 's'.repeat(32) }),
    );

    expect(settings).toMatchObject({ driver: 'local', directory: DEFAULT_LOCAL_DIR });
    expect(settings.driver === 'local' && settings.signingKey.length).toBe(32);
  });

  it('RF-000-12: STORAGE_LOCAL_DIR cambia la carpeta', () => {
    const settings = readStorageSettings(
      env({
        STORAGE_DRIVER: 'local',
        JWT_SECRET: 's'.repeat(32),
        STORAGE_LOCAL_DIR: ' /var/vaquita ',
      }),
    );

    expect(settings).toMatchObject({ driver: 'local', directory: '/var/vaquita' });
  });

  it('RF-000-12: STORAGE_DRIVER=supabase lee URL, clave y bucket, sin barra final', () => {
    const settings = readStorageSettings(
      env({
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://abc.supabase.co//',
        SUPABASE_SERVICE_KEY: 'clave-ficticia',
        SUPABASE_BUCKET: 'comprobantes',
      }),
    );

    expect(settings).toEqual({
      driver: 'supabase',
      url: 'https://abc.supabase.co',
      serviceKey: 'clave-ficticia',
      bucket: 'comprobantes',
    });
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BUCKET'])(
    'RF-000-12: con supabase falta %s y el error la nombra',
    (missing) => {
      const values: Record<string, string> = {
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_SERVICE_KEY: 'clave-ficticia',
        SUPABASE_BUCKET: 'comprobantes',
      };
      delete values[missing];

      expect(() => readStorageSettings(env(values))).toThrow(missing);
    },
  );

  it('RF-000-12: el error de configuración no repite valores secretos', () => {
    const values = { STORAGE_DRIVER: 'supabase', SUPABASE_SERVICE_KEY: 'clave-secreta-123' };

    expect(() => readStorageSettings(env(values))).not.toThrow(/clave-secreta-123/);
  });
});
