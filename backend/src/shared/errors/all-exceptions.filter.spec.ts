import { jest } from '@jest/globals';
import { NotFoundException, type ArgumentsHost, type LoggerService } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { DomainError } from './domain-error.js';

interface FakeResponse {
  headersSent: boolean;
  status: jest.Mock<(code: number) => FakeResponse>;
  json: jest.Mock<(body: unknown) => FakeResponse>;
  end: jest.Mock<() => void>;
}

function setup(options: { headersSent?: boolean; type?: string; url?: string } = {}) {
  const response: FakeResponse = {
    headersSent: options.headersSent ?? false,
    status: jest.fn<(code: number) => FakeResponse>(() => response),
    json: jest.fn<(body: unknown) => FakeResponse>(() => response),
    end: jest.fn<() => void>(),
  };
  const request = {
    method: 'POST',
    originalUrl: options.url ?? '/cobros?token=TOKEN-EN-QUERY',
    headers: { authorization: 'Bearer TOKEN-EN-CABECERA', cookie: 'vq_session=SESION' },
    body: { password: 'CLAVE-EN-CUERPO', ci: '1234567' },
  };
  const host = {
    getType: () => options.type ?? 'http',
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService & Record<'error' | 'warn' | 'debug', jest.Mock>;
  return { filter: new AllExceptionsFilter(logger), host, response, logger };
}

function loggedText(logger: Record<'error' | 'warn' | 'debug', jest.Mock>): string {
  return JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls, logger.debug.mock.calls]);
}

describe('AllExceptionsFilter', () => {
  it('RF-000-11: responde con el estado y el cuerpo del formato A.2', () => {
    const { filter, host, response } = setup();

    filter.catch(new DomainError('BUSINESS_RULE', 422, 'No cumple.', { rule: 'RN-001-14' }), host);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 422,
      code: 'BUSINESS_RULE',
      message: 'No cumple.',
      details: { rule: 'RN-001-14' },
    });
  });

  it('CA-000-08: un error no controlado se registra con su traza en el log, no en la respuesta', () => {
    const { filter, host, response, logger } = setup();
    const error = new Error('fallo SECRETO-INTERNO');

    filter.catch(error, host);

    expect(JSON.stringify(response.json.mock.calls)).not.toContain('SECRETO-INTERNO');
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, stack] = logger.error.mock.calls[0] as [string, string];
    expect(message).toBe('POST /cobros -> 500 INTERNAL_ERROR');
    expect(stack).toBe(error.stack);
    expect(stack).toContain('SECRETO-INTERNO');
  });

  it('CA-000-08: el log no incluye query, cabeceras ni cuerpo de la petición', () => {
    const { filter, host, logger } = setup();

    filter.catch(new Error('boom'), host);

    const text = loggedText(logger);
    expect(text).not.toContain('TOKEN-EN-QUERY');
    expect(text).not.toContain('TOKEN-EN-CABECERA');
    expect(text).not.toContain('SESION');
    expect(text).not.toContain('CLAVE-EN-CUERPO');
    expect(text).not.toContain('1234567');
  });

  it('RF-000-11: un 4xx esperado se registra como debug y sin traza', () => {
    const { filter, host, logger } = setup();

    filter.catch(new NotFoundException('x'), host);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('POST /cobros -> 404 NOT_FOUND');
  });

  it('RF-000-11: la violación 23505 registra la restricción en el log y no en la respuesta', () => {
    const { filter, host, response, logger } = setup();
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'users_email_key',
    });

    filter.catch(pgError, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('users_email_key');
    expect(loggedText(logger)).toContain('users_email_key');
  });

  it('CA-000-08: un valor lanzado que no es Error se registra sin copiar su contenido', () => {
    const { filter, host, response, logger } = setup();

    filter.catch('CONTENIDO-SENSIBLE', host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(loggedText(logger)).not.toContain('CONTENIDO-SENSIBLE');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('RF-000-11: si la respuesta ya empezó, cierra la conexión sin escribir otro cuerpo', () => {
    const { filter, host, response } = setup({ headersSent: true });

    filter.catch(new Error('tarde'), host);

    expect(response.json).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('RF-000-11: fuera de HTTP solo registra el error y no toca la respuesta', () => {
    const { filter, host, response, logger } = setup({ type: 'rpc' });

    filter.catch(new Error('x'), host);

    expect(response.json).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
