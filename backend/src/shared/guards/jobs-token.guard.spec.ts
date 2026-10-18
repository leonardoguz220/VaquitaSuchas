import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DomainError } from '../errors/domain-error.js';
import { JobsTokenGuard } from './jobs-token.guard.js';

const JOBS_TOKEN = 'a'.repeat(64);
const config = { getOrThrow: () => JOBS_TOKEN } as unknown as ConfigService;

const contextFor = (headers: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

function expectRejection(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Se esperaba que el guard rechazara la petición.');
}

describe('JobsTokenGuard (RF-000-11)', () => {
  const guard = new JobsTokenGuard(config);

  it('RF-000-11: con X-Jobs-Token correcto deja pasar', () => {
    expect(guard.canActivate(contextFor({ 'x-jobs-token': JOBS_TOKEN }))).toBe(true);
  });

  it.each([
    ['ausente', {}],
    ['vacío', { 'x-jobs-token': '' }],
    ['incorrecto', { 'x-jobs-token': 'b'.repeat(64) }],
    ['más corto', { 'x-jobs-token': JOBS_TOKEN.slice(0, 63) }],
    ['más largo', { 'x-jobs-token': `${JOBS_TOKEN}a` }],
    ['en otra capitalización del valor', { 'x-jobs-token': JOBS_TOKEN.toUpperCase() }],
    ['repetido (arreglo)', { 'x-jobs-token': [JOBS_TOKEN, JOBS_TOKEN] }],
    ['no texto', { 'x-jobs-token': 12345 }],
  ])('RF-000-11: X-Jobs-Token %s responde 401 UNAUTHENTICATED', (_name, headers) => {
    const error = expectRejection(() => guard.canActivate(contextFor(headers)));

    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('RF-000-11: el rechazo no revela el token enviado ni el esperado', () => {
    const sent = 'intento-de-token-secreto';

    const error = expectRejection(() => guard.canActivate(contextFor({ 'x-jobs-token': sent })));

    const text = JSON.stringify({ message: error.message, details: error.details });
    expect(text).not.toContain(sent);
    expect(text).not.toContain(JOBS_TOKEN);
  });

  it('RF-000-11: la ausencia y el valor incorrecto dan exactamente el mismo error', () => {
    const missing = expectRejection(() => guard.canActivate(contextFor({})));
    const wrong = expectRejection(() => guard.canActivate(contextFor({ 'x-jobs-token': 'x' })));

    expect(wrong.message).toBe(missing.message);
    expect(wrong.code).toBe(missing.code);
    expect(wrong.httpStatus).toBe(missing.httpStatus);
  });
});
