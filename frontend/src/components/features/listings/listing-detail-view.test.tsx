import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { getListing, type ListingView } from '@/services/listings';
import { ListingDetailView } from './listing-detail-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  getListing: jest.fn(),
}));

const mockedGet = jest.mocked(getListing);

function listing(overrides: Partial<ListingView> = {}): ListingView {
  return {
    id: 'l1',
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#0F5E8C',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: { fullName: 'Valeria Choque', level: 'Excelente' },
    description: 'Somos una familia.\nBuscamos dos personas puntuales.',
    conditions: 'Pago por QR dentro del plazo.',
    publishedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: '2026-10-29T14:00:00.000Z',
    entryWindow: { isOpen: true, opensAt: null, closesAt: '2026-10-21T03:59:00.000Z' },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
    ...overrides,
  };
}

beforeEach(() => mockedGet.mockReset());

describe('/cupos/[id] detalle de un cupo (spec 008 T015)', () => {
  it('RF-008-07: mientras carga muestra el esqueleto', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<ListingDetailView listingId="l1" />);
    expect(screen.getByText('Cargando la publicación…')).toBeInTheDocument();
  });

  it('RF-008-07: muestra servicio, cupos, cuota estimada, titular con su nivel y la ventana', async () => {
    mockedGet.mockResolvedValue(listing());
    render(<ListingDetailView listingId="l1" />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' }),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith('l1');
    expect(screen.getByText('2 cupos libres · cobro el día 18')).toBeVisible();
    expect(screen.getByText('Cuota estimada')).toBeVisible();
    expect(screen.getByText('Bs 9,30')).toBeVisible();
    expect(screen.getByText('Valeria Choque')).toBeVisible();
    expect(screen.getByText('Excelente')).toBeVisible();
    expect(screen.getByText('Abierta hasta el 20 oct 2026')).toBeVisible();
  });

  it('RN-008-07: la cuota se rotula «estimada» y la nota aclara que no es el monto final', async () => {
    mockedGet.mockResolvedValue(listing());
    render(<ListingDetailView listingId="l1" />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Cuota estimada')).toBeVisible();
    expect(screen.getByText(/La cuota es estimada, no es el monto final/)).toBeVisible();
    expect(screen.queryByText(/cotizad/i)).not.toBeInTheDocument();
  });

  it('RNF-008-05: la descripción y las condiciones son texto plano con saltos de línea, sin enlaces', async () => {
    mockedGet.mockResolvedValue(
      listing({
        description:
          'Escribe a <a href="https://ejemplo.com">aquí</a>\n<b>negrita</b> https://ejemplo.com',
        conditions: '<script>alert(1)</script> sin enlaces',
      }),
    );
    render(<ListingDetailView listingId="l1" />);
    await screen.findByRole('heading', { level: 1 });
    const article = screen.getByRole('article');
    expect(within(article).queryAllByRole('link')).toHaveLength(0);
    const description = screen.getByRole('region', { name: 'Descripción' });
    expect(within(description).getByText(/<a href="https:\/\/ejemplo.com">aquí<\/a>/)).toHaveClass(
      'whitespace-pre-wrap',
    );
    expect(description.querySelector('a, b, script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script> sin enlaces/)).toBeVisible();
  });

  it('RF-008-07: sin descripción ni condiciones lo dice con texto', async () => {
    mockedGet.mockResolvedValue(listing({ description: null, conditions: null }));
    render(<ListingDetailView listingId="l1" />);
    expect(await screen.findByText('El titular no escribió una descripción.')).toBeVisible();
    expect(screen.getByText('El titular no indicó condiciones.')).toBeVisible();
  });

  it('RF-008-10: muestra el botón Solicitar y el de reportar (RF-008-17)', async () => {
    mockedGet.mockResolvedValue(listing());
    render(<ListingDetailView listingId="l1" />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('button', { name: 'Solicitar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reportar' })).toBeEnabled();
  });

  it('RF-008-07: un 404 muestra que la publicación ya no existe, con volver a la lista', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'LISTING_NOT_FOUND', 'x'));
    render(<ListingDetailView listingId="l1" />);
    expect(
      await screen.findByRole('heading', { name: 'Esta publicación ya no existe' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a cupos libres' })).toHaveAttribute(
      'href',
      '/cupos',
    );
  });

  it('RF-008-07: con un error muestra Reintentar y vuelve a pedir el detalle', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const actor = userEvent.setup();
    render(<ListingDetailView listingId="l1" />);
    expect(await screen.findByText('No pudimos cargar los cupos libres.')).toBeVisible();
    mockedGet.mockResolvedValue(listing());
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Prime Video/ })).toBeVisible();
  });
});
