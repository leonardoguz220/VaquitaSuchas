import { jest } from '@jest/globals';
import { FakeClock } from '../clock/fake-clock.js';
import { deriveSigningKey } from './domain/local-signature.js';
import type { StorageSettings } from './domain/storage-settings.js';
import { LocalFileStorage } from './local-file-storage.js';
import { createFileStorage } from './storage.module.js';
import { type FetchFn, SupabaseFileStorage } from './supabase-file-storage.js';

const clock = new FakeClock();

describe('createFileStorage', () => {
  it('RF-000-12: STORAGE_DRIVER=local elige la carpeta local y nunca toca fetch', () => {
    const fetchFn = jest.fn<FetchFn>();
    const settings: StorageSettings = {
      driver: 'local',
      directory: '.storage',
      signingKey: deriveSigningKey('secreto-de-prueba-de-al-menos-32-caracteres'),
    };

    expect(createFileStorage(settings, clock, fetchFn)).toBeInstanceOf(LocalFileStorage);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('RF-000-12: STORAGE_DRIVER=supabase elige Supabase Storage', () => {
    const settings: StorageSettings = {
      driver: 'supabase',
      url: 'https://abc.supabase.co',
      serviceKey: 'clave-ficticia',
      bucket: 'comprobantes',
    };

    expect(createFileStorage(settings, clock)).toBeInstanceOf(SupabaseFileStorage);
  });
});
