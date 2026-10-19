import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClockModule } from '../src/shared/clock/clock.module.js';
import { FileStorage } from '../src/shared/ports/file-storage.js';
import { createFileStorage, StorageModule } from '../src/shared/storage/storage.module.js';
import { LocalFileStorage } from '../src/shared/storage/local-file-storage.js';
import { SupabaseFileStorage } from '../src/shared/storage/supabase-file-storage.js';
import { SystemClock } from '../src/shared/clock/system-clock.js';
import { createFakeSupabaseFetch } from './support/fake-supabase-storage.js';
import { describeFileStorageContract } from './support/file-storage.contract.js';

// RF-000-12: el puerto FileStorage se comporta igual con cualquier driver. El driver `local` es el
// de CI y desarrollo; el de Supabase se ejerce contra un servidor simulado (sin red ni
// credenciales), y la inyección por STORAGE_DRIVER se comprueba con el módulo real.

const SUPABASE = {
  url: 'https://proyecto-ficticio.supabase.co',
  serviceKey: 'clave-de-servicio-ficticia',
  bucket: 'comprobantes',
};

describe('FileStorage con el driver local', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vaquita-contract-'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describeFileStorageContract(
    'local',
    () => new LocalFileStorage({ directory, signingKey: Buffer.alloc(32, 7) }, new SystemClock()),
  );
});

describeFileStorageContract(
  'supabase (servidor simulado)',
  () => new SupabaseFileStorage(SUPABASE, createFakeSupabaseFetch(SUPABASE)),
);

describe('StorageModule', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function resolveStorage(env: Record<string, string>): Promise<FileStorage> {
    Object.assign(process.env, env);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ClockModule,
        StorageModule.forRoot(),
      ],
    }).compile();
    return moduleRef.get(FileStorage);
  }

  it('RF-000-12: STORAGE_DRIVER=local inyecta el driver local', async () => {
    const storage = await resolveStorage({
      STORAGE_DRIVER: 'local',
      JWT_SECRET: 'j'.repeat(32),
      STORAGE_LOCAL_DIR: join(tmpdir(), 'vaquita-module-no-se-escribe'),
    });

    expect(storage).toBeInstanceOf(LocalFileStorage);
  });

  it('RF-000-12: STORAGE_DRIVER=supabase inyecta el driver de Supabase', async () => {
    const storage = await resolveStorage({
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: SUPABASE.url,
      SUPABASE_SERVICE_KEY: SUPABASE.serviceKey,
      SUPABASE_BUCKET: SUPABASE.bucket,
    });

    expect(storage).toBeInstanceOf(SupabaseFileStorage);
  });

  it('RF-000-12: createFileStorage con el driver local no usa la red', () => {
    expect(
      createFileStorage(
        { driver: 'local', directory: '.storage', signingKey: Buffer.alloc(32) },
        new SystemClock(),
        () => {
          throw new Error('no debe llamar a fetch');
        },
      ),
    ).toBeInstanceOf(LocalFileStorage);
  });
});
