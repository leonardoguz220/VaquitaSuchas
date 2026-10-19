import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogServicesState, UseCatalogServicesResult } from '@/hooks/use-catalog-services';
import { ApiError } from '@/services/http';
import { catalogServices, netflix, spotify, tigoPlay } from './__fixtures__/catalog';
import { ServicePicker } from './service-picker';

function catalog(
  state: CatalogServicesState,
  extra: Partial<UseCatalogServicesResult> = {},
): UseCatalogServicesResult {
  return {
    state,
    retry: jest.fn(),
    loadMore: jest.fn(),
    isLoadingMore: false,
    loadMoreFailed: false,
    ...extra,
  };
}

const success = (items = catalogServices, nextCursor: string | null = null) =>
  catalog({ status: 'success', items, nextCursor });

function renderPicker(value: UseCatalogServicesResult) {
  const onSelect = jest.fn();
  const onCustom = jest.fn();
  render(<ServicePicker catalog={value} onSelect={onSelect} onCustom={onCustom} />);
  return { onSelect, onCustom };
}

const CUSTOM = /¿No está tu servicio\? Crear uno personalizado/;

describe('ServicePicker (T011, plan 004 §6, paso 1 de /grupos/nuevo)', () => {
  it('RF-004-02: mientras carga muestra esqueletos y anuncia la carga', () => {
    renderPicker(catalog({ status: 'loading' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cargando servicios…');
    expect(screen.getAllByTestId('service-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: CUSTOM })).not.toBeInTheDocument();
  });

  it('RF-004-02: con datos muestra cada servicio con nombre, categoría y «desde» en el orden de la API', () => {
    renderPicker(success());
    const list = screen.getByRole('list', { name: 'Servicios del catálogo' });
    const cards = within(list).getAllByRole('button');
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('Netflix'),
      expect.stringContaining('Spotify'),
      expect.stringContaining('Tigo Play'),
    ]);
    const card = screen.getByRole('button', { name: /Netflix/ });
    expect(card).toHaveTextContent('Video');
    expect(card).toHaveTextContent('desde USD 7,99');
  });

  it('RF-004-02: «desde» en Bs y en USD tal como llegan, sin convertir ni redondear', () => {
    renderPicker(success());
    expect(screen.getByRole('button', { name: /Tigo Play/ })).toHaveTextContent('desde Bs 25,51');
    expect(screen.getByRole('button', { name: /Spotify/ })).toHaveTextContent('desde USD 17,99');
    expect(screen.getByRole('button', { name: /Spotify/ })).not.toHaveTextContent('Bs');
    expect(screen.getByRole('button', { name: /Netflix/ })).not.toHaveTextContent('Bs');
  });

  it('CA-004-12: un servicio con logo roto muestra la inicial sobre su color de marca', () => {
    renderPicker(success([spotify]));
    const card = screen.getByRole('button', { name: /Spotify/ });
    fireEvent.error(card.querySelector('img') as HTMLImageElement);
    const initial = within(card).getByTestId('service-logo-initial');
    expect(initial).toHaveTextContent('S');
    expect(initial).toHaveStyle({ backgroundColor: spotify.brandColor as string });
  });

  it('RF-004-02: elegir una tarjeta entrega el servicio completo', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker(success());
    await user.click(screen.getByRole('button', { name: /Tigo Play/ }));
    expect(onSelect).toHaveBeenCalledWith(tigoPlay);
  });

  it('RF-004-09: al final está la tarjeta «¿No está tu servicio? Crear uno personalizado»', async () => {
    const user = userEvent.setup();
    const { onCustom, onSelect } = renderPicker(success());
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toHaveAccessibleName(CUSTOM);

    await user.click(screen.getByRole('button', { name: CUSTOM }));
    expect(onCustom).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('RF-004-09: con el catálogo vacío muestra un mensaje y sugiere el personalizado', async () => {
    const user = userEvent.setup();
    const { onCustom } = renderPicker(success([]));
    expect(screen.getByText('Todavía no hay servicios en el catálogo.')).toBeVisible();
    expect(screen.getByText(/crear una suscripción personalizada/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: CUSTOM }));
    expect(onCustom).toHaveBeenCalled();
  });

  it('RF-004-02: si falla muestra el error con Reintentar y deja el personalizado', async () => {
    const user = userEvent.setup();
    const value = catalog({ status: 'error', error: new ApiError(500, 'INTERNAL_ERROR', 'x') });
    renderPicker(value);
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el catálogo.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(value.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: CUSTOM })).toBeVisible();
  });

  it('RF-004-02: sin conexión lo dice con otras palabras', () => {
    renderPicker(catalog({ status: 'error', error: new ApiError(0, 'NETWORK_ERROR', 'x') }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo contactar con el servidor.');
  });

  it('CA-004-09: mientras redirige a /ingresar no muestra datos ni errores', () => {
    renderPicker(catalog({ status: 'redirecting' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Redirigiendo para iniciar sesión…');
  });

  it('RF-004-04: con más páginas ofrece «Ver más servicios» y avisa si falla', async () => {
    const user = userEvent.setup();
    const value = success([netflix], 'c1');
    const { rerender } = render(
      <ServicePicker catalog={value} onSelect={jest.fn()} onCustom={jest.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Ver más servicios' }));
    expect(value.loadMore).toHaveBeenCalled();

    rerender(
      <ServicePicker
        catalog={{ ...value, loadMoreFailed: true }}
        onSelect={jest.fn()}
        onCustom={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar más servicios.');
  });

  it('RNF-004-02: tarjetas de ancho completo en celular y grilla desde pantallas medianas, con 44 px o más', () => {
    renderPicker(success());
    const list = screen.getByRole('list', { name: 'Servicios del catálogo' });
    expect(list).toHaveClass('grid-cols-1', 'sm:grid-cols-2');
    for (const button of within(list).getAllByRole('button')) {
      expect(button).toHaveClass('w-full', 'min-h-20');
    }
    expect(screen.getByRole('button', { name: CUSTOM })).toHaveClass('w-full', 'min-h-20');
  });
});
