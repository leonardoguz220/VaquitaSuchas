import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  notification,
  notificationsPage,
  readConfirmed,
  unreadCharge,
  unreadProof,
} from '@/services/__fixtures__/notifications';
import { ApiError } from '@/services/http';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications';
import NotificationsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/notificaciones',
}));

const mockedList = jest.mocked(listNotifications);
const mockedCount = jest.mocked(getUnreadCount);
const mockedMarkOne = jest.mocked(markNotificationRead);
const mockedMarkAll = jest.mocked(markAllNotificationsRead);

/** Lista de la página (la campana de la cabecera tiene la suya). */
const pageList = () => screen.findByRole('list', { name: 'Tus notificaciones' });

function renderPage() {
  const user = userEvent.setup();
  render(<NotificationsPage />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mockedList.mockReset();
  mockedMarkOne.mockReset();
  mockedMarkAll.mockReset();
  mockedCount.mockReset();
  mockedCount.mockResolvedValue({ unreadCount: 2 });
});

describe('/notificaciones (spec 005 T012)', () => {
  it('RF-005-01: el título es "Notificaciones", la ruta es protegida y pide la primera página', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    expect(metadata.title).toBe('Notificaciones');
    expect(isPublicPath('/notificaciones')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();
    await pageList();
    expect(mockedList).toHaveBeenCalledWith({ limit: 20 });
  });

  it('RF-005-01: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando tus notificaciones…')).toBeInTheDocument();
  });

  it('RF-005-01: cada aviso muestra título, texto, fecha en La Paz y lleva a su enlace', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    renderPage();
    const list = await pageList();
    const item = within(list).getByRole('article', { name: unreadProof.title });
    expect(within(item).getByRole('link', { name: unreadProof.title })).toHaveAttribute(
      'href',
      '/cobros/c7',
    );
    expect(within(item).getByText(unreadProof.body)).toBeInTheDocument();
    expect(within(item).getByText('17 oct 2026, 10:30')).toBeInTheDocument();
    expect(within(item).getByText('Avisos como titular.')).toHaveClass('sr-only');
  });

  it('RF-005-01: un enlace que no es una ruta interna no se muestra como enlace', async () => {
    mockedList.mockResolvedValue(
      notificationsPage({
        items: [notification({ id: 'x', title: 'Aviso raro', link: 'https://evil.test' })],
      }),
    );
    renderPage();
    const item = within(await pageList()).getByRole('article', { name: 'Aviso raro' });
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
  });

  it('RNF-005-06: leída y no leída se distinguen con texto e icono, no solo con el fondo', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    renderPage();
    const list = await pageList();
    const unread = within(list).getByRole('article', { name: unreadCharge.title });
    const read = within(list).getByRole('article', { name: readConfirmed.title });
    expect(within(unread).getByText('No leída').querySelector('svg')).not.toBeNull();
    expect(within(read).getByText('Leída').querySelector('svg')).not.toBeNull();
    expect(
      within(unread).getByRole('button', { name: `Marcar como leída: ${unreadCharge.title}` }),
    ).toBeInTheDocument();
    expect(within(read).queryByRole('button', { name: /Marcar como leída/ })).toBeNull();
  });

  it('RF-005-02: el contador de no leídas sale de la API y se ve en el filtro', async () => {
    mockedList.mockResolvedValue(notificationsPage({ unreadCount: 7 }));
    renderPage();
    expect(await screen.findByRole('button', { name: 'No leídas · 7' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Tienes 7 avisos sin leer.')).toBeInTheDocument();
  });

  it('RF-005-02: el filtro «No leídas» lo aplica la API y se marca con aria-pressed', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    const user = renderPage();
    await user.click(await screen.findByRole('button', { name: 'No leídas · 2' }));
    expect(mockedList).toHaveBeenLastCalledWith({ unread: true, limit: 20 });
    expect(screen.getByRole('button', { name: /^No leídas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('RF-005-02: vacío sin filtro y vacío con el filtro «No leídas»', async () => {
    mockedList.mockResolvedValue(notificationsPage({ items: [], unreadCount: 0 }));
    const user = renderPage();
    expect(
      await screen.findByRole('heading', { name: 'No tienes notificaciones' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'No leídas · 0' }));
    expect(
      await screen.findByRole('heading', { name: 'No tienes notificaciones sin leer' }),
    ).toBeInTheDocument();
  });

  it('RF-005-02: un error muestra el aviso con Reintentar', async () => {
    mockedList
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(notificationsPage());
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tus notificaciones.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await pageList()).toBeInTheDocument();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fnotificaciones'));
  });

  it('RF-005-02: «Ver más notificaciones» pide la siguiente página con el cursor', async () => {
    mockedList
      .mockResolvedValueOnce(notificationsPage({ items: [unreadCharge], nextCursor: 'k2' }))
      .mockResolvedValueOnce(notificationsPage({ items: [readConfirmed], nextCursor: null }));
    const user = renderPage();
    await pageList();
    await user.click(screen.getByRole('button', { name: 'Ver más notificaciones' }));
    expect(mockedList).toHaveBeenLastCalledWith({ limit: 20, cursor: 'k2' });
    const list = await pageList();
    expect(
      await within(list).findByRole('article', { name: readConfirmed.title }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver más notificaciones' })).toBeNull();
  });

  it('RF-005-02: «Marcar como leída» llama a la API y vuelve a pedir la lista', async () => {
    mockedList.mockResolvedValueOnce(notificationsPage()).mockResolvedValue(
      notificationsPage({
        items: [{ ...unreadCharge, readAt: '2026-10-19T12:00:00.000Z' }, unreadProof],
        unreadCount: 1,
      }),
    );
    mockedMarkOne.mockResolvedValue(undefined);
    const user = renderPage();
    const list = await pageList();
    await user.click(
      within(list).getByRole('button', { name: `Marcar como leída: ${unreadCharge.title}` }),
    );
    expect(mockedMarkOne).toHaveBeenCalledWith('n1');
    expect(await screen.findByRole('button', { name: 'No leídas · 1' })).toBeInTheDocument();
    const item = within(list).getByRole('article', { name: unreadCharge.title });
    expect(within(item).getByText('Leída')).toBeInTheDocument();
  });

  it('CA-005-22: «Marcar todas como leídas» llama a la API y el contador vuelve en cero', async () => {
    mockedList.mockResolvedValueOnce(notificationsPage()).mockResolvedValue(
      notificationsPage({
        items: [
          { ...unreadCharge, readAt: '2026-10-19T12:00:00.000Z' },
          { ...unreadProof, readAt: '2026-10-19T12:00:00.000Z' },
          readConfirmed,
        ],
        unreadCount: 0,
      }),
    );
    mockedMarkAll.mockResolvedValue(undefined);
    const user = renderPage();
    await pageList();
    // El botón de la página (el de la campana está dentro de su panel cerrado).
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(mockedMarkAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'No leídas · 0' })).toBeInTheDocument();
    expect(screen.getByText('No tienes avisos sin leer.')).toBeInTheDocument();
    expect(screen.queryByText('No leída')).not.toBeInTheDocument();
  });

  it('CA-005-22: si falla marcar todas muestra el error', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    mockedMarkAll.mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    const user = renderPage();
    await pageList();
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(await screen.findByText('No pudimos marcar los avisos como leídos.')).toBeVisible();
  });

  it('RF-005-03: explica que las notificaciones de la app no se desactivan', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    renderPage();
    await pageList();
    expect(
      screen.getByText(/Las notificaciones de la app no se desactivan y se guardan 90 días/),
    ).toBeInTheDocument();
  });

  it('RF-005-17: enlaza a «Ajustes de avisos»', async () => {
    mockedList.mockResolvedValue(notificationsPage());
    renderPage();
    await pageList();
    expect(screen.getByRole('link', { name: 'Ajustes de avisos' })).toHaveAttribute(
      'href',
      '/ajustes/avisos',
    );
  });
});
