import { jest } from '@jest/globals';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestIdMiddleware } from './request-id.middleware.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function run(header: string | string[] | undefined): {
  request: IncomingMessage;
  setHeader: jest.Mock;
  next: jest.Mock;
} {
  const request = { headers: { 'x-request-id': header } } as unknown as IncomingMessage;
  const setHeader = jest.fn();
  const next = jest.fn();
  requestIdMiddleware(request, { setHeader } as unknown as ServerResponse, next as () => void);
  return { request, setHeader, next };
}

describe('requestIdMiddleware (RF-000-13)', () => {
  it('RF-000-13: conserva un X-Request-Id válido, lo asigna a req.id y lo devuelve en la respuesta', () => {
    const { request, setHeader, next } = run('front-123');

    expect(request.id).toBe('front-123');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'front-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([[undefined], ['abc\nINJECTED'], ['a'.repeat(500)], [['a', 'b']]])(
    'RF-000-13: con el X-Request-Id %j genera un UUID v4 nuevo',
    (header) => {
      const { request, setHeader } = run(header);

      expect(request.id).toMatch(UUID_V4);
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', request.id);
    },
  );
});
