import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { ApiError } from '@/services/http';
import { getCalendar, getUpcomingEvents, type CalendarEvent } from '@/services/reports';
import CalendarPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/panel/calendario',
}));
jest.mock('@/services/reports', () => ({
  getCalendar: jest.fn(),
  getUpcomingEvents: jest.fn(),
}));

const mockedCalendar = jest.mocked(getCalendar);
const mockedUpcoming = jest.mocked(getUpcomingEvents);

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    date: '2026-10-21',
    kind: 'vencimiento',
    groupId: 'g2',
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    role: 'miembro',
    amountCents: 1980,
    estimated: false,
    chargeId: 'c1',
    status: 'pendiente',
    ...overrides,
  };
}

const netflixCut = event({
  date: '2026-10-01',
  kind: 'corte',
  groupId: 'g1',
  groupName: 'Netflix de la familia',
  serviceName: 'Netflix',
  role: 'titular',
  amountCents: 2550,
  estimated: true,
  chargeId: null,
  status: null,
});
const spotifyDue = event();

function renderPage() {
  const user = userEvent.setup();
  render(<CalendarPage />);
  return user;
}

const FIXED_NOW = new Date('2026-10-18T15:00:00.000Z');

beforeEach(() => {
  // Solo se fija la fecha («hoy» = 18 oct 2026 en La Paz); los temporizadores siguen reales.
  jest.useFakeTimers({
    now: FIXED_NOW,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  replace.mockReset();
  mockedCalendar.mockReset();
  mockedUpcoming.mockReset();
  mockedCalendar.mockResolvedValue({ month: '2026-10', events: [netflixCut, spotifyDue] });
  mockedUpcoming.mockResolvedValue({ events: [spotifyDue] });
});

afterEach(() => jest.useRealTimers());

describe('/panel/calendario (spec 006 T022)', () => {
  it('RF-006-11: el título es "Calendario", la ruta es protegida y pide el mes actual y 30 días', async () => {
    expect(metadata.title).toBe('Calendario');
    expect(isPublicPath('/panel/calendario')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeVisible();
    expect(await screen.findByRole('table', { name: 'Calendario de Octubre 2026' })).toBeVisible();
    expect(mockedCalendar).toHaveBeenCalledWith(undefined);
    expect(mockedUpcoming).toHaveBeenCalledWith(30);
    expect(screen.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', '/panel');
  });

  it('RF-006-11: cada evento va en su día con icono y texto, no solo color', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Calendario de Octubre 2026' });
    const cut = within(table).getByRole('link', {
      name: 'Fecha de corte: Netflix de la familia, Titular · Bs 25,50 (estimado)',
    });
    expect(cut.closest('td')).toHaveTextContent(/^1/);
    expect(within(cut).getByText('◆')).toBeInTheDocument();
    expect(cut).toHaveAttribute('href', '/grupos/g1');
    const due = within(table).getByRole('link', {
      name: 'Vencimiento: Spotify depa, Miembro · Bs 19,80',
    });
    expect(due.closest('td')).toHaveTextContent(/^21/);
    expect(within(due).getByText('●')).toBeInTheDocument();
    expect(due).toHaveAttribute('href', '/cobros/c1');
    const legend = screen.getByRole('list', { name: 'Leyenda' });
    expect(legend).toHaveTextContent('◆Fecha de corte');
    expect(legend).toHaveTextContent('●Vencimiento');
  });

  it('CA-006-13: en febrero, el corte del día 31 que da la API aparece el 28', async () => {
    mockedCalendar.mockResolvedValue({
      month: '2027-02',
      events: [netflixCut, spotifyDue].map((item) =>
        item.kind === 'corte' ? { ...item, date: '2027-02-28' } : { ...item, date: '2027-02-03' },
      ),
    });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Calendario de Febrero 2027' });
    expect(
      within(table)
        .getAllByRole('cell')
        .filter((cell) => cell.textContent),
    ).toHaveLength(28);
    const cut = within(table).getByRole('link', { name: /Fecha de corte: Netflix de la familia/ });
    expect(cut.closest('td')).toHaveTextContent(/^28/);
  });

  it('RF-006-11: el día de hoy en La Paz se marca con aria-current y texto', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Calendario de Octubre 2026' });
    const today = table.querySelector('[aria-current="date"]');
    expect(today).toHaveTextContent('18 (hoy)');
  });

  it('RF-006-11: «Mes siguiente» y «Mes anterior» piden el mes a la API', async () => {
    mockedCalendar
      .mockResolvedValueOnce({ month: '2026-10', events: [] })
      .mockResolvedValueOnce({ month: '2026-11', events: [] })
      .mockResolvedValue({ month: '2026-10', events: [] });
    const user = renderPage();
    await screen.findByRole('table', { name: 'Calendario de Octubre 2026' });
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(mockedCalendar).toHaveBeenLastCalledWith('2026-11');
    expect(
      await screen.findByRole('table', { name: 'Calendario de Noviembre 2026' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(mockedCalendar).toHaveBeenLastCalledWith('2026-10');
  });

  it('RF-006-12: «Próximos 30 días» muestra título, rol, monto, estimado y estado con texto', async () => {
    mockedUpcoming.mockResolvedValue({
      events: [spotifyDue, { ...netflixCut, date: '2026-11-01' }],
    });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Próximos 30 días' });
    const items = within(list).getAllByRole('listitem');
    expect(
      within(items[0]).getByRole('link', { name: 'Vence tu cobro de Spotify depa' }),
    ).toHaveAttribute('href', '/cobros/c1');
    expect(items[0]).toHaveTextContent('21 oct 2026');
    expect(items[0]).toHaveTextContent('Vencimiento · Miembro · Bs 19,80');
    expect(within(items[0]).getByText('Pendiente')).toBeInTheDocument();
    expect(
      within(items[1]).getByRole('link', { name: 'Corte de Netflix de la familia' }),
    ).toBeVisible();
    expect(items[1]).toHaveTextContent('Fecha de corte · Titular · Bs 25,50 (estimado)');
  });

  it('RF-006-12: el titular ve «Vencen los cobros de…» en sus vencimientos', async () => {
    mockedUpcoming.mockResolvedValue({
      events: [
        event({
          role: 'titular',
          groupName: 'Netflix de la familia',
          chargeId: null,
          status: null,
        }),
      ],
    });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Próximos 30 días' });
    expect(
      within(list).getByRole('link', { name: 'Vencen los cobros de Netflix de la familia' }),
    ).toHaveAttribute('href', '/grupos/g2');
  });

  it('RF-006-11: sin eventos lo dice en el mes y en los próximos 30 días', async () => {
    mockedCalendar.mockResolvedValue({ month: '2026-10', events: [] });
    mockedUpcoming.mockResolvedValue({ events: [] });
    renderPage();
    expect(await screen.findByText('No hay cortes ni vencimientos en Octubre 2026.')).toBeVisible();
    expect(
      await screen.findByText('No tienes cortes ni vencimientos en los próximos 30 días.'),
    ).toBeVisible();
  });

  it('RF-006-11: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mockedCalendar
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ month: '2026-10', events: [] });
    mockedUpcoming
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ events: [spotifyDue] });
    const { unmount } = render(<CalendarPage />);
    expect(screen.getByText('Cargando el calendario…')).toBeInTheDocument();
    unmount();
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar el calendario.')).toBeVisible();
    const [retryCalendar] = screen.getAllByRole('button', { name: 'Reintentar' });
    await user.click(retryCalendar);
    expect(await screen.findByRole('table', { name: 'Calendario de Octubre 2026' })).toBeVisible();
  });

  it('RF-006-11: el error de los próximos días tiene su propio Reintentar', async () => {
    mockedUpcoming
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ events: [spotifyDue] });
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar los próximos eventos.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Próximos 30 días' })).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mockedCalendar.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fpanel%2Fcalendario'),
    );
  });
});
