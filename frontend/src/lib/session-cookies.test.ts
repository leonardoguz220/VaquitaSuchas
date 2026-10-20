import {
  REGISTRATION_COOKIE,
  REGISTRATION_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readCookie,
  serializeClearedCookie,
  serializeCookie,
} from './session-cookies';

describe('session-cookies (RF-000-15, contrato C)', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  function setNodeEnv(value: string) {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  }

  it('RF-000-15: los nombres y duraciones son los del contrato C y la spec 003', () => {
    expect(SESSION_COOKIE).toBe('vq_session');
    expect(REGISTRATION_COOKIE).toBe('vq_reg');
    expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(REGISTRATION_MAX_AGE_SECONDS).toBe(24 * 60 * 60);
  });

  it('RF-000-15: la cookie es httpOnly, SameSite=Lax, Path=/ y sin Secure fuera de producción', () => {
    setNodeEnv('test');
    const cookie = serializeCookie(SESSION_COOKIE, 'abc.def', SESSION_MAX_AGE_SECONDS);
    expect(cookie).toBe('vq_session=abc.def; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax');
  });

  it('RF-000-15: en producción la cookie lleva Secure', () => {
    setNodeEnv('production');
    expect(serializeCookie(REGISTRATION_COOKIE, 'x', REGISTRATION_MAX_AGE_SECONDS)).toBe(
      'vq_reg=x; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure',
    );
  });

  it('RF-000-15: borrar una cookie usa Max-Age=0 con los mismos atributos', () => {
    setNodeEnv('test');
    expect(serializeClearedCookie(SESSION_COOKIE)).toBe(
      'vq_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });

  it('RF-000-15: codifica valores con caracteres especiales y los lee de vuelta', () => {
    setNodeEnv('test');
    const cookie = serializeCookie(SESSION_COOKIE, 'a;b c', 10);
    expect(cookie.startsWith('vq_session=a%3Bb%20c;')).toBe(true);
    expect(readCookie('otra=1; vq_session=a%3Bb%20c', SESSION_COOKIE)).toBe('a;b c');
  });

  it('RF-000-15: readCookie devuelve null si falta la cookie, el encabezado o está vacía', () => {
    expect(readCookie(null, SESSION_COOKIE)).toBeNull();
    expect(readCookie('vq_reg=1', SESSION_COOKIE)).toBeNull();
    expect(readCookie('vq_session=', SESSION_COOKIE)).toBeNull();
    expect(readCookie('xvq_session=1', SESSION_COOKIE)).toBeNull();
  });

  it('RF-000-15: readCookie tolera valores mal codificados sin lanzar', () => {
    expect(readCookie('vq_session=%E0%A4%A', SESSION_COOKIE)).toBe('%E0%A4%A');
  });
});
