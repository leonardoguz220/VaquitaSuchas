import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import request from 'supertest';
import { ClockModule } from '../src/shared/clock/clock.module.js';
import { ErrorsModule } from '../src/shared/errors/errors.module.js';
import { AdminGuard } from '../src/shared/guards/admin.guard.js';
import { AuthGuard } from '../src/shared/guards/auth.guard.js';
import { JobsTokenGuard } from '../src/shared/guards/jobs-token.guard.js';
import { LoggingModule } from '../src/shared/logging/logging.module.js';
import { requestIdMiddleware } from '../src/shared/logging/request-id.middleware.js';
import { AUTH_SESSION_PORT } from '../src/shared/ports/auth-session.port.js';

// Valores centinela únicos: si alguno aparece en CUALQUIER parte de la salida, hubo una fuga.
const PASSWORD = 'Cl4ve-Centinela-9Q7x';
const NESTED_PASSWORD = 'Cl4ve-Anidada-3Lm8';
const CI = '7654321-LP-CENTINELA';
const PHONE = '+59171234567-CENTINELA';
const REFERENCE = 'REF-CENTINELA-884112';
const BEARER = 'Bearer jwt-centinela-aaaa.bbbb.cccc';
const COOKIE = 'vq_session=cookie-centinela-5521';
const JOBS = 'jobs-centinela-0042';
const SESSION = 'sesion-centinela-7788';
const SET_COOKIE = 'vq_session=set-cookie-centinela-1234; HttpOnly';
const SESSION_OUT = 'sesion-saliente-centinela-9911';
const QUERY_TOKEN = 'query-centinela-6060';
const FILE_CONTENT = 'CONTENIDO-DE-COMPROBANTE-CENTINELA';
const DEEP_PASSWORD = 'Cl4ve-Honda-5Zz1';

const ALL_SENTINELS = [
  PASSWORD,
  NESTED_PASSWORD,
  CI,
  PHONE,
  REFERENCE,
  'jwt-centinela',
  'cookie-centinela',
  JOBS,
  SESSION,
  'set-cookie-centinela',
  SESSION_OUT,
  QUERY_TOKEN,
  FILE_CONTENT,
  DEEP_PASSWORD,
];

const JWT_SECRET = 'secreto-e2e-de-al-menos-treinta-y-dos-caracteres';
const JOBS_TOKEN = 'j'.repeat(64);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface LogLine {
  level: string;
  time: string;
  msg?: string;
  reqId?: string;
  req?: { url: string; headers: Record<string, unknown> };
  res?: { statusCode: number; headers: Record<string, unknown> };
  [key: string]: unknown;
}

/** Salida real de pino capturada en memoria: cada llamada a `write` es una línea JSON. */
const output: string[] = [];
const destination = { write: (line: string): void => void output.push(line) };

const outputText = (): string => output.join('');
const parsedLines = (): LogLine[] =>
  output
    .join('')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LogLine);

// Controlador de prueba: simula altas y llama a Logger A PROPÓSITO con datos sensibles, para
// comprobar que la redacción protege incluso cuando quien programa se equivoca.
@Controller()
class LoggingProbeController {
  private readonly logger = new Logger('LoggingProbe');

  @Post('signup')
  signup(@Body() body: Record<string, unknown>): { ok: true } {
    this.logger.log(body); // error a propósito
    this.logger.log({ resumen: 'alta', body }); // error a propósito, un nivel más hondo
    return { ok: true };
  }

  @Post('signup/fail')
  signupFail(@Body() body: Record<string, unknown>): never {
    this.logger.log(body); // error a propósito
    // Como un cliente HTTP que adjunta la configuración de la petición al error.
    const error = Object.assign(new Error('Falló el alta'), {
      config: { data: body, headers: { Authorization: BEARER } },
      body,
    });
    this.logger.error(error); // error a propósito: registra el objeto Error completo
    throw error;
  }

  @Post('deep')
  deep(@Body() body: Record<string, unknown>): { ok: true } {
    this.logger.log({ a: { b: { c: { d: { e: body } } } } }); // error a propósito
    return { ok: true };
  }

  @Get('ok')
  ok(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.setHeader('Set-Cookie', SET_COOKIE);
    res.setHeader('X-Session-Token', SESSION_OUT);
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('Error inesperado de prueba');
  }

  @Get('health')
  health(@Res() res: Response): void {
    res.status(200).json({ status: 'ok' });
  }

  @UseGuards(AuthGuard)
  @Get('guarded')
  guarded(): { ok: true } {
    return { ok: true };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }

  @UseGuards(JobsTokenGuard)
  @Post('jobs')
  jobs(): { ok: true } {
    return { ok: true };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body() body: Record<string, unknown>,
  ): { size: number } {
    this.logger.log({ file, body }); // error a propósito: registra el archivo y los campos
    return { size: file.buffer.length };
  }
}

describe('Logs estructurados con reqId y redacción (RF-000-13)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let startupLines: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => ({ JWT_SECRET, JOBS_TOKEN })],
        }),
        ClockModule,
        LoggingModule.forRoot({ level: 'info', destination }),
        ErrorsModule,
      ],
      controllers: [LoggingProbeController],
      providers: [
        AuthGuard,
        // Ninguna sesión es vigente: todo Bearer termina en 401.
        { provide: AUTH_SESSION_PORT, useValue: { resolveSession: () => Promise.resolve(null) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(PinoNestLogger));
    // Igual que main.ts: antes de iniciar, para que corra antes del lector de cuerpos.
    app.use(requestIdMiddleware);
    await app.init();
    startupLines = output.splice(0);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    output.length = 0;
  });

  const signupBody = {
    email: 'ana@example.com',
    password: PASSWORD,
    ci: CI,
    phone: PHONE,
    reference: REFERENCE,
    nested: { user: { password: NESTED_PASSWORD } },
  };

  function expectNoSentinels(): void {
    const text = outputText();
    for (const sentinel of ALL_SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  }

  describe('redacción de datos sensibles', () => {
    it('RF-000-13: un alta con contraseña, CI, celular y referencia no deja ninguno en la salida', async () => {
      const res = await http().post('/signup').send(signupBody);

      expect(res.status).toBe(201);
      const text = outputText();
      // El log sí recibió el alta (sin esto la prueba pasaría con la salida vacía)...
      expect(text).toContain('ana@example.com');
      expect(text).toContain('[REDACTED]');
      // ...pero sin ningún dato sensible.
      expectNoSentinels();
    });

    it('RF-000-13: la clave sensible se conserva y su valor es el reemplazo constante', async () => {
      await http().post('/signup').send(signupBody);

      const line = parsedLines().find((entry) => entry['password'] !== undefined);
      expect(line).toMatchObject({
        email: 'ana@example.com',
        password: '[REDACTED]',
        ci: '[REDACTED]',
        phone: '[REDACTED]',
        reference: '[REDACTED]',
        nested: { user: { password: '[REDACTED]' } },
      });
    });

    it('RF-000-13: un objeto con datos sensibles dentro de otro (req.body.user.password) también se redacta', async () => {
      await http().post('/signup').send(signupBody);

      const line = parsedLines().find((entry) => entry['resumen'] === 'alta');
      expect(line).toMatchObject({
        body: { password: '[REDACTED]', nested: { user: { password: '[REDACTED]' } } },
      });
    });

    it('RF-000-13: la redacción llega hasta 5 niveles bajo la raíz del objeto registrado', async () => {
      // En el objeto registrado, password queda bajo 5 niveles (a.b.c.d.e.password): el límite.
      await http().post('/deep').send({ password: DEEP_PASSWORD, ci: CI });

      expectNoSentinels();
    });

    it('RF-000-13: un error con config.data y cabeceras sensibles (err.config.data) se registra redactado', async () => {
      const res = await http().post('/signup/fail').send(signupBody);

      expect(res.status).toBe(500);
      const errorLine = parsedLines().find(
        (entry) => entry.level === 'error' && entry['err'] !== undefined,
      );
      expect(errorLine).toBeDefined();
      expect(errorLine?.['err']).toMatchObject({
        message: 'Falló el alta',
        config: { data: { password: '[REDACTED]' }, headers: { Authorization: '[REDACTED]' } },
      });
      expectNoSentinels();
    });

    it('RF-000-13: Authorization, Cookie, X-Jobs-Token y X-Session-Token de la petición no salen en el log', async () => {
      const res = await http()
        .get('/ok')
        .set('Authorization', BEARER)
        .set('Cookie', COOKIE)
        .set('X-Jobs-Token', JOBS)
        .set('X-Session-Token', SESSION)
        .set('X-Benign', 'cabecera-visible');

      expect(res.status).toBe(200);
      const completed = parsedLines().find((entry) => entry.req && entry.res);
      // Las cabeceras no sensibles sí se registran y las sensibles conservan la clave.
      expect(completed?.req?.headers).toMatchObject({
        'x-benign': 'cabecera-visible',
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        'x-jobs-token': '[REDACTED]',
        'x-session-token': '[REDACTED]',
      });
      expectNoSentinels();
    });

    it('RF-000-13: Set-Cookie y X-Session-Token de la respuesta no salen en el log', async () => {
      const res = await http().get('/ok');

      expect(res.headers['set-cookie']).toBeDefined();
      const completed = parsedLines().find((entry) => entry.req && entry.res);
      expect(completed?.res?.headers).toMatchObject({
        'set-cookie': '[REDACTED]',
        'x-session-token': '[REDACTED]',
      });
      expectNoSentinels();
    });

    it('RF-000-13: la query de la URL no se registra', async () => {
      await http().get(`/ok?token=${QUERY_TOKEN}&ci=${CI}`);

      const completed = parsedLines().find((entry) => entry.req && entry.res);
      expect(completed?.req?.url).toBe('/ok');
      expectNoSentinels();
    });

    it('RF-000-13: el cuerpo de una petición no se registra si nadie lo registra a propósito', async () => {
      await http().post('/jobs').set('X-Jobs-Token', JOBS_TOKEN).send(signupBody);

      expect(outputText()).not.toContain('ana@example.com');
      expectNoSentinels();
    });

    it('RF-000-13: el X-Jobs-Token incorrecto de un 401 no sale en el log', async () => {
      const res = await http().post('/jobs').set('X-Jobs-Token', JOBS);

      expect(res.status).toBe(401);
      expectNoSentinels();
    });

    it('RF-000-13: un cuerpo multipart (comprobante) no aparece en la salida, ni siquiera si se registra el archivo', async () => {
      const res = await http()
        .post('/upload')
        .field('reference', REFERENCE)
        .field('note', 'nota-visible')
        .attach('file', Buffer.from(FILE_CONTENT), 'comprobante.png');

      expect(res.status).toBe(201);
      const text = outputText();
      // El archivo sí llegó al registro a propósito: sin esto la prueba pasaría con la salida vacía.
      expect(text).toContain('comprobante.png');
      expect(text).toContain('nota-visible');
      expect(text).not.toContain(FILE_CONTENT);
      // `Buffer` se serializa como arreglo de bytes: también se busca en esa forma.
      expect(text).not.toContain(Buffer.from(FILE_CONTENT).toJSON().data.join(','));
      expectNoSentinels();
    });
  });

  describe('identificador de petición', () => {
    it('RF-000-13: cada línea de una petición es JSON válido con reqId y la misma cabecera X-Request-Id vuelve en la respuesta', async () => {
      const res = await http().post('/signup').send(signupBody);

      const requestId = res.headers['x-request-id'];
      expect(requestId).toMatch(UUID_V4);
      const lines = parsedLines();
      // Una del controlador (x2) y la de «request completed».
      expect(lines.length).toBeGreaterThanOrEqual(3);
      for (const line of lines) {
        expect(line.reqId).toBe(requestId);
        expect(typeof line.level).toBe('string');
        expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });

    it('RF-000-13: un X-Request-Id válido de la petición se conserva en la respuesta y en el log', async () => {
      const res = await http().get('/ok').set('X-Request-Id', 'frontend-req_42.a');

      expect(res.headers['x-request-id']).toBe('frontend-req_42.a');
      expect(parsedLines().every((line) => line.reqId === 'frontend-req_42.a')).toBe(true);
    });

    it('RF-000-13: dos peticiones sin identificador reciben UUID v4 distintos', async () => {
      const first = await http().get('/ok');
      const second = await http().get('/ok');

      expect(first.headers['x-request-id']).toMatch(UUID_V4);
      expect(second.headers['x-request-id']).toMatch(UUID_V4);
      expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
    });

    it.each([
      ['con espacios', 'abc def'],
      ['con comillas y JSON (falsificar una línea del log)', '{"level":"fatal","msg":"INJECTED"}'],
      ['con coma (cabecera repetida)', 'abc,def'],
      ['de 65 caracteres', 'a'.repeat(65)],
      ['de 500 caracteres', 'a'.repeat(500)],
    ])('RF-000-13: un X-Request-Id %s se reemplaza por un UUID v4 nuevo', async (_name, value) => {
      const res = await http().get('/ok').set('X-Request-Id', value);

      const requestId = res.headers['x-request-id'];
      expect(requestId).toMatch(UUID_V4);
      for (const line of parsedLines()) {
        expect(line.reqId).toBe(requestId);
        expect(line['msg']).not.toBe('INJECTED');
        expect(line.level).not.toBe('fatal');
      }
    });

    it('RF-000-13: un X-Request-Id con salto de línea ni siquiera llega al servidor (el reemplazo está en la prueba unitaria)', async () => {
      await expect(http().get('/ok').set('X-Request-Id', 'abc\nINJECTED')).rejects.toThrow();
      expect(output).toHaveLength(0);
    });

    it('RF-000-13: el X-Request-Id vuelve también en un error 500 y la traza del filtro lo hereda', async () => {
      const res = await http().get('/boom');

      expect(res.status).toBe(500);
      const requestId = res.headers['x-request-id'];
      expect(requestId).toMatch(UUID_V4);
      const filterLine = parsedLines().find(
        (line) => line.level === 'error' && line.msg?.includes('GET /boom -> 500'),
      );
      expect(filterLine?.reqId).toBe(requestId);
      expect(parsedLines().every((line) => line.reqId === requestId)).toBe(true);
    });

    it('RF-000-13: el X-Request-Id vuelve también en un 401 del AuthGuard', async () => {
      const res = await http().get('/guarded').set('Authorization', BEARER);

      expect(res.status).toBe(401);
      expect(res.headers['x-request-id']).toMatch(UUID_V4);
      expectNoSentinels();
    });

    it('RF-000-13: el X-Request-Id vuelve también en un 401 del JobsTokenGuard y en un 403', async () => {
      const unauthorized = await http().post('/jobs');
      const forbidden = await http().get('/admin');

      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers['x-request-id']).toMatch(UUID_V4);
      // Sin sesión AdminGuard responde 401; el punto es que la cabecera vuelve igual.
      expect(forbidden.headers['x-request-id']).toMatch(UUID_V4);
    });

    it('RF-000-13: el X-Request-Id vuelve también en un 404 de ruta inexistente', async () => {
      const res = await http().get('/no-existe').set('X-Request-Id', 'busco-esto');

      expect(res.status).toBe(404);
      expect(res.headers['x-request-id']).toBe('busco-esto');
    });

    it('RF-000-13: el X-Request-Id vuelve también cuando el JSON del cuerpo está mal formado', async () => {
      const res = await http()
        .post('/signup')
        .set('Content-Type', 'application/json')
        .send('{"password": ');

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toMatch(UUID_V4);
    });
  });

  describe('formato y niveles', () => {
    it('RF-000-13: lo que Nest registra al arrancar sale como JSON de una línea', () => {
      expect(startupLines.length).toBeGreaterThan(0);
      for (const line of startupLines) {
        expect(line.indexOf('\n')).toBe(line.length - 1);
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('RF-000-13: un /health que responde bien se registra en debug y no aparece con nivel info', async () => {
      const res = await http().get('/health');

      expect(res.status).toBe(200);
      expect(output).toHaveLength(0);
    });

    it('RF-000-13: una petición normal deja una línea «request completed» en info con estado y duración', async () => {
      await http().get('/ok');

      const completed = parsedLines().find((entry) => entry.req && entry.res);
      expect(completed).toMatchObject({ level: 'info', msg: 'request completed' });
      expect(completed?.res?.statusCode).toBe(200);
      expect(typeof completed?.['responseTime']).toBe('number');
    });

    it('RF-000-13: un 4xx se registra como warn y un 5xx como error', async () => {
      await http().get('/no-existe');
      const warnLevels = parsedLines()
        .filter((entry) => entry.req && entry.res)
        .map((entry) => entry.level);
      output.length = 0;
      await http().get('/boom');
      const errorLevels = parsedLines()
        .filter((entry) => entry.req && entry.res)
        .map((entry) => entry.level);

      expect(warnLevels).toEqual(['warn']);
      expect(errorLevels).toEqual(['error']);
    });
  });
});
