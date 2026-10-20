import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  acceptedRequest,
  awaitingPaymentRequest,
  joinRequest,
  openRequest,
  SERVER_NOW,
} from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import { listJoinRequests } from '@/services/join-requests';
import RequestsPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/solicitudes',
}));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  listJoinRequests: jest.fn(),
}));

const mockedList = jest.mocked(listJoinRequests);

function renderPage(options: { fakeTimers?: boolean } = {}) {
  const actor = userEvent.setup(
    options.fakeTimers ? { advanceTimers: jest.advanceTimersByTime } : {},
  );
  render(<RequestsPage />);
  return actor;
}

const card = (name: RegExp) => screen.getByRole('link', { name });

beforeEach(() => mockedList.mockReset());

afterEach(() => jest.useRealTimers());

describe('/solicitudes "Mis solicitudes" (spec 010 T017)', () => {
  it('RF-010-26: la ruta es protegida y pide las activas como solicitante', async () => {
    mockedList.mockResolvedValue({ items: [openRequest], nextCursor: null });
    expect(metadata.title).toBe('Mis solicitudes');
    expect(isPublicPath('/solicitudes')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible();
    expect(await screen.findByRole('list', { name: 'Tus solicitudes' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith({
      role: 'solicitante',
      status: ['abierta', 'esperando_pago', 'pago_informado'],
      limit: 20,
    });
    expect(screen.getAllByRole('link', { name: 'Unirme con un código' })[0]).toHaveAttribute(
      'href',
      '/unirse',
    );
  });

  it('RF-010-26: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando tus solicitudes…')).toBeInTheDocument();
  });

  it('RF-010-26: sin solicitudes activas invita a unirse con un código', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('No tienes solicitudes activas')).toBeVisible();
  });

  it('RF-010-26: con un error muestra Reintentar y vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = renderPage();
    expect(await screen.findByText('No pudimos cargar tus solicitudes.')).toBeVisible();
    mockedList.mockResolvedValue({ items: [openRequest], nextCursor: null });
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Tus solicitudes' })).toBeInTheDocument();
  });

  it('RF-010-03: una abierta muestra titular con calificación, cuota estimada y el plazo de 24 h', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(SERVER_NOW));
    mockedList.mockResolvedValue({ items: [openRequest], nextCursor: null });
    renderPage({ fakeTimers: true });
    const link = await screen.findByRole('link', { name: /Max de amigos/ });
    expect(link).toHaveAttribute('href', '/solicitudes/jr1');
    expect(within(link).getByText('Abierta')).toHaveClass('bg-status-en-revision-bg');
    expect(within(link).getByText('Titular: Rodrigo Salazar Paz')).toBeVisible();
    expect(within(link).getByText('4,5 de 5')).toBeVisible();
    expect(within(link).getByText('Muy bueno')).toBeVisible();
    expect(within(link).getByText('Bs 21,00')).toBeVisible();
    expect(within(link).getByText('Cuota estimada')).toBeVisible();
    expect(within(link).getByRole('timer')).toHaveTextContent('Faltan 1 día y 9 h');
  });

  it('RNF-010-06: esperando pago muestra la cuota fijada, el reloj mm:ss y los no leídos', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(SERVER_NOW));
    mockedList.mockResolvedValue({ items: [awaitingPaymentRequest], nextCursor: null });
    renderPage({ fakeTimers: true });
    const link = await screen.findByRole('link', { name: /Max de amigos/ });
    expect(within(link).getByText('Esperando pago')).toHaveClass('bg-status-pendiente-bg');
    expect(within(link).getByText('Cuota de ingreso fijada')).toBeVisible();
    expect(within(link).getByRole('timer')).toHaveTextContent('Quedan 12:34');
    expect(within(link).getByText('2 mensajes nuevos')).toBeVisible();
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(within(link).getByRole('timer')).toHaveTextContent('Quedan 12:30');
  });

  it('RNF-010-03: la cuenta regresiva se corrige con serverNow aunque el reloj del celular difiera', async () => {
    jest.useFakeTimers();
    // El celular va 2 minutos atrasado respecto del servidor.
    jest.setSystemTime(new Date(Date.parse(SERVER_NOW) - 120_000));
    mockedList.mockResolvedValue({ items: [awaitingPaymentRequest], nextCursor: null });
    renderPage({ fakeTimers: true });
    const link = await screen.findByRole('link', { name: /Max de amigos/ });
    expect(within(link).getByRole('timer')).toHaveTextContent('Quedan 12:34');
  });

  it('CA-010-09: al llegar a 0 vuelve a pedir la lista y muestra el estado que decide el servidor', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(SERVER_NOW));
    const almostDue = joinRequest({
      ...awaitingPaymentRequest,
      phase: {
        ...awaitingPaymentRequest.phase,
        deadlineAt: new Date(Date.parse(SERVER_NOW) + 2000).toISOString(),
      },
    });
    const expired = joinRequest({
      ...awaitingPaymentRequest,
      phase: { status: 'expirada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'plazo_pago',
      allowedActions: [],
    });
    mockedList.mockResolvedValueOnce({ items: [almostDue], nextCursor: null });
    mockedList.mockResolvedValue({ items: [expired], nextCursor: null });
    renderPage({ fakeTimers: true });
    await screen.findByRole('link', { name: /Max de amigos/ });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(await screen.findByText('Expirada')).toBeVisible();
    expect(screen.getByText('No se subió el comprobante dentro del plazo.')).toBeVisible();
    expect(screen.queryByText('Cargando tus solicitudes…')).not.toBeInTheDocument();
  });

  it('RF-010-26: si la ventana del grupo está cerrada muestra la fecha en que se abre', async () => {
    mockedList.mockResolvedValue({
      items: [
        joinRequest({
          entryWindow: { isOpen: false, opensAt: '2026-11-17T04:00:00.000Z', closesAt: null },
        }),
      ],
      nextCursor: null,
    });
    renderPage();
    const link = await screen.findByRole('link', { name: /Max de amigos/ });
    expect(within(link).getByText('El ingreso a este grupo se abre el 17 nov 2026.')).toBeVisible();
  });

  it('RF-010-26: el historial lo filtra la API y muestra el pago de ingreso y el chat en lectura', async () => {
    mockedList.mockResolvedValue({ items: [openRequest], nextCursor: null });
    const actor = renderPage();
    await screen.findByRole('list', { name: 'Tus solicitudes' });
    mockedList.mockResolvedValue({
      items: [
        acceptedRequest,
        joinRequest({
          id: 'jr9',
          phase: { ...acceptedRequest.phase, status: 'cancelada' },
          finalReason: null,
          allowedActions: [],
        }),
      ],
      nextCursor: null,
    });
    const filters = screen.getByRole('group', { name: 'Filtrar solicitudes' });
    await actor.click(within(filters).getByRole('button', { name: 'Historial' }));
    expect(within(filters).getByRole('button', { name: 'Historial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mockedList).toHaveBeenLastCalledWith({
      role: 'solicitante',
      status: ['aceptada', 'rechazada', 'cancelada', 'expirada'],
      limit: 20,
    });
    const accepted = await screen.findByRole('link', { name: /Spotify depa/ });
    expect(within(accepted).getByText('Aceptada')).toBeVisible();
    expect(within(accepted).getByText('Pagado al ingresar')).toBeVisible();
    expect(within(accepted).getByText('Bs 19,80')).toBeVisible();
    expect(within(accepted).getByText('Titular: Marco Vargas Rojas')).toBeVisible();
    expect(within(accepted).getByText('Sin calificación')).toBeVisible();
    expect(within(accepted).getByText('El titular confirmó tu pago.')).toBeVisible();
    expect(within(card(/Cancelada/)).getByText('Chat en solo lectura')).toBeVisible();
  });

  it('RF-010-26: el historial vacío lo dice sin botón de unirse', async () => {
    mockedList.mockResolvedValueOnce({ items: [openRequest], nextCursor: null });
    const actor = renderPage();
    await screen.findByRole('list', { name: 'Tus solicitudes' });
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    await actor.click(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByText('Tu historial está vacío')).toBeVisible();
  });

  it('RF-010-26: "Ver más solicitudes" sigue el cursor', async () => {
    mockedList.mockResolvedValueOnce({ items: [openRequest], nextCursor: 'n1' });
    mockedList.mockResolvedValueOnce({ items: [acceptedRequest], nextCursor: null });
    const actor = renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Ver más solicitudes' }));
    expect(await screen.findByRole('link', { name: /Spotify depa/ })).toBeVisible();
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'n1' }));
    expect(screen.queryByRole('button', { name: 'Ver más solicitudes' })).not.toBeInTheDocument();
  });
});
