import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppHeader, AppPage } from './app-header';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const mockedPathname = jest.mocked(usePathname);

describe('AppHeader (plan 001 §6)', () => {
  it('RF-001-19: marca "Mis suscripciones" como actual en /grupos y sus subrutas', () => {
    mockedPathname.mockReturnValue('/grupos/nuevo');
    render(<AppHeader />);
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis suscripciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Mi perfil' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Vaquita, ir a Mis suscripciones' })).toHaveAttribute(
      'href',
      '/grupos',
    );
  });

  it('RF-002-15: "Mis cobros" lleva a /cobros y se marca en el detalle de un cobro', () => {
    mockedPathname.mockReturnValue('/cobros/c1');
    render(<AppHeader />);
    const link = screen.getByRole('link', { name: 'Mis cobros' });
    expect(link).toHaveAttribute('href', '/cobros');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Mis suscripciones' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('RF-008-07: "Cupos libres" lleva a /cupos y se marca en el detalle de un cupo', () => {
    mockedPathname.mockReturnValue('/cupos/l1');
    render(<AppHeader />);
    const link = screen.getByRole('link', { name: 'Cupos libres' });
    expect(link).toHaveAttribute('href', '/cupos');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('RF-010-26: "Mis solicitudes" lleva a /solicitudes y se marca en el detalle', () => {
    mockedPathname.mockReturnValue('/solicitudes/jr1');
    render(<AppHeader />);
    const link = screen.getByRole('link', { name: 'Mis solicitudes' });
    expect(link).toHaveAttribute('href', '/solicitudes');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('RF-005-02: la cabecera incluye la campana de notificaciones', () => {
    mockedPathname.mockReturnValue('/grupos');
    render(<AppHeader />);
    expect(screen.getByRole('button', { name: /^Notificaciones/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('RF-006-01: "Panel" lleva a /panel y se marca en sus subrutas', () => {
    mockedPathname.mockReturnValue('/panel/calendario');
    render(<AppHeader />);
    const link = screen.getByRole('link', { name: 'Panel' });
    expect(link).toHaveAttribute('href', '/panel');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('RF-001-19: AppPage pone la cabecera y el contenido', () => {
    mockedPathname.mockReturnValue('/perfil');
    render(
      <AppPage>
        <p>Contenido</p>
      </AppPage>,
    );
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });
});
