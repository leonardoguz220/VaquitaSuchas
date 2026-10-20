import {
  type FileStorage,
  InvalidStorageKeyError,
  StorageObjectExistsError,
  StorageObjectNotFoundError,
} from '../../src/shared/ports/file-storage.js';

// Contrato común a todos los drivers de FileStorage (RF-000-12, research.md R3). Cada driver
// ejecuta esta misma batería: lo que aquí se afirma es lo que los servicios de negocio pueden
// asumir sin saber qué driver está activo.

const PNG = { contentType: 'image/png' };
let counter = 0;

/** Clave única por prueba: los drivers remotos comparten bucket entre ejecuciones. */
function uniqueKey(name: string): string {
  counter += 1;
  return `contract/${process.pid}-${Date.now()}-${counter}/${name}`;
}

export function describeFileStorageContract(
  driverName: string,
  create: () => FileStorage | Promise<FileStorage>,
): void {
  describe(`contrato de FileStorage: driver ${driverName}`, () => {
    let storage: FileStorage;

    beforeAll(async () => {
      storage = await create();
    });

    it('RF-000-12: put guarda y exists lo ve', async () => {
      const key = uniqueKey('a.png');
      expect(await storage.exists(key)).toBe(false);

      await storage.put(key, Buffer.from('contenido'), PNG);

      expect(await storage.exists(key)).toBe(true);
      await storage.delete(key);
    });

    it('RF-000-12: put sobre una clave existente la reemplaza', async () => {
      const key = uniqueKey('a.png');

      await storage.put(key, Buffer.from('uno'), PNG);
      await storage.put(key, Buffer.from('dos'), PNG);

      expect(await storage.exists(key)).toBe(true);
      await storage.delete(key);
    });

    it('RF-000-12: copy crea el destino y conserva el origen', async () => {
      const source = uniqueKey('qr.png');
      const destination = uniqueKey('copia.png');
      await storage.put(source, Buffer.from('qr'), PNG);

      await storage.copy(source, destination);

      expect(await storage.exists(destination)).toBe(true);
      expect(await storage.exists(source)).toBe(true);
      await storage.delete(source);
      await storage.delete(destination);
    });

    it('RF-000-12: copy de un origen inexistente lanza StorageObjectNotFoundError', async () => {
      await expect(storage.copy(uniqueKey('no.png'), uniqueKey('b.png'))).rejects.toThrow(
        StorageObjectNotFoundError,
      );
    });

    it('RF-000-12: copy sobre un destino existente lanza StorageObjectExistsError y no lo pisa', async () => {
      const source = uniqueKey('a.png');
      const destination = uniqueKey('b.png');
      await storage.put(source, Buffer.from('a'), PNG);
      await storage.put(destination, Buffer.from('b'), PNG);

      await expect(storage.copy(source, destination)).rejects.toThrow(StorageObjectExistsError);

      await storage.delete(source);
      await storage.delete(destination);
    });

    it('RF-000-12: signedUrl devuelve una URL no vacía que cambia con la clave', async () => {
      const first = uniqueKey('a.png');
      const second = uniqueKey('b.png');
      await storage.put(first, Buffer.from('a'), PNG);
      await storage.put(second, Buffer.from('b'), PNG);

      const urlFirst = await storage.signedUrl(first, 300);
      const urlSecond = await storage.signedUrl(second, 300);

      expect(urlFirst.length).toBeGreaterThan(0);
      expect(urlFirst).not.toBe(urlSecond);
      await storage.delete(first);
      await storage.delete(second);
    });

    it('RF-000-12: signedUrl de un archivo inexistente lanza StorageObjectNotFoundError', async () => {
      await expect(storage.signedUrl(uniqueKey('no.png'), 60)).rejects.toThrow(
        StorageObjectNotFoundError,
      );
    });

    it('RF-000-12: delete quita el archivo y repetirlo no falla', async () => {
      const key = uniqueKey('a.png');
      await storage.put(key, Buffer.from('x'), PNG);

      await storage.delete(key);
      await storage.delete(key);

      expect(await storage.exists(key)).toBe(false);
    });

    it('RF-000-12: una clave con «..» se rechaza en todas las operaciones', async () => {
      const bad = 'contract/../fuera.png';

      await expect(storage.put(bad, Buffer.from('x'), PNG)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.copy(bad, uniqueKey('b.png'))).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.copy(uniqueKey('a.png'), bad)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.signedUrl(bad, 60)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.delete(bad)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.exists(bad)).rejects.toThrow(InvalidStorageKeyError);
    });

    it('RF-000-12: signedUrl rechaza una vigencia fuera de rango', async () => {
      const key = uniqueKey('a.png');
      await storage.put(key, Buffer.from('x'), PNG);

      await expect(storage.signedUrl(key, 0)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.signedUrl(key, 8 * 24 * 60 * 60)).rejects.toThrow(
        InvalidStorageKeyError,
      );
      await storage.delete(key);
    });
  });
}
