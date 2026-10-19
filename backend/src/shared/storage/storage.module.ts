import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock/clock.js';
import { FileStorage } from '../ports/file-storage.js';
import { readStorageSettings, type StorageSettings } from './domain/storage-settings.js';
import { LocalFileStorage } from './local-file-storage.js';
import { type FetchFn, SupabaseFileStorage } from './supabase-file-storage.js';

/** Elige la implementación de `FileStorage` según `STORAGE_DRIVER`. */
export function createFileStorage(
  settings: StorageSettings,
  clock: Clock,
  fetchFn: FetchFn = fetch,
): FileStorage {
  if (settings.driver === 'local') {
    return new LocalFileStorage(
      { directory: settings.directory, signingKey: settings.signingKey },
      clock,
    );
  }
  return new SupabaseFileStorage(
    { url: settings.url, serviceKey: settings.serviceKey, bucket: settings.bucket },
    fetchFn,
  );
}

/**
 * Registra el puerto `FileStorage` (RF-000-12). Global para que cualquier servicio lo inyecte sin
 * importar este módulo ni conocer el driver. Con `STORAGE_DRIVER=local` los archivos van a una
 * carpeta no pública; con `supabase`, a un bucket privado de Supabase Storage.
 */
@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      global: true,
      providers: [
        {
          provide: FileStorage,
          inject: [ConfigService, Clock],
          useFactory: (config: ConfigService, clock: Clock): FileStorage =>
            createFileStorage(
              readStorageSettings((name) => config.get<string>(name)),
              clock,
            ),
        },
      ],
      exports: [FileStorage],
    };
  }
}
