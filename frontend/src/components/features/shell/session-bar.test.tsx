import { render, screen } from '@testing-library/react';
import { getUnreadCount, listNotifications } from '@/services/notifications';
import { SessionBar } from './session-bar';

let pathname = '/grupos';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('@/services/notifications', () => ({
  ...jest.requireActual('@/services/notifications'),
  getUnreadCount: jest.fn(),
  listNotifications: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(getUnreadCount).mockReset();
  jest.mocked(getUnreadCount).mockResolvedValue({ unreadCount: 3 });
  jest.mocked(listNotifications).mockReturnValue(new Promise(() => {}));
});

describe('SessionBar (spec 005 T012)', () => {
  it('RF-005-02: en una pantalla con sesión muestra la campana con el contador', async () => {
    pathname = '/grupos';
    render(<SessionBar />);
    expect(screen.getByRole('banner')).toBeVisible();
    expect(await screen.findByRole('button', { name: /3/ })).toBeVisible();
  });

  it.each(['/', '/ingresar', '/registro/verificar', '/avisos/desactivar'])(
    'RF-005-02: en %s (sin sesión o que solo redirige) no se muestra',
    (path) => {
      pathname = path;
      const { container } = render(<SessionBar />);
      expect(container).toBeEmptyDOMElement();
      expect(getUnreadCount).not.toHaveBeenCalled();
    },
  );
});
