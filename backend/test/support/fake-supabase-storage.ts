// Servidor de Supabase Storage simulado en memoria, como función `fetch`. Reproduce solo las
// rutas y las respuestas que usa SupabaseFileStorage, según la documentación de la API REST de
// Storage, para poder ejecutar el contrato común sin red ni credenciales.

type FetchFn = typeof fetch;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status });
}

const notFound = (): Response => json({ statusCode: '404', error: 'not_found' }, 400);

export function createFakeSupabaseFetch(options: {
  url: string;
  serviceKey: string;
  bucket: string;
}): FetchFn {
  const objects = new Map<string, Uint8Array>();
  const prefix = `${options.url}/storage/v1`;

  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    if (headers.get('apikey') !== options.serviceKey) {
      return json({ statusCode: '403', error: 'Unauthorized' }, 403);
    }
    if (!url.startsWith(`${prefix}/`)) return json({ statusCode: '404' }, 404);
    const path = url.slice(prefix.length);

    if (method === 'POST' && path === '/object/copy') {
      const body = JSON.parse(String(init?.body)) as {
        bucketId: string;
        sourceKey: string;
        destinationKey: string;
      };
      const data = objects.get(body.sourceKey);
      if (body.bucketId !== options.bucket || !data) return notFound();
      if (objects.has(body.destinationKey)) {
        return json({ statusCode: '409', error: 'Duplicate' }, 409);
      }
      objects.set(body.destinationKey, data);
      return json({ Key: `${options.bucket}/${body.destinationKey}` }, 200);
    }

    const signMatch = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path);
    if (method === 'POST' && signMatch) {
      const key = decodeURIComponent(signMatch[2] ?? '');
      if (!objects.has(key)) return notFound();
      const { expiresIn } = JSON.parse(String(init?.body)) as { expiresIn: number };
      return json(
        { signedURL: `/object/sign/${options.bucket}/${signMatch[2]}?token=${expiresIn}` },
        200,
      );
    }

    const objectMatch = /^\/object\/([^/]+)\/(.+)$/.exec(path);
    if (objectMatch) {
      const key = decodeURIComponent(objectMatch[2] ?? '');
      if (method === 'POST') {
        objects.set(key, new Uint8Array(init?.body as Uint8Array));
        return json({ Key: `${options.bucket}/${key}` }, 200);
      }
      if (method === 'HEAD') return new Response(null, { status: objects.has(key) ? 200 : 400 });
      if (method === 'DELETE') {
        objects.delete(key);
        return json({ message: 'Successfully deleted' }, 200);
      }
    }
    return json({ statusCode: '404', error: 'not_found' }, 404);
  };
}
