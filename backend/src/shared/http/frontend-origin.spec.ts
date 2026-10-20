import { isFrontendOrigin, normalizeFrontendOrigin } from './frontend-origin.js';

describe('isFrontendOrigin (RF-000-10)', () => {
  it.each([
    ['https://vaquita.example'],
    ['https://app.vaquita.example'],
    ['http://localhost:3000'],
    ['http://127.0.0.1:3000'],
    ['https://vaquita.vercel.app'],
    ['https://a-b.example:8443'],
  ])('RF-000-10: acepta %s', (value) => {
    expect(isFrontendOrigin(value)).toBe(true);
  });

  it.each([
    ['*', 'comodín'],
    ['https://*.vaquita.example', 'comodín en el host'],
    ['null', 'origen opaco'],
    ['https://vaquita.example/', 'barra final'],
    ['https://vaquita.example/app', 'ruta'],
    ['https://vaquita.example?x=1', 'query'],
    ['https://vaquita.example#x', 'fragmento'],
    ['ftp://vaquita.example', 'esquema que no es http(s)'],
    ['javascript://vaquita.example', 'esquema peligroso'],
    ['vaquita.example', 'sin esquema'],
    ['//vaquita.example', 'sin esquema (relativo al protocolo)'],
    ['https://vaquita.example ', 'espacio final'],
    [' https://vaquita.example', 'espacio inicial'],
    ['https://vaqui ta.example', 'espacio interno'],
    ['https://user:pass@vaquita.example', 'credenciales en la URL'],
    ['https://vaquita.example:0', 'puerto 0'],
    ['https://vaquita.example:99999', 'puerto fuera de rango'],
    ['https://vaquita.example:', 'puerto vacío'],
    ['https://Vaquita.Example', 'mayúsculas (el navegador envía el origen en minúsculas)'],
    ['https://vaquita.example,https://evil.example', 'lista de orígenes'],
    ['https://vaquita.example\nhttps://evil.example', 'salto de línea'],
    ['', 'cadena vacía'],
  ])('RF-000-10: rechaza %s (%s)', (value) => {
    expect(isFrontendOrigin(value)).toBe(false);
  });
});

describe('normalizeFrontendOrigin (RF-000-10)', () => {
  it('RF-000-10: sin valor o en blanco devuelve undefined (CORS cerrado)', () => {
    expect(normalizeFrontendOrigin(undefined)).toBeUndefined();
    expect(normalizeFrontendOrigin('')).toBeUndefined();
    expect(normalizeFrontendOrigin('   ')).toBeUndefined();
  });

  it('RF-000-10: devuelve el origen válido tal cual', () => {
    expect(normalizeFrontendOrigin('https://vaquita.example')).toBe('https://vaquita.example');
  });

  it('RF-000-10: un valor inválido lanza un error que no imprime el valor', () => {
    const invalid = 'https://vaquita.example/ruta-secreta';

    expect(() => normalizeFrontendOrigin(invalid)).toThrow(/FRONTEND_ORIGIN/);
    try {
      normalizeFrontendOrigin(invalid);
    } catch (error) {
      expect((error as Error).message).not.toContain('ruta-secreta');
    }
  });
});
