import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  notificationsPage,
  readConfirmed,
  unreadCharge,
} from '@/services/__fixtures__/notifications';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications';
import { NotificationBell } from './notification-bell';

jest.mock('next/navigation', () => ({ usePathname: () => '/grupos' }));

const mockedCount = jest.mocked(getUnreadCount);
const mockedList = jest.mocked(listNotifications);
const mockedMarkAll = jest.mocked(markAllNotificationsRead);
const mockedMarkOne = jest.mocked(markNotificationRead);

beforeEach(() => {
  mockedCount.mockReset();
  mockedList.mockReset();
  mockedMarkAll.mockReset();
  mockedMarkOne.mockReset();
  mockedList.mockResolvedValue(notificationsPage());
});

describe('NotificationBell (spec 005 T012, plan §6)', () => {
  it('RNF-005-06: el contador se ve como número y está en el nombre accesible, no solo en color', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 3 });
    render(<NotificationBell />);
    const button = await screen.findByRole('button', { name: 'Notificaciones, 3 sin leer' });
    expect(within(button).getByText('3')).toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('RNF-005-06: sin avisos nuevos no muestra número y lo dice en texto', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 0 });
    render(<NotificationBell />);
    const button = await screen.findByRole('button', {
      name: 'Notificaciones, ninguna sin leer',
    });
    expect(within(button).queryByText('0')).not.toBeInTheDocument();
  });

  it('RF-005-02: más de 99 se muestra como 99+', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 120 });
    render(<NotificationBell />);
    const button = await screen.findByRole('button', { name: 'Notificaciones, 120 sin leer' });
    expect(within(button).getByText('99+')).toBeVisible();
  });

  it('RF-005-01: al abrir pide los últimos 5 avisos y muestra cada uno con su estado en texto', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 2 });
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }));
    expect(screen.getByRole('button', { name: /Notificaciones/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(mockedList).toHaveBeenCalledWith({ limit: 5 });
    const list = await screen.findByRole('list', { name: 'Últimos avisos' });
    const charge = within(list).getByRole('article', { name: unreadCharge.title });
    expect(within(charge).getByRole('link', { name: unreadCharge.title })).toHaveAttribute(
      'href',
      '/cobros/c1',
    );
    expect(within(charge).getByText('No leída')).toBeInTheDocument();
    expect(within(charge).getByText('18 oct 2026, 10:30')).toBeInTheDocument();
    const confirmed = within(list).getByRole('article', { name: readConfirmed.title });
    expect(within(confirmed).getByText('Leída')).toBeInTheDocument();
    expect(within(confirmed).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas las notificaciones' })).toHaveAttribute(
      'href',
      '/notificaciones',
    );
  });

  it('CA-005-22: «Marcar todas como leídas» llama a la API y vuelve a pedir el contador', async () => {
    // Una al montar y otra al abrir el panel; después de marcar, cero.
    mockedCount
      .mockResolvedValueOnce({ unreadCount: 2 })
      .mockResolvedValueOnce({ unreadCount: 2 })
      .mockResolvedValue({ unreadCount: 0 });
    mockedMarkAll.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /2 sin leer/ }));
    await screen.findByRole('list', { name: 'Últimos avisos' });
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(mockedMarkAll).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Notificaciones, ninguna sin leer' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled(),
    );
  });

  it('CA-005-22: si falla marcar todas lo avisa con texto', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 2 });
    mockedMarkAll.mockRejectedValue(new Error('red'));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /2 sin leer/ }));
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos marcar los avisos como leídos.',
    );
  });

  it('RF-005-01: abrir un aviso no leído lo marca como leído y cierra el panel', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 2 });
    mockedMarkOne.mockResolvedValue(undefined);
    // jsdom no navega: se evita la navegación del enlace después de los manejadores de React.
    const preventNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventNavigation);
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /2 sin leer/ }));
    await user.click(await screen.findByRole('link', { name: unreadCharge.title }));
    expect(mockedMarkOne).toHaveBeenCalledWith('n1');
    expect(screen.queryByRole('list', { name: 'Últimos avisos' })).not.toBeInTheDocument();
    document.removeEventListener('click', preventNavigation);
  });

  it('RF-005-02: estados del panel: cargando, vacío y error con Reintentar', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 0 });
    mockedList
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(notificationsPage({ items: [], unreadCount: 0 }))
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValue(notificationsPage());
    const user = userEvent.setup();
    render(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: /ninguna sin leer/ });
    await user.click(bell);
    expect(screen.getByText('Cargando avisos…')).toBeInTheDocument();
    await user.click(bell);
    await user.click(bell);
    expect(await screen.findByText('No tienes notificaciones.')).toBeInTheDocument();
    await user.click(bell);
    await user.click(bell);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Últimos avisos' })).toBeInTheDocument();
  });

  it('RNF-005-06: Escape cierra el panel y devuelve el foco a la campana; tocar fuera también', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 2 });
    const user = userEvent.setup();
    render(
      <>
        <NotificationBell />
        <p>Fuera</p>
      </>,
    );
    const bell = await screen.findByRole('button', { name: /2 sin leer/ });
    await user.click(bell);
    expect(screen.getByRole('region', { name: 'Notificaciones' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
    await user.click(bell);
    await user.click(screen.getByText('Fuera'));
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
  });
});
