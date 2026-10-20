/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { metadata, viewport } from './layout';

jest.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'bricolage', variable: 'var-bricolage' }),
  Atkinson_Hyperlegible: () => ({ className: 'atkinson', variable: 'var-atkinson' }),
}));

jest.mock('@/components/features/shell/session-bar', () => ({ SessionBar: () => null }));

describe('RootLayout (RF-000-16)', () => {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p>Pantalla de prueba</p>
    </RootLayout>,
  );
  const bodyClass = /<body class="([^"]*)"/.exec(html)?.[1].split(' ') ?? [];

  it('RF-000-16: declara el idioma es-BO y las variables de las dos fuentes en <html>', () => {
    expect(html).toContain('<html lang="es-BO" class="var-bricolage var-atkinson">');
  });

  it('RF-000-16: aplica el fondo, el color de texto y la fuente base al body', () => {
    expect(bodyClass).toEqual(expect.arrayContaining(['bg-bg', 'text-ink', 'font-sans']));
  });

  it('RF-000-16: envuelve a los hijos con el salto al contenido y la región de avisos', () => {
    expect(html).toContain('Pantalla de prueba');
    expect(html).toContain('Saltar al contenido');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<main id="contenido"');
  });

  it('RF-000-16: define el título con plantilla y el color de tema de la marca', () => {
    expect(metadata.title).toEqual({ default: 'Vaquita', template: '%s · Vaquita' });
    expect(metadata.description).toEqual(expect.any(String));
    expect(viewport.themeColor).toBe('#1E6B4E');
  });
});
