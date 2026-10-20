import { deriveSigningKey } from './local-signature.js';

// Interpreta las variables de entorno del almacén (RF-000-12). validateEnv ya comprobó que existen;
// aquí se convierten en una configuración tipada. Los errores nombran la variable, nunca su valor.

export type StorageSettings =
  | { readonly driver: 'local'; readonly directory: string; readonly signingKey: Buffer }
  | {
      readonly driver: 'supabase';
      readonly url: string;
      readonly serviceKey: string;
      readonly bucket: string;
    };

export const DEFAULT_LOCAL_DIR = '.storage';

type EnvReader = (name: string) => string | undefined;

function readRequired(read: EnvReader, name: string, condition: string): string {
  const value = read(name)?.trim();
  if (!value) throw new Error(`${name}: falta (obligatoria con ${condition}).`);
  return value;
}

export function readStorageSettings(read: EnvReader): StorageSettings {
  if (read('STORAGE_DRIVER') === 'supabase') {
    const condition = 'STORAGE_DRIVER=supabase';
    return {
      driver: 'supabase',
      url: readRequired(read, 'SUPABASE_URL', condition).replace(/\/+$/, ''),
      serviceKey: readRequired(read, 'SUPABASE_SERVICE_KEY', condition),
      bucket: readRequired(read, 'SUPABASE_BUCKET', condition),
    };
  }
  return {
    driver: 'local',
    directory: read('STORAGE_LOCAL_DIR')?.trim() || DEFAULT_LOCAL_DIR,
    signingKey: deriveSigningKey(readRequired(read, 'JWT_SECRET', 'siempre')),
  };
}
