import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { listingView } from '@/services/__fixtures__/listings';
import { ApiError } from '@/services/http';
import { getListing } from '@/services/listings';
import ListingPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  getListing: jest.fn(),
}));

const mocked = jest.mocked(getListing);

async function renderPage(id = 'l1') {
  const ui = await ListingPage({ params: Promise.resolve({ id }) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue(listingView());
});

describe('/cupos/[id] (spec 008 T015)', () => {
  it('RF-008-03: la ruta es protegida y pide la publicación del segmento', async () => {
    expect(metadata.title).toBe('Cupo libre');
    expect(isPublicPath('/cupos/l1')).toBe(false);
    await renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' }),
    ).toBeVisible();
    expect(mocked).toHaveBeenCalledWith('l1');
    expect(screen.getByRole('link', { name: 'Volver a cupos libres' })).toHaveAttribute(
      'href',
      '/cupos',
    );
  });

  it('RF-008-03: muestra cupos, día, fechas, cuota «estimada», titular con nivel y ventana', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' });
    expect(screen.getByText('2 cupos libres · Cobro el día 18')).toBeVisible();
    expect(screen.getByText(/Publicado el 18 oct 2026 · Vence el 17 nov 2026/)).toBeVisible();
    const summary = screen.getByRole('region', { name: 'Resumen' });
    expect(summary).toHaveTextContent('Cuota estimadaBs 9,30');
    expect(summary).toHaveTextContent('La cuota es estimada');
    expect(within(summary).getByText('Valeria Choque')).toBeVisible();
    expect(within(summary).getByText('Nivel: Excelente')).toBeVisible();
    expect(within(summary).getByText('Abierta hasta el 20 oct 2026, 23:59')).toBeVisible();
  });

  it('CA-008-23: con la ventana cerrada muestra «Se abre el [fecha]»', async () => {
    mocked.mockResolvedValue(
      listingView({
        entryWindow: { isOpen: false, opensAt: '2026-11-18T04:00:00.000Z', closesAt: null },
      }),
    );
    await renderPage();
    expect(await screen.findByText('Se abre el 18 nov 2026')).toBeVisible();
  });

  it('CA-008-19: un <script> en la descripción aparece como texto plano, sin enlaces activos', async () => {
    mocked.mockResolvedValue(
      listingView({
        description: '<script>alert("x")</script>\nMás en https://ejemplo.com',
        conditions: '<a href="https://ejemplo.com">Pagar aquí</a>',
      }),
    );
    await renderPage();
    const description = await screen.findByText(/<script>alert\("x"\)<\/script>/);
    expect(description).toHaveClass('whitespace-pre-wrap');
    expect(description).toHaveTextContent('Más en https://ejemplo.com');
    expect(screen.getByText('<a href="https://ejemplo.com">Pagar aquí</a>')).toBeVisible();
    const texts = screen.getByRole('region', { name: 'Descripción y condiciones' });
    expect(texts.querySelector('script')).toBeNull();
    expect(within(texts).queryByRole('link')).toBeNull();
  });

  it('CA-008-05: no muestra miembros, datos de pago ni código de invitación', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' });
    expect(document.body).not.toHaveTextContent(/código de invitación|datos de pago|miembros:/i);
  });

  it('RF-008-03: sin descripción ni condiciones no muestra esa sección', async () => {
    mocked.mockResolvedValue(listingView({ description: null, conditions: null }));
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' });
    expect(screen.queryByRole('region', { name: 'Descripción y condiciones' })).toBeNull();
  });

  it('RF-008-08: con 404 dice que no la encontró, sin Reintentar', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'LISTING_NOT_FOUND', 'x'));
    await renderPage();
    expect(await screen.findByText('No encontramos esta publicación.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('RF-008-03: mientras carga muestra el esqueleto; con otro error ofrece Reintentar', async () => {
    mocked
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(listingView());
    const first = render(await ListingPage({ params: Promise.resolve({ id: 'l1' }) }));
    expect(screen.getByText('Cargando la publicación…')).toBeInTheDocument();
    first.unmount();
    const user = await renderPage();
    expect(await screen.findByText('No pudimos cargar la publicación.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Prime Video · Estándar' }),
    ).toBeVisible();
  });
});

describe('/cupos/[id] (spec 008 T019): solicitar', () => {
  it('RF-008-10: el detalle ofrece «Solicitar un cupo» con el mensaje para el titular', async () => {
    await renderPage();
    const card = await screen.findByRole('region', { name: 'Solicitar un cupo' });
    expect(within(card).getByLabelText('Mensaje para Valeria (opcional)')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Solicitar cupo' })).toBeEnabled();
  });
});

describe('/cupos/[id] (spec 008 T023): reportar', () => {
  it('RF-008-17: el detalle ofrece «Reportar esta publicación»', async () => {
    await renderPage();
    expect(await screen.findByRole('button', { name: 'Reportar esta publicación' })).toBeVisible();
  });
});
