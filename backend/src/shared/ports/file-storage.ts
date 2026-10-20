/** Opciones de `FileStorage.put`. */
export interface PutOptions {
  /** Tipo MIME del archivo, por ejemplo `image/png`. Lo devuelve el almacén al servirlo. */
  readonly contentType: string;
}

/**
 * Puerto del almacén de archivos (comprobantes y QR; RF-000-12, `research.md` R3). Los servicios
 * de negocio dependen solo de esta clase; `StorageModule` decide por `STORAGE_DRIVER` si los
 * archivos van a una carpeta no pública (`local`) o a Supabase Storage (`supabase`). Es una clase
 * abstracta para que sirva de token de inyección.
 *
 * Las claves (`key`) son rutas relativas con `/`, por ejemplo `receipts/<grupo>/<archivo>.png`;
 * una clave inválida lanza `InvalidStorageKeyError` sin tocar el almacén. Ningún error incluye
 * credenciales ni el contenido de los archivos.
 */
export abstract class FileStorage {
  /** Guarda `body` en `key`; si ya existía lo reemplaza. */
  abstract put(key: string, body: Uint8Array, options: PutOptions): Promise<void>;

  /**
   * Copia `source` en `destination` (la spec 010 copia el QR de pago a la solicitud).
   * Lanza `StorageObjectNotFoundError` si `source` no existe y `StorageObjectExistsError` si
   * `destination` ya existe: una copia nunca pisa un archivo.
   */
  abstract copy(source: string, destination: string): Promise<void>;

  /**
   * URL temporal para leer `key`, válida `expiresInSeconds` segundos (entero entre 1 y 604800).
   * Lanza `StorageObjectNotFoundError` si el archivo no existe.
   */
  abstract signedUrl(key: string, expiresInSeconds: number): Promise<string>;

  /** Borra `key`. Es idempotente: borrar algo que no existe no es un error. */
  abstract delete(key: string): Promise<void>;

  abstract exists(key: string): Promise<boolean>;
}

/** La clave o la vigencia no cumplen el contrato; no se intentó ningún acceso al almacén. */
export class InvalidStorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStorageKeyError';
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super('El archivo no existe en el almacén.');
    this.name = 'StorageObjectNotFoundError';
  }
}

export class StorageObjectExistsError extends Error {
  constructor() {
    super('El archivo de destino ya existe en el almacén.');
    this.name = 'StorageObjectExistsError';
  }
}

/** El almacén no pudo completar la operación (red, permisos, disco). Solo estado, sin detalles. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}
