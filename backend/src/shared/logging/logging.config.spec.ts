import { Writable } from 'node:stream';
import { pino } from 'pino';
import {
  MAX_REDACT_DEPTH,
  REDACT_CENSOR,
  REDACT_PATHS,
  SENSITIVE_KEYS,
  buildPinoHttpOptions,
  isValidRequestId,
  keyVariants,
  levelForEnvironment,
  levelForResponse,
  resolveRequestId,
  serializeRequest,
} from './logging.config.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Registra con un `pino` real y la misma redacción, y devuelve la línea JSON que quedaría. */
function logLine(payload: Record<string, unknown>): string {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const logger = pino(
    { level: 'info', redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR } },
    sink,
  );
  logger.info(payload, 'prueba');
  return output;
}

/** Anida `leaf` bajo `depth` objetos intermedios: depth 0 es una clave de primer nivel. */
function nested(depth: number, leaf: Record<string, unknown>): Record<string, unknown> {
  let value: Record<string, unknown> = leaf;
  for (let level = 0; level < depth; level += 1) value = { wrapper: value };
  return value;
}

describe('Configuración de logs: lista de redacción (RF-000-13)', () => {
  it.each([
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-jobs-token"]',
    'req.headers["x-session-token"]',
    'res.headers["set-cookie"]',
    'res.headers["x-session-token"]',
    '*.password',
    '*.token',
    '*.ci',
    '*.phone',
    '*.reference',
    '*.secret',
    '*.cedula',
  ])('RF-000-13: la lista incluye %s (T020 y auditoría de T032)', (path) => {
    expect(REDACT_PATHS).toContain(path);
  });

  it.each([...SENSITIVE_KEYS])(
    `RF-000-13: %s se redacta en cualquier nivel hasta ${MAX_REDACT_DEPTH} de anidación`,
    (key) => {
      for (let depth = 0; depth <= MAX_REDACT_DEPTH; depth += 1) {
        const secret = `centinela-${key}-${depth}`;
        const line = logLine(nested(depth, { [key]: secret, visible: 'dato-publico' }));

        expect(line).not.toContain(secret);
        expect(line).toContain(REDACT_CENSOR);
        expect(line).toContain('dato-publico');
      }
    },
  );

  it.each([
    ['Authorization', 'Authorization'],
    ['X-Jobs-Token', 'x-jobs-token'],
    ['Set-Cookie', 'set-cookie'],
    ['Password', 'password'],
    ['SessionToken', 'sessionToken'],
  ])('RF-000-13: la variante %s de %s también se redacta', (variant) => {
    const line = logLine({ config: { headers: { [variant]: 'centinela-variante' } } });

    expect(line).not.toContain('centinela-variante');
  });

  it('RF-000-13: keyVariants añade la forma Title-Case de cada clave', () => {
    expect(keyVariants('x-jobs-token')).toEqual(['x-jobs-token', 'X-Jobs-Token']);
    expect(keyVariants('password')).toEqual(['password', 'Password']);
    expect(keyVariants('Authorization')).toEqual(['Authorization']);
  });

  it('RF-000-13: la clave se conserva y solo cambia el valor por un reemplazo constante', () => {
    const line = JSON.parse(logLine({ body: { password: 'clave-secreta', email: 'a@b.c' } }));

    expect(line.body).toEqual({ password: REDACT_CENSOR, email: 'a@b.c' });
  });

  it('RF-000-13: pino sí deja pasar un valor sensible más hondo que la profundidad cubierta', () => {
    // Documenta el límite: más allá de MAX_REDACT_DEPTH la redacción por rutas no llega, por eso
    // el cuerpo de las peticiones nunca se registra. Si este test falla, se amplió la cobertura.
    const secret = 'centinela-demasiado-hondo';
    const line = logLine(nested(MAX_REDACT_DEPTH + 1, { password: secret }));

    expect(line).toContain(secret);
  });
});

describe('Configuración de logs: identificador de petición (RF-000-13)', () => {
  it.each(['abc-123', 'test_123.v2', 'A'.repeat(64), '3f2b8c1e-9d4a-4e7b-8a1c-0123456789ab'])(
    'RF-000-13: un X-Request-Id válido (%s) se conserva',
    (value) => {
      expect(isValidRequestId(value)).toBe(true);
      expect(resolveRequestId(value)).toBe(value);
    },
  );

  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ['65 caracteres', 'A'.repeat(65)],
    ['500 caracteres', 'A'.repeat(500)],
    ['con espacios', 'abc def'],
    ['con salto de línea', 'abc\nINJECTED'],
    ['con retorno de carro', 'abc\r\nSet-Cookie: x=1'],
    ['con comillas', 'abc"def'],
    ['con barra', 'abc/def'],
    ['con carácter no ASCII', 'abcé'],
    ['con salto de línea al final', 'abc\n'],
    ['repetido (arreglo)', ['abc', 'def']],
    ['no es texto', 42],
  ])('RF-000-13: un X-Request-Id %s se reemplaza por un UUID v4 nuevo', (_name, value) => {
    expect(isValidRequestId(value)).toBe(false);
    expect(resolveRequestId(value)).toMatch(UUID_V4);
  });

  it('RF-000-13: dos peticiones sin identificador reciben UUID distintos', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});

describe('Configuración de logs: niveles (RF-000-13)', () => {
  it.each([
    ['production', 'info'],
    ['development', 'debug'],
    ['test', 'silent'],
    [undefined, 'info'],
    ['desconocido', 'info'],
  ])('RF-000-13: NODE_ENV=%s usa el nivel %s', (nodeEnv, level) => {
    expect(levelForEnvironment(nodeEnv)).toBe(level);
  });

  it.each([
    ['/health', 200, undefined, 'debug'],
    ['/health?x=1', 200, undefined, 'debug'],
    ['/health', 503, undefined, 'error'],
    ['/healthz', 200, undefined, 'info'],
    ['/groups', 200, undefined, 'info'],
    ['/groups', 404, undefined, 'warn'],
    ['/groups', 401, undefined, 'warn'],
    ['/groups', 500, undefined, 'error'],
    ['/groups', 200, new Error('x'), 'error'],
  ] as const)(
    'RF-000-13: %s con estado %i y error %s se registra en %s',
    (url, status, err, level) => {
      expect(levelForResponse(url, status, err)).toBe(level);
    },
  );
});

describe('Configuración de logs: lo que se registra de la petición (RF-000-13)', () => {
  it('RF-000-13: la petición registrada no lleva query, parámetros ni dirección remota', () => {
    const serialized = serializeRequest({
      id: 'abc',
      method: 'GET',
      url: '/auth/verify?token=CENTINELA&ci=1234567',
      query: { token: 'CENTINELA' },
      params: { id: '1' },
      headers: { 'user-agent': 'jest' },
      remoteAddress: '127.0.0.1',
      remotePort: 5000,
    });

    expect(serialized).toEqual({
      id: 'abc',
      method: 'GET',
      url: '/auth/verify',
      headers: { 'user-agent': 'jest' },
    });
  });

  it('RF-000-13: las opciones de pino-http activan el reqId, la redacción y el nivel por entorno', () => {
    const options = buildPinoHttpOptions({ nodeEnv: 'production' });

    expect(options.level).toBe('info');
    expect(options.quietReqLogger).toBe(true);
    expect(options.redact).toEqual({ paths: [...REDACT_PATHS], censor: REDACT_CENSOR });
  });

  it('RF-000-13: un nivel explícito manda sobre el del entorno', () => {
    expect(buildPinoHttpOptions({ nodeEnv: 'test', level: 'info' }).level).toBe('info');
  });
});
