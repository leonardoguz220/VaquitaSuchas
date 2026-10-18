import { jest } from '@jest/globals';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsEmail, IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { DomainError } from '../src/shared/errors/domain-error.js';
import { ErrorsModule } from '../src/shared/errors/errors.module.js';

const SENTINEL = 'SECRETO-INTERNO';
const SENTINEL_PATH = 'C:\\proyecto\\backend\\src\\modules\\users\\users.repository.ts';

class CreateThingDto {
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  name!: string;
}

// Controlador de prueba: solo lanza, para comprobar qué ve el cliente y qué queda en el log.
@Controller('boom')
class BoomController {
  @Get('domain')
  domain(): never {
    throw new DomainError('INVALID_TRANSITION', 409, 'Este cobro ya no admite cambios.', {
      from: 'pagado',
      action: 'uploadReceipt',
    });
  }

  @Post('validate')
  validate(@Body() dto: CreateThingDto): CreateThingDto {
    return dto;
  }

  @Get('uuid/:id')
  uuid(@Param('id', new ParseUUIDPipe()) id: string): string {
    return id;
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException(`No existe ${SENTINEL}`);
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException(`Sin permiso ${SENTINEL}`);
  }

  @Get('unauthenticated')
  unauthenticated(): never {
    throw new UnauthorizedException(`Token ${SENTINEL}`);
  }

  @Get('pg-unique')
  pgUnique(): never {
    throw Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        code: '23505',
        constraint: 'users_email_key',
        table: 'users',
        schema: 'public',
        detail: 'Key (email)=(ana@example.com) already exists.',
      },
    );
  }

  @Get('error')
  error(): never {
    throw new Error(`Falló la consulta ${SENTINEL} en ${SENTINEL_PATH}`);
  }

  @Get('async-error')
  async asyncError(): Promise<never> {
    await Promise.resolve();
    throw new TypeError(`Cannot read properties of undefined ${SENTINEL}`);
  }

  @Get('non-error')
  nonError(): never {
    throw `${SENTINEL} lanzado como texto`;
  }
}

describe('Filtro global de errores (RF-000-11)', () => {
  let app: INestApplication;
  let errorLog: jest.SpiedFunction<Logger['error']>;
  let debugLog: jest.SpiedFunction<Logger['debug']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorsModule],
      controllers: [BoomController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    debugLog = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function loggedText(): string {
    return JSON.stringify([errorLog.mock.calls, debugLog.mock.calls]);
  }

  it('RF-000-11: un DomainError respeta su httpStatus, code, message y details', async () => {
    const res = await request(app.getHttpServer()).get('/boom/domain');

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
      message: 'Este cobro ya no admite cambios.',
      details: { from: 'pagado', action: 'uploadReceipt' },
    });
  });

  it('RF-000-11: un cuerpo inválido da 400 VALIDATION_ERROR con details.fields por campo', async () => {
    const res = await request(app.getHttpServer())
      .post('/boom/validate')
      .send({ email: 'no-es-correo', quantity: 0, name: 5 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son válidos.',
      details: {
        fields: { email: ['INVALID_EMAIL'], quantity: ['MIN'], name: ['IS_STRING'] },
      },
    });
  });

  it('RF-000-11: un cuerpo válido pasa por el ValidationPipe sin error', async () => {
    const res = await request(app.getHttpServer())
      .post('/boom/validate')
      .send({ email: 'ana@example.com', quantity: 2, name: 'Ana' });

    expect(res.status).toBe(201);
  });

  it('RF-000-11: un campo que el DTO no declara se rechaza con VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/boom/validate')
      .send({ email: 'ana@example.com', quantity: 2, name: 'Ana', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual({ fields: { role: ['UNKNOWN_FIELD'] } });
  });

  it('RF-000-11: un parámetro inválido (ParseUUIDPipe) da 400 VALIDATION_ERROR sin texto interno', async () => {
    const res = await request(app.getHttpServer()).get('/boom/uuid/no-es-uuid');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('uuid');
  });

  it('RF-000-11: un JSON mal formado da 400 VALIDATION_ERROR en el formato uniforme', async () => {
    const res = await request(app.getHttpServer())
      .post('/boom/validate')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'message', 'statusCode']);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['not-found', 404, 'NOT_FOUND'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['unauthenticated', 401, 'UNAUTHENTICATED'],
  ])(
    'RF-000-11: HttpException de /boom/%s se mapea al código común de A.3 sin su texto',
    async (route, status, code) => {
      const res = await request(app.getHttpServer()).get(`/boom/${route}`);

      expect(res.status).toBe(status);
      expect(res.body.statusCode).toBe(status);
      expect(res.body.code).toBe(code);
      expect(res.body.message).not.toContain(SENTINEL);
    },
  );

  it('RF-000-11: una ruta que no existe responde 404 NOT_FOUND en el formato uniforme', async () => {
    const res = await request(app.getHttpServer()).get('/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'No se encontró el recurso solicitado.',
    });
  });

  it('RF-000-11: un error 23505 de PostgreSQL da 409 CONFLICT sin constraint, tabla ni valores', async () => {
    const res = await request(app.getHttpServer()).get('/boom/pg-unique');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'La operación entra en conflicto con los datos existentes.',
    });
    const text = JSON.stringify(res.body);
    for (const leaked of ['users_email_key', 'users', 'public', 'ana@example.com', 'email']) {
      expect(text).not.toContain(leaked);
    }
  });

  it.each([['error'], ['async-error'], ['non-error']])(
    'CA-000-08: un error no controlado en /boom/%s da 500 INTERNAL_ERROR con el formato uniforme',
    async (route) => {
      const res = await request(app.getHttpServer()).get(`/boom/${route}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
      });
    },
  );

  it.each([['error'], ['async-error'], ['non-error'], ['pg-unique'], ['not-found']])(
    'CA-000-08: la respuesta de /boom/%s no contiene traza, rutas, texto interno ni nombres de tablas',
    async (route) => {
      const res = await request(app.getHttpServer()).get(`/boom/${route}`);

      const raw = res.text;
      expect(raw).not.toContain(SENTINEL);
      expect(raw).not.toContain(SENTINEL_PATH);
      expect(raw).not.toMatch(/\bat\s+\S+\s+\(/); // línea de traza "at fn (archivo:1:2)"
      expect(raw).not.toMatch(/\.(ts|js):\d+/);
      expect(raw).not.toMatch(/node_modules|src[\\/]/);
      expect(raw).not.toMatch(/stack|cause|query|hint|constraint|detail|routine/i);
      expect(Object.keys(res.body).sort()).toEqual(['code', 'message', 'statusCode']);
    },
  );

  it('CA-000-08: la traza completa sí queda en el log del servidor', async () => {
    await request(app.getHttpServer()).get('/boom/error');

    expect(errorLog).toHaveBeenCalledTimes(1);
    const [message, stack] = errorLog.mock.calls[0] as [string, string];
    expect(message).toBe('GET /boom/error -> 500 INTERNAL_ERROR');
    expect(stack).toContain(SENTINEL);
    expect(stack).toContain('BoomController');
  });

  it('CA-000-08: el log no copia cabeceras, query ni cuerpo de la petición', async () => {
    await request(app.getHttpServer())
      .post('/boom/validate?token=TOKEN-EN-QUERY')
      .set('Authorization', 'Bearer TOKEN-EN-CABECERA')
      .set('Cookie', 'vq_session=SESION-EN-COOKIE')
      .send({ email: 'ana@example.com', quantity: 1, name: 'Ana', password: 'CLAVE-EN-CUERPO' });
    await request(app.getHttpServer())
      .get('/boom/error?ci=1234567')
      .set('Authorization', 'Bearer TOKEN-EN-CABECERA')
      .set('Cookie', 'vq_session=SESION-EN-COOKIE');

    const text = loggedText();
    for (const leaked of [
      'TOKEN-EN-QUERY',
      'TOKEN-EN-CABECERA',
      'SESION-EN-COOKIE',
      'CLAVE-EN-CUERPO',
      '1234567',
      'ana@example.com',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('CA-000-08: un valor lanzado que no es Error se registra sin copiar su contenido', async () => {
    await request(app.getHttpServer()).get('/boom/non-error');

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(loggedText()).not.toContain(SENTINEL);
  });

  it('RF-000-11: la restricción violada de un 23505 queda solo en el log, sin valores', async () => {
    await request(app.getHttpServer()).get('/boom/pg-unique');

    const text = loggedText();
    expect(text).toContain('users_email_key');
    expect(text).not.toContain('ana@example.com');
  });
});
