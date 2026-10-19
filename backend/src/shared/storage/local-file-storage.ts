import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Clock } from '../clock/clock.js';
import {
  FileStorage,
  StorageError,
  StorageObjectExistsError,
  StorageObjectNotFoundError,
  type PutOptions,
} from '../ports/file-storage.js';
import { buildLocalSignedPath } from './domain/local-signature.js';
import { validateSignedUrlTtl, validateStorageKey } from './domain/storage-key.js';

// Modo `local` de FileStorage (RF-000-12, research.md R3): desarrollo y CI. Los archivos viven en
// una carpeta fuera de cualquier ruta pública; la «URL firmada» es una ruta del backend con firma
// HMAC y vencimiento (domain/local-signature.ts).

export interface LocalStorageOptions {
  readonly directory: string;
  readonly signingKey: Buffer;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isExisting(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

export class LocalFileStorage extends FileStorage {
  private readonly root: string;

  constructor(
    private readonly options: LocalStorageOptions,
    private readonly clock: Clock,
  ) {
    super();
    this.root = resolve(options.directory);
  }

  /** Ruta absoluta de una clave ya validada; nunca sale de la carpeta raíz. */
  private pathOf(key: string): string {
    validateStorageKey(key);
    const path = resolve(this.root, ...key.split('/'));
    if (!path.startsWith(this.root + sep)) {
      throw new StorageError('La clave apunta fuera del almacén.');
    }
    return path;
  }

  async put(key: string, body: Uint8Array, _options: PutOptions): Promise<void> {
    const path = this.pathOf(key);
    // Se escribe en un temporal y se renombra: nadie lee un archivo a medio escribir.
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temp, body);
      await rename(temp, path);
    } catch {
      await rm(temp, { force: true }).catch(() => undefined);
      throw new StorageError('No se pudo guardar el archivo en el almacén local.');
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    const from = this.pathOf(source);
    const to = this.pathOf(destination);
    if (!(await this.has(from))) throw new StorageObjectNotFoundError();
    try {
      await mkdir(dirname(to), { recursive: true });
      // COPYFILE_EXCL: falla si el destino existe, sin carrera entre comprobar y copiar.
      await copyFile(from, to, 1);
    } catch (error) {
      if (isExisting(error)) throw new StorageObjectExistsError();
      if (isMissing(error)) throw new StorageObjectNotFoundError();
      throw new StorageError('No se pudo copiar el archivo en el almacén local.');
    }
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const path = this.pathOf(key);
    validateSignedUrlTtl(expiresInSeconds);
    if (!(await this.has(path))) throw new StorageObjectNotFoundError();
    const expiresAt = Math.floor(this.clock.now().getTime() / 1000) + expiresInSeconds;
    return buildLocalSignedPath(key, expiresAt, this.options.signingKey);
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key);
    try {
      await rm(path, { force: true });
    } catch {
      throw new StorageError('No se pudo borrar el archivo del almacén local.');
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.has(this.pathOf(key));
  }

  private async has(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new StorageError('No se pudo consultar el almacén local.');
    }
  }
}
