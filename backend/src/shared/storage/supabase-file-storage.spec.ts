import { jest } from '@jest/globals';
import {
  InvalidStorageKeyError,
  StorageError,
  StorageObjectExistsError,
  StorageObjectNotFoundError,
} from '../ports/file-storage.js';
import { type FetchFn, SupabaseFileStorage } from './supabase-file-storage.js';

const OPTIONS = {
  url: 'https://abc.supabase.co',
  serviceKey: 'clave-de-servicio-ficticia',
  bucket: 'comprobantes',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function storageWith(response: Response | Error): {
  storage: SupabaseFileStorage;
  fetchFn: jest.Mock<FetchFn>;
} {
  const fetchFn = jest.fn<FetchFn>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { storage: new SupabaseFileStorage(OPTIONS, fetchFn), fetchFn };
}

function requestOf(fetchFn: jest.Mock<FetchFn>): { url: string; init: RequestInit } {
  const [url, init] = fetchFn.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

describe('SupabaseFileStorage', () => {
  describe('put', () => {
    it('RF-000-12: hace POST al objeto con la clave de servicio, el tipo y x-upsert', async () => {
      const { storage, fetchFn } = storageWith(json({ Key: 'x' }));
      const body = new Uint8Array([1, 2, 3]);

      await storage.put('receipts/g1/a-b.png', body, { contentType: 'image/png' });

      const { url, init } = requestOf(fetchFn);
      expect(url).toBe(
        'https://abc.supabase.co/storage/v1/object/comprobantes/receipts/g1/a-b.png',
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        apikey: OPTIONS.serviceKey,
        Authorization: `Bearer ${OPTIONS.serviceKey}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      });
      expect(init.body).toBe(body);
    });

    it('RF-000-12: rechaza una clave inválida sin llamar a la red', async () => {
      const { storage, fetchFn } = storageWith(json({}));

      await expect(
        storage.put('../x.png', new Uint8Array(), { contentType: 'image/png' }),
      ).rejects.toThrow(InvalidStorageKeyError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('RF-000-12: un rechazo del almacén da StorageError con el estado y sin la clave de servicio', async () => {
      const { storage } = storageWith(
        json({ statusCode: '403', message: OPTIONS.serviceKey }, 403),
      );

      const error = await storage
        .put('a.png', new Uint8Array(), { contentType: 'image/png' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageError);
      expect((error as Error).message).toContain('403');
      expect((error as Error).message).not.toContain(OPTIONS.serviceKey);
    });

    it('RF-000-12: un fallo de red da StorageError sin detalles', async () => {
      const { storage } = storageWith(new TypeError('fetch failed: abc.supabase.co'));

      const error = await storage
        .put('a.png', new Uint8Array(), { contentType: 'image/png' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageError);
      expect((error as Error).message).not.toContain('abc.supabase.co');
    });
  });

  describe('copy', () => {
    it('RF-000-12: hace POST a object/copy con el bucket y las dos claves', async () => {
      const { storage, fetchFn } = storageWith(json({ Key: 'x' }));

      await storage.copy('qr/titular.png', 'requests/r1/qr.png');

      const { url, init } = requestOf(fetchFn);
      expect(url).toBe('https://abc.supabase.co/storage/v1/object/copy');
      expect(JSON.parse(init.body as string)).toEqual({
        bucketId: 'comprobantes',
        sourceKey: 'qr/titular.png',
        destinationKey: 'requests/r1/qr.png',
      });
    });

    it('RF-000-12: un origen inexistente (400 con statusCode 404) da StorageObjectNotFoundError', async () => {
      const { storage } = storageWith(json({ statusCode: '404', error: 'not_found' }, 400));

      await expect(storage.copy('a.png', 'b.png')).rejects.toThrow(StorageObjectNotFoundError);
    });

    it('RF-000-12: un destino existente (409) da StorageObjectExistsError', async () => {
      const { storage } = storageWith(json({ statusCode: '409', error: 'Duplicate' }, 409));

      await expect(storage.copy('a.png', 'b.png')).rejects.toThrow(StorageObjectExistsError);
    });
  });

  describe('signedUrl', () => {
    it('RF-000-12: pide la firma con expiresIn y completa la URL devuelta', async () => {
      const { storage, fetchFn } = storageWith(
        json({ signedURL: '/object/sign/comprobantes/a.png?token=abc' }),
      );

      const url = await storage.signedUrl('a.png', 300);

      expect(url).toBe(
        'https://abc.supabase.co/storage/v1/object/sign/comprobantes/a.png?token=abc',
      );
      const request = requestOf(fetchFn);
      expect(request.url).toBe('https://abc.supabase.co/storage/v1/object/sign/comprobantes/a.png');
      expect(JSON.parse(request.init.body as string)).toEqual({ expiresIn: 300 });
    });

    it('RF-000-12: un objeto inexistente da StorageObjectNotFoundError', async () => {
      const { storage } = storageWith(json({ statusCode: '404', error: 'not_found' }, 400));

      await expect(storage.signedUrl('a.png', 60)).rejects.toThrow(StorageObjectNotFoundError);
    });

    it('RF-000-12: rechaza una vigencia inválida sin llamar a la red', async () => {
      const { storage, fetchFn } = storageWith(json({}));

      await expect(storage.signedUrl('a.png', 0)).rejects.toThrow(InvalidStorageKeyError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('RF-000-12: una respuesta sin signedURL da StorageError', async () => {
      const { storage } = storageWith(json({}));

      await expect(storage.signedUrl('a.png', 60)).rejects.toThrow(StorageError);
    });
  });

  describe('delete', () => {
    it('RF-000-12: hace DELETE al objeto', async () => {
      const { storage, fetchFn } = storageWith(json({ message: 'Successfully deleted' }));

      await storage.delete('a.png');

      const { url, init } = requestOf(fetchFn);
      expect(url).toBe('https://abc.supabase.co/storage/v1/object/comprobantes/a.png');
      expect(init.method).toBe('DELETE');
    });

    it('RF-000-12: borrar lo que no existe no es un error', async () => {
      const { storage } = storageWith(json({ statusCode: '404', error: 'not_found' }, 404));

      await expect(storage.delete('a.png')).resolves.toBeUndefined();
    });

    it('RF-000-12: otro rechazo sí es StorageError', async () => {
      const { storage } = storageWith(json({}, 500));

      await expect(storage.delete('a.png')).rejects.toThrow(StorageError);
    });
  });

  describe('exists', () => {
    it('RF-000-12: HEAD 200 es true', async () => {
      const { storage, fetchFn } = storageWith(new Response(null, { status: 200 }));

      await expect(storage.exists('a.png')).resolves.toBe(true);
      expect(requestOf(fetchFn).init.method).toBe('HEAD');
    });

    it.each([400, 404])('RF-000-12: HEAD %d es false', async (status) => {
      const { storage } = storageWith(new Response(null, { status }));

      await expect(storage.exists('a.png')).resolves.toBe(false);
    });

    it('RF-000-12: HEAD 500 es StorageError, no false', async () => {
      const { storage } = storageWith(new Response(null, { status: 500 }));

      await expect(storage.exists('a.png')).rejects.toThrow(StorageError);
    });
  });
});
