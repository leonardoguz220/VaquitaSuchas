import { fireEvent, render, screen } from '@testing-library/react';
import { FALLBACK_BRAND_COLOR } from '@/lib/brand-color';
import { ServiceLogo } from './service-logo';

const LOGO = 'https://cdn.vaquita.test/logos/netflix.svg';

const tile = () => screen.getByTestId('service-logo');

describe('ServiceLogo (spec 004 T008)', () => {
  it('RF-004-05: con URL muestra la imagen sin enviar Referer y oculta el recuadro al lector', () => {
    render(<ServiceLogo name="Netflix" logoUrl={LOGO} brandColor="#E50914" />);
    const img = tile().querySelector('img');
    expect(img).toHaveAttribute('src', LOGO);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('alt', '');
    expect(tile()).toHaveAttribute('aria-hidden', 'true');
    expect(tile()).not.toHaveTextContent('N');
  });

  it('CA-004-12: la imagen rota cae a la inicial sobre brandColor', () => {
    render(<ServiceLogo name="netflix" logoUrl={LOGO} brandColor="#E50914" />);
    fireEvent.error(tile().querySelector('img')!);

    expect(tile().querySelector('img')).toBeNull();
    expect(tile()).toHaveTextContent('N');
    expect(tile()).toHaveStyle({ backgroundColor: '#E50914', color: '#FFFFFF' });
  });

  it('CA-004-12: sin URL de logo usa la inicial sobre brandColor', () => {
    render(<ServiceLogo name="Spotify" logoUrl={null} brandColor="#1DB954" />);
    expect(tile().querySelector('img')).toBeNull();
    expect(tile()).toHaveTextContent('S');
    expect(tile()).toHaveStyle({ backgroundColor: '#1DB954' });
  });

  it('CA-004-12: logo roto y sin color de marca usa la inicial sobre el verde de Vaquita', () => {
    render(<ServiceLogo name="Mi servicio" logoUrl={LOGO} brandColor={null} />);
    fireEvent.error(tile().querySelector('img')!);
    expect(tile()).toHaveTextContent('M');
    expect(tile()).toHaveStyle({ backgroundColor: FALLBACK_BRAND_COLOR });
  });

  it('CA-004-12: si llega otra URL después de un error vuelve a intentar con la imagen', () => {
    const { rerender } = render(<ServiceLogo name="Netflix" logoUrl={LOGO} brandColor="#E50914" />);
    fireEvent.error(tile().querySelector('img')!);
    expect(tile()).toHaveTextContent('N');

    const other = 'https://cdn.vaquita.test/logos/netflix-2.svg';
    rerender(<ServiceLogo name="Netflix" logoUrl={other} brandColor="#E50914" />);
    expect(tile().querySelector('img')).toHaveAttribute('src', other);
  });
});
