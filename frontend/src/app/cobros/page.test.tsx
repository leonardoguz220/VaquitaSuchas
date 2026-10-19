import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { myCharge } from '@/services/__fixtures__/charges';
import { listMyCharges } from '@/services/charges';
import { ApiError } from '@/services/http';
import ChargesPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/cobros',
}));
jest.mock('@/services/charges', () => ({ listMyCharges: jest.fn() }));

const mockedList = jest.mocked(listMyCharges);

const pending = myCharge();
const formerDebt = myCharge({
  id: 'c2',
  period: '2026-09',
  status: 'atrasado',
  amountCents: 1420,
  dueAt: '2026-09-09T04:00:00.000Z',
  member: { userId: 'u2', fullName: 'Ana Quispe Mamani', isFormerMember: true },
  group: { id: 'g9', name: 'Paramount+ del curso', serviceName: 'Paramount+', logoUrl: null },
});
const paid = myCharge({
  id: 'c3',
  status: 'pagado',
  amountCents: 2210,
  paidAt: '2026-10-13T15:00:00.000Z',
  group: { id: 'g3', name: 'Disney+ primos', serviceName: 'Disney+', logoUrl: null },
});
const entry = myCharge({
  id: 'c4',
  period: '2026-09',
  origin: 'ingreso',
  status: 'pagado',
  paidAt: '2026-09-19T15:00:00.000Z',
});
const review = myCharge({ id: 'c5', status: 'en_revision', amountCents: 1640 });
const cancelled = myCharge({ id: 'c6', status: 'cancelado', amountCents: 1000 });

function renderPage() {
  const actor = userEvent.setup();
  render(<ChargesPage />);
  return actor;
}

const card = (name: RegExp) => screen.getByRole('link', { name });

beforeEach(() => {
  replace.mockReset();
  mockedList.mockReset();
});

describe('/cobros "Mis cobros" (spec 002 T018)', () => {
  it('RF-002-15: el título es "Mis cobros", la ruta es protegida y pide la primera página', async () => {
    mockedList.mockResolvedValue({ items: [pending], nextCursor: null });
    expect(metadata.title).toBe('Mis cobros');
    expect(isPublicPath('/cobros')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mis cobros' })).toBeVisible();
    expect(await screen.findByRole('list', { name: 'Tus cobros' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith({ limit: 20 });
  });

  it('RF-002-15: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando tus cobros…')).toBeInTheDocument();
  });

  it('RF-002-15: cada tarjeta muestra grupo, período, vencimiento en La Paz, Bs 19,80 y el estado con texto', async () => {
    mockedList.mockResolvedValue({ items: [pending], nextCursor: null });
    renderPage();
    const link = await screen.findByRole('link', { name: /Spotify depa/ });
    expect(link).toHaveAttribute('href', '/cobros/c1');
    expect(
      within(link).getByText('Octubre 2026 · Vence el 21 oct 2026, 23:59'),
    ).toBeInTheDocument();
    expect(within(link).getByText('Bs 19,80')).toBeInTheDocument();
    expect(within(link).getByText('Pendiente')).toBeInTheDocument();
  });

  it('RNF-002-06: las insignias de los cinco estados llevan texto, no solo color', async () => {
    mockedList.mockResolvedValue({
      items: [pending, review, paid, formerDebt, cancelled],
      nextCursor: null,
    });
    renderPage();
    await screen.findByRole('list', { name: 'Tus cobros' });
    const items = within(screen.getByRole('list', { name: 'Tus cobros' })).getAllByRole('link');
    const labels = items.map((item) =>
      ['Pendiente', 'En revisión', 'Pagado', 'Atrasado', 'Cancelado'].find((label) =>
        within(item).queryByText(label),
      ),
    );
    expect(labels).toEqual(['Pendiente', 'En revisión', 'Pagado', 'Atrasado', 'Cancelado']);
    expect(within(items[1]).getByText('En revisión')).toHaveClass('bg-status-en-revision-bg');
    expect(within(items[3]).getByText('Atrasado')).toHaveClass('bg-status-atrasado-bg');
  });

  it('RF-002-15: pagado muestra la fecha de pago y el de ingreso dice "Pago de ingreso"', async () => {
    mockedList.mockResolvedValue({ items: [paid, entry], nextCursor: null });
    renderPage();
    expect(
      within(await screen.findByRole('link', { name: /Disney\+ primos/ })).getByText(
        'Octubre 2026 · Pagado el 13 oct 2026',
      ),
    ).toBeInTheDocument();
    expect(
      within(card(/Spotify depa/)).getByText('Septiembre 2026 · Pago de ingreso'),
    ).toBeInTheDocument();
  });

  it('CA-002-32: un cobro atrasado de un grupo que dejó lleva el aviso de la deuda', async () => {
    mockedList.mockResolvedValue({ items: [formerDebt, pending], nextCursor: null });
    renderPage();
    const debt = await screen.findByRole('link', { name: /Paramount\+ del curso/ });
    expect(within(debt).getByText('Septiembre 2026 · Venció el 8 sep 2026, 23:59')).toBeVisible();
    expect(
      within(debt).getByText(
        'Ya no perteneces a este grupo. Paga tu deuda para limpiar tu historial.',
      ),
    ).toBeVisible();
    expect(
      within(card(/Spotify depa/)).queryByText(/Ya no perteneces a este grupo/),
    ).not.toBeInTheDocument();
  });

  it('RF-002-15: el filtro por estado lo aplica la API y se marca con aria-pressed', async () => {
    mockedList.mockResolvedValue({ items: [pending], nextCursor: null });
    const actor = renderPage();
    await screen.findByRole('list', { name: 'Tus cobros' });
    const filters = screen.getByRole('group', { name: 'Filtrar por estado' });
    expect(within(filters).getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    await actor.click(within(filters).getByRole('button', { name: 'Atrasado' }));
    expect(within(filters).getByRole('button', { name: 'Atrasado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ status: 'atrasado', limit: 20 }),
    );
    expect(await screen.findByText('No hay cobros con estos filtros')).toBeInTheDocument();
  });

  it('RF-002-15: el filtro por período manda YYYY-MM a la API', async () => {
    mockedList.mockResolvedValue({ items: [pending], nextCursor: null });
    renderPage();
    await screen.findByRole('list', { name: 'Tus cobros' });
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '2026-09' } });
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ period: '2026-09', limit: 20 }),
    );
  });

  it('RF-002-15: sin cobros muestra el estado vacío', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No tienes cobros' })).toBeInTheDocument();
  });

  it('RF-002-15: con error muestra el aviso y Reintentar vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const actor = renderPage();
    expect(await screen.findByText('No pudimos cargar tus cobros.')).toBeInTheDocument();
    mockedList.mockResolvedValue({ items: [pending], nextCursor: null });
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /Spotify depa/ })).toBeInTheDocument();
  });

  it('RF-002-15: sin sesión (401) lleva a /ingresar con next=/cobros', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('/ingresar')));
  });

  it('RF-002-15: "Ver más cobros" pide la página siguiente con el cursor', async () => {
    mockedList.mockResolvedValueOnce({ items: [pending], nextCursor: 'next-1' });
    mockedList.mockResolvedValueOnce({ items: [paid], nextCursor: null });
    const actor = renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Ver más cobros' }));
    expect(await screen.findByRole('link', { name: /Disney\+ primos/ })).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith({ limit: 20, cursor: 'next-1' });
    expect(screen.queryByRole('button', { name: 'Ver más cobros' })).not.toBeInTheDocument();
  });
});
