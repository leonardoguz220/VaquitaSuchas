import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '../clock/fake-clock.js';
import {
  InvalidStorageKeyError,
  StorageObjectExistsError,
  StorageObjectNotFoundError,
} from '../ports/file-storage.js';
import { deriveSigningKey, verifyLocalSignature } from './domain/local-signature.js';
import { LocalFileStorage } from './local-file-storage.js';

const SIGNING_KEY = deriveSigningKey('secreto-de-prueba-de-al-menos-32-caracteres');
const PNG = { contentType: 'image/png' };

describe('LocalFileStorage', () => {
  let directory: string;
  let clock: FakeClock;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vaquita-storage-'));
    clock = new FakeClock();
    storage = new LocalFileStorage({ directory, signingKey: SIGNING_KEY }, clock);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('RF-000-12: guarda el archivo dentro de la carpeta, creando los subdirectorios', async () => {
    await storage.put('receipts/g1/a.png', Buffer.from('contenido'), PNG);

    expect(await readFile(join(directory, 'receipts', 'g1', 'a.png'), 'utf8')).toBe('contenido');
  });

  it('RF-000-12: no deja archivos temporales tras guardar', async () => {
    await storage.put('a.png', Buffer.from('uno'), PNG);
    await storage.put('a.png', Buffer.from('dos'), PNG);

    expect(await readdir(directory)).toEqual(['a.png']);
    expect(await readFile(join(directory, 'a.png'), 'utf8')).toBe('dos');
  });

  it.each(['../fuera.png', 'a/../../fuera.png', '/etc/passwd', 'a\\..\\fuera.png', '..'])(
    'RF-000-12: la clave %s no puede salir de la carpeta',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'), PNG)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.exists(key)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.delete(key)).rejects.toThrow(InvalidStorageKeyError);
    },
  );

  it('RF-000-12: copia sin tocar el origen y se niega a pisar un destino', async () => {
    await storage.put('qr/a.png', Buffer.from('qr'), PNG);

    await storage.copy('qr/a.png', 'requests/r1/qr.png');

    expect(await readFile(join(directory, 'requests', 'r1', 'qr.png'), 'utf8')).toBe('qr');
    expect(await storage.exists('qr/a.png')).toBe(true);
    await expect(storage.copy('qr/a.png', 'requests/r1/qr.png')).rejects.toThrow(
      StorageObjectExistsError,
    );
  });

  it('RF-000-12: copiar un origen inexistente da StorageObjectNotFoundError', async () => {
    await expect(storage.copy('no/existe.png', 'b.png')).rejects.toThrow(
      StorageObjectNotFoundError,
    );
    expect(await storage.exists('b.png')).toBe(false);
  });

  it('RF-000-12: la URL firmada vence a los segundos pedidos según el reloj', async () => {
    await storage.put('receipts/a.png', Buffer.from('x'), PNG);

    const path = await storage.signedUrl('receipts/a.png', 300);

    const url = new URL(path, 'http://localhost');
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') ?? '';
    expect(url.pathname).toBe('/files/receipts/a.png');
    expect(expires).toBe(Math.floor(clock.now().getTime() / 1000) + 300);
    expect(
      verifyLocalSignature('receipts/a.png', expires, signature, SIGNING_KEY, clock.now()),
    ).toBe(true);
    clock.advance(300_000);
    expect(
      verifyLocalSignature('receipts/a.png', expires, signature, SIGNING_KEY, clock.now()),
    ).toBe(false);
  });

  it('RF-000-12: firmar un archivo inexistente da StorageObjectNotFoundError', async () => {
    await expect(storage.signedUrl('no/existe.png', 60)).rejects.toThrow(
      StorageObjectNotFoundError,
    );
  });

  it('RF-000-12: firmar con una vigencia inválida da InvalidStorageKeyError', async () => {
    await storage.put('a.png', Buffer.from('x'), PNG);

    await expect(storage.signedUrl('a.png', 0)).rejects.toThrow(InvalidStorageKeyError);
  });

  it('RF-000-12: borra y es idempotente', async () => {
    await storage.put('a.png', Buffer.from('x'), PNG);

    await storage.delete('a.png');
    await storage.delete('a.png');

    expect(await storage.exists('a.png')).toBe(false);
  });

  it('RF-000-12: exists distingue archivos presentes y ausentes', async () => {
    await storage.put('a/b.png', Buffer.from('x'), PNG);

    expect(await storage.exists('a/b.png')).toBe(true);
    expect(await storage.exists('a/c.png')).toBe(false);
    expect(await storage.exists('z/b.png')).toBe(false);
  });

  it('RF-000-12: la carpeta del almacén no se crea hasta que hace falta', async () => {
    const lazy = new LocalFileStorage(
      { directory: join(directory, 'aun-no-existe'), signingKey: SIGNING_KEY },
      clock,
    );

    expect(await lazy.exists('a.png')).toBe(false);
    await expect(stat(join(directory, 'aun-no-existe'))).rejects.toThrow();
  });
});
