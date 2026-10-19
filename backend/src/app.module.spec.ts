import { jest } from '@jest/globals';

// Entorno mínimo válido con valores ficticios: el módulo raíz exige variables (RF-000-08),
// pero sigue sin necesitar una base de datos levantada.
const MINIMAL_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/vaquita_test',
  JWT_SECRET: 'j'.repeat(32),
  FINGERPRINT_KEY: 'fingerprint-test-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN: 'cd'.repeat(32),
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
  STORAGE_DRIVER: 'local',
};

// ConfigModule.forRoot lee el entorno cuando se evalúa app.module.ts, así que el módulo
// se importa después de preparar process.env y con el registro de módulos limpio. `Test` se
// importa también aquí: tras `resetModules`, @nestjs/schedule trae su propia copia de
// @nestjs/core y el `Reflector` solo coincide si @nestjs/testing sale del mismo registro.
async function loadAppModule(): Promise<{
  AppModule: typeof import('./app.module.js').AppModule;
  Test: typeof import('@nestjs/testing').Test;
}> {
  jest.resetModules();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('./app.module.js');
  return { AppModule, Test };
}

describe('AppModule', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, MINIMAL_ENV);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('RF-000-01: compila el módulo raíz del backend sin base de datos', async () => {
    const { AppModule, Test } = await loadAppModule();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
  });

  it('RF-000-08 / CA-000-05: el módulo raíz no compila si falta DATABASE_URL y la nombra', async () => {
    delete process.env['DATABASE_URL'];
    const { AppModule, Test } = await loadAppModule();

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /DATABASE_URL/,
    );
  });
});
