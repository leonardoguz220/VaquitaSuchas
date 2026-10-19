import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { INK, WHITE } from '@/lib/color-contrast';
import { NEUTRAL_LOGO_BACKGROUND, ServiceLogo, serviceInitial } from './ServiceLogo';

const NETFLIX_LOGO = 'https://cdn.example.com/logos/netflix.svg';

function initialTile() {
  return screen.getByTestId('service-logo-initial');
}

describe('ServiceLogo (T008, CA-004-12, plan 004 §6)', () => {
  it('CA-004-12: con logo muestra la imagen externa sin enviar el referer y con carga diferida', () => {
    const { container } = render(
      <ServiceLogo name="Netflix" logoUrl={NETFLIX_LOGO} brandColor="#E50914" />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', NETFLIX_LOGO);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
    // Decorativa por defecto: el nombre se muestra al lado.
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryByTestId('service-logo-initial')).not.toBeInTheDocument();
  });

  it('CA-004-12: si la imagen se rompe, muestra la inicial sobre brandColor', () => {
    const { container } = render(
      <ServiceLogo name="Netflix" logoUrl={NETFLIX_LOGO} brandColor="#E50914" />,
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(initialTile()).toHaveTextContent('N');
    expect(initialTile()).toHaveStyle({ backgroundColor: '#E50914' });
  });

  it('CA-004-12: con logoUrl null muestra la inicial sobre brandColor sin pedir imagen', () => {
    const { container } = render(
      <ServiceLogo name="Spotify" logoUrl={null} brandColor="#14743A" />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(initialTile()).toHaveTextContent('S');
    expect(initialTile()).toHaveStyle({ backgroundColor: '#14743A', color: WHITE });
  });

  it('CA-004-12: sin brandColor (o con un color inválido) usa el fondo neutro de los tokens', () => {
    const { rerender } = render(<ServiceLogo name="Max" logoUrl={null} brandColor={null} />);
    expect(initialTile()).toHaveStyle({ backgroundColor: NEUTRAL_LOGO_BACKGROUND, color: WHITE });

    rerender(<ServiceLogo name="Max" logoUrl={null} brandColor="rojo" />);
    expect(initialTile()).toHaveStyle({ backgroundColor: NEUTRAL_LOGO_BACKGROUND });
  });

  it('CA-004-12: el fondo neutro es el token muted de globals.css', () => {
    const css = readFileSync(path.join(__dirname, '../../../app/globals.css'), 'utf8');
    expect(css).toMatch(new RegExp(`--color-muted:\\s*${NEUTRAL_LOGO_BACKGROUND};`, 'i'));
  });

  it('CA-004-12: sobre un color de marca claro la inicial va en ink para mantener 4.5:1', () => {
    render(<ServiceLogo name="Crunchyroll" logoUrl={null} brandColor="#FFD60A" />);
    expect(initialTile()).toHaveStyle({ color: INK });
  });

  it.each([
    ['ánime club', 'Á'],
    ['éxito', 'É'],
    ['ñandú', 'Ñ'],
    ['youTube premium', 'Y'],
    ['  disney+', 'D'],
  ])('CA-004-12: la inicial de "%s" es "%s" (mayúscula, con tilde)', (name, expected) => {
    expect(serviceInitial(name)).toBe(expected);
    render(<ServiceLogo name={name} logoUrl={null} brandColor="#1D3A8A" />);
    expect(initialTile()).toHaveTextContent(expected);
  });

  it('CA-004-12: un nombre vacío no rompe el componente', () => {
    expect(serviceInitial('   ')).toBe('?');
  });

  it('CA-004-12: decorativo por defecto, la inicial no se anuncia (el nombre está al lado)', () => {
    render(<ServiceLogo name="Netflix" logoUrl={null} brandColor="#E50914" />);
    expect(initialTile()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('CA-004-12: usado solo (decorative=false), la imagen y la inicial llevan el nombre', () => {
    const { container, rerender } = render(
      <ServiceLogo name="Netflix" logoUrl={NETFLIX_LOGO} brandColor="#E50914" decorative={false} />,
    );
    expect(screen.getByRole('img', { name: 'Netflix' })).toBe(container.querySelector('img'));

    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByRole('img', { name: 'Netflix' })).toHaveTextContent('N');

    rerender(<ServiceLogo name="Spotify" logoUrl={null} brandColor={null} decorative={false} />);
    expect(screen.getByRole('img', { name: 'Spotify' })).toHaveTextContent('S');
  });

  it('CA-004-12: si cambia la URL tras un error, vuelve a intentar con la nueva imagen', () => {
    const { container, rerender } = render(
      <ServiceLogo name="Netflix" logoUrl={NETFLIX_LOGO} brandColor="#E50914" />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(
      <ServiceLogo
        name="Netflix"
        logoUrl="https://cdn.example.com/logos/netflix-2.svg"
        brandColor="#E50914"
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/logos/netflix-2.svg',
    );
  });
});
