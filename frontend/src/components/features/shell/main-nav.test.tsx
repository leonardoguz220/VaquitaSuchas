import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getMe, type UserSelf } from '@/services/auth';
import { MainNav } from './main-nav';

let pathname = '/panel';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('@/hooks/use-unauthorized-redirect', () => ({
  useUnauthorizedRedirect: () => () => false,
}));
jest.mock('@/services/auth', () => ({
  ...jest.requireActual('@/services/auth'),
  getMe: jest.fn(),
}));

const user = (role: UserSelf['role']) => ({ id: 'u1', fullName: 'Ana', role }) as UserSelf;

beforeEach(() => {
  pathname = '/panel';
  jest.mocked(getMe).mockReset();
  jest.mocked(getMe).mockResolvedValue(user('usuario'));
});

describe('MainNav (QA-02)', () => {
  it('abre el menú con los enlaces principales y sin Administración para un usuario', async () => {
    render(<MainNav />);
    const button = screen.getByRole('button', { name: 'Menú' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/grupos', '/panel', '/cobros', '/cupos', '/perfil', '/ajustes/avisos']);
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
  });

  it('muestra Administración solo si el rol es admin', async () => {
    jest.mocked(getMe).mockResolvedValue(user('admin'));
    render(<MainNav />);
    await screen.findByRole('button', { name: 'Menú' });
    await userEvent.click(screen.getByRole('button', { name: 'Menú' }));
    expect(await screen.findByRole('link', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('marca la página actual con aria-current="page", también en subrutas', async () => {
    pathname = '/perfil/reputacion';
    render(<MainNav />);
    await userEvent.click(screen.getByRole('button', { name: 'Menú' }));
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('marca «Mis suscripciones» como activa en /grupos/[id]', async () => {
    pathname = '/grupos/g1';
    render(<MainNav />);
    await userEvent.click(screen.getByRole('button', { name: 'Menú' }));
    expect(screen.getByRole('link', { name: 'Mis suscripciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('link')[0]).toHaveTextContent('Mis suscripciones');
  });

  it('Escape cierra el menú y devuelve el foco al botón', async () => {
    render(<MainNav />);
    const button = screen.getByRole('button', { name: 'Menú' });
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
