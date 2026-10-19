import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { validateSync, IsString } from 'class-validator';
import { DomainError } from './domain-error.js';
import { mapException } from './map-exception.js';

describe('mapException', () => {
  it('RF-000-11: un DomainError conserva su httpStatus, code, message y details', () => {
    const mapped = mapException(
      new DomainError('INVALID_TRANSITION', 409, 'Este cobro ya no admite cambios.', {
        from: 'pagado',
        action: 'uploadReceipt',
      }),
    );

    expect(mapped.body).toEqual({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
      message: 'Este cobro ya no admite cambios.',
      details: { from: 'pagado', action: 'uploadReceipt' },
    });
  });

  it('RF-000-11: la respuesta de un DomainError sin details no incluye la propiedad', () => {
    const mapped = mapException(new DomainError('NOT_FOUND', 404, 'No existe.'));

    expect(Object.keys(mapped.body)).toEqual(['statusCode', 'code', 'message']);
  });

  it.each([
    [new BadRequestException('x'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedException('x'), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException('x'), 403, 'FORBIDDEN'],
    [new NotFoundException('x'), 404, 'NOT_FOUND'],
    [new ConflictException('x'), 409, 'CONFLICT'],
    [new PayloadTooLargeException('x'), 413, 'FILE_TOO_LARGE'],
    [new UnsupportedMediaTypeException('x'), 415, 'UNSUPPORTED_FILE_TYPE'],
    [new UnprocessableEntityException('x'), 422, 'BUSINESS_RULE'],
    [new HttpException('x', 429), 429, 'RATE_LIMITED'],
    [new InternalServerErrorException('x'), 500, 'INTERNAL_ERROR'],
    [new ServiceUnavailableException('x'), 503, 'SERVICE_UNAVAILABLE'],
  ])('RF-000-11: HttpException %# se traduce al código común de A.3', (error, status, code) => {
    const { body } = mapException(error);

    expect(body.statusCode).toBe(status);
    expect(body.code).toBe(code);
    expect(body.message).not.toBe('x');
  });

  it('CA-000-08: el mensaje de una HttpException no llega al cliente', () => {
    const { body } = mapException(new NotFoundException('Cannot GET /usuarios/SECRETO-INTERNO'));

    expect(JSON.stringify(body)).not.toContain('SECRETO-INTERNO');
  });

  it('RF-000-11: una HttpException 4xx fuera de A.3 conserva su estado y usa VALIDATION_ERROR', () => {
    const { body } = mapException(new HttpException('x', 405));

    expect(body.statusCode).toBe(405);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('RF-000-11: una HttpException 5xx fuera de A.3 se vuelve 500 INTERNAL_ERROR', () => {
    const { body } = mapException(new HttpException('x', 502));

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('RF-000-11: un error de cuerpo mal formado de Express (http-errors 400) es VALIDATION_ERROR', () => {
    const bodyParserError = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      statusCode: 400,
      expose: true,
      type: 'entity.parse.failed',
    });

    const { body } = mapException(bodyParserError);

    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body)).not.toContain('Unexpected token');
  });

  it('RF-000-11: errores de class-validator lanzados tal cual son VALIDATION_ERROR con details.fields', () => {
    class Dto {
      @IsString({ message: 'REQUIRED_TEXT' })
      name!: string;
    }
    const errors = validateSync(new Dto());

    const { body } = mapException(errors);

    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { name: ['REQUIRED_TEXT'] } },
    });
  });

  it('RF-000-11: la violación de unicidad 23505 de PostgreSQL es CONFLICT 409 sin constraint ni valores', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'users_email_key',
      table: 'users',
      detail: 'Key (email)=(ana@example.com) already exists.',
    });

    const { body, logDetail } = mapException(pgError);

    expect(body.statusCode).toBe(409);
    expect(body.code).toBe('CONFLICT');
    expect(body.details).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('users_email_key');
    expect(serialized).not.toContain('ana@example.com');
    expect(serialized).not.toContain('users');
    // El nombre de la restricción sí ayuda a depurar, pero solo en el log y sin valores.
    expect(logDetail).toContain('users_email_key');
    expect(logDetail).not.toContain('ana@example.com');
  });

  it('RF-000-11: otros códigos de PostgreSQL son INTERNAL_ERROR genérico', () => {
    const fkError = Object.assign(new Error('violates foreign key constraint'), { code: '23503' });

    const { body } = mapException(fkError);

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('CA-000-08: un Error cualquiera es INTERNAL_ERROR y no filtra mensaje, traza ni ruta', () => {
    const error = new Error('fallo SECRETO-INTERNO en C:\\app\\src\\users.service.ts');

    const { body, stack } = mapException(error);

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
    });
    expect(stack).toContain('SECRETO-INTERNO');
  });

  it.each([['texto suelto'], [42], [null], [undefined], [{ foo: 'bar' }]])(
    'CA-000-08: un valor lanzado que no es Error (%j) es INTERNAL_ERROR genérico',
    (thrown) => {
      const { body, stack } = mapException(thrown);

      expect(body.statusCode).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(stack).toBeUndefined();
    },
  );
});
