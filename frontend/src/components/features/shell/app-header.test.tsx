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
