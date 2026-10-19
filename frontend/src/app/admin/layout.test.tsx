import { render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkAdminAccess } from '@/services/admin-access';
import AdminLayout, { metadata } from './layout';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock('@/services/admin-access', () => ({ checkAdminAccess: jest.fn() }));

const mockedCookies = jest.mocked(cookies);
const mockedRedirect = jest.mocked(redirect);
const mockedAccess = jest.mocked(checkAdminAccess);

function withSession(value: string | undefined) {
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'vq_session' && value ? { name, value } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  mockedRedirect.mockClear();
  mockedAccess.mockReset();
  withSession('tok');
});

describe('layout de /admin (RF-009-01)', () => {
  it('RF-009-01: un administrador ve el contenido y el rol se pide con la cookie de sesión', async () => {
    mockedAccess.mockResolvedValue('admin');
    render(await AdminLayout({ children: <p>Contenido admin</p> }));
    expect(screen.getByText('Contenido admin')).toBeVisible();
    expect(mockedAccess).toHaveBeenCalledWith('tok');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('CA-009-01: un usuario normal no ve el panel y vuelve a su panel', async () => {
    mockedAccess.mockResolvedValue('forbidden');
    await expect(AdminLayout({ children: <p>Contenido admin</p> })).rejects.toThrow(
      'NEXT_REDIRECT:/panel',
    );
  });

  it('RF-009-01: sin sesión válida lleva a /ingresar con next=/admin', async () => {
    withSession(undefined);
    mockedAccess.mockResolvedValue('unauthenticated');
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      'NEXT_REDIRECT:/ingresar?next=%2Fadmin',
    );
    expect(mockedAccess).toHaveBeenCalledWith(undefined);
  });

  it('RF-009-01: si no se puede comprobar el rol no muestra el panel y ofrece reintentar', async () => {
    mockedAccess.mockResolvedValue('unavailable');
    render(await AdminLayout({ children: <p>Contenido admin</p> }));
    expect(screen.queryByText('Contenido admin')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos comprobar tu acceso.');
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', '/admin');
  });
});
