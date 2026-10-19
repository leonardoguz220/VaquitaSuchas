import {
  FileStorage,
  StorageError,
  StorageObjectExistsError,
  StorageObjectNotFoundError,
  type PutOptions,
} from '../ports/file-storage.js';
import { encodeKeyForUrl, validateSignedUrlTtl, validateStorageKey } from './domain/storage-key.js';

// Modo `supabase` de FileStorage (RF-000-12, research.md R3): Supabase Storage con un bucket
// privado y la clave de servicio, que solo vive en el servidor. El cliente nunca recibe
// credenciales: lee con URLs firmadas de vigencia corta.

export type FetchFn = typeof fetch;

export interface SupabaseStorageOptions {
  /** URL del proyecto, sin barra final: `https://<ref>.supabase.co`. */
  readonly url: string;
  readonly serviceKey: string;
  readonly bucket: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export class SupabaseFileStorage extends FileStorage {
  constructor(
    private readonly options: SupabaseStorageOptions,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    super();
  }

  private get base(): string {
    return `${this.options.url}/storage/v1`;
  }

  private objectUrl(key: string): string {
    validateStorageKey(key);
    return `${this.base}/object/${encodeURIComponent(this.options.bucket)}/${encodeKeyForUrl(key)}`;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        ...init,
        headers: {
          apikey: this.options.serviceKey,
          Authorization: `Bearer ${this.options.serviceKey}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new StorageError('No se pudo conectar con Supabase Storage.');
    }
  }

  /**
   * Supabase a veces responde HTTP 400 con `statusCode: "404"` en el cuerpo (por ejemplo al firmar
   * un objeto inexistente), así que el estado efectivo sale del cuerpo si lo trae.
   */
  private async effectiveStatus(response: Response): Promise<number> {
    try {
      const body = (await response.json()) as { statusCode?: string | number };
      const status = Number(body.statusCode);
      if (Number.isInteger(status) && status >= 400) return status;
    } catch {
      // Cuerpo vacío o que no es JSON: vale el estado HTTP.
    }
    return response.status;
  }

  private async fail(response: Response, action: string): Promise<never> {
    const status = await this.effectiveStatus(response);
    if (status === HTTP_NOT_FOUND) throw new StorageObjectNotFoundError();
    if (status === HTTP_CONFLICT) throw new StorageObjectExistsError();
    // Solo el estado: el cuerpo de Supabase puede repetir rutas o datos del proyecto.
    throw new StorageError(`Supabase Storage rechazó ${action} (HTTP ${status}).`);
  }

  async put(key: string, body: Uint8Array, options: PutOptions): Promise<void> {
    const response = await this.call(this.objectUrl(key), {
      method: 'POST',
      headers: { 'Content-Type': options.contentType, 'x-upsert': 'true' },
      body,
    });
    if (!response.ok) await this.fail(response, 'guardar el archivo');
  }

  async copy(source: string, destination: string): Promise<void> {
    validateStorageKey(source);
    validateStorageKey(destination);
    const response = await this.call(`${this.base}/object/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucketId: this.options.bucket,
        sourceKey: source,
        destinationKey: destination,
      }),
    });
    if (!response.ok) await this.fail(response, 'copiar el archivo');
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    validateStorageKey(key);
    validateSignedUrlTtl(expiresInSeconds);
    const url = `${this.base}/object/sign/${encodeURIComponent(this.options.bucket)}/${encodeKeyForUrl(key)}`;
    const response = await this.call(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!response.ok) await this.fail(response, 'firmar la URL');
    let signedPath: unknown;
    try {
      signedPath = ((await response.json()) as { signedURL?: unknown }).signedURL;
    } catch {
      signedPath = undefined;
    }
    if (typeof signedPath !== 'string' || !signedPath.startsWith('/')) {
      throw new StorageError('Supabase Storage devolvió una URL firmada inesperada.');
    }
    return `${this.base}${signedPath}`;
  }

  async delete(key: string): Promise<void> {
    const response = await this.call(this.objectUrl(key), { method: 'DELETE' });
    if (response.ok) return;
    // Borrar algo que ya no está no es un error (idempotente).
    if ((await this.effectiveStatus(response)) === HTTP_NOT_FOUND) return;
    await this.fail(response, 'borrar el archivo');
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.call(this.objectUrl(key), { method: 'HEAD' });
    if (response.ok) return true;
    // HEAD no trae cuerpo: Supabase responde 400 o 404 cuando el objeto no existe.
    if (response.status === 400 || response.status === HTTP_NOT_FOUND) return false;
    throw new StorageError(`Supabase Storage rechazó la consulta (HTTP ${response.status}).`);
  }
}
