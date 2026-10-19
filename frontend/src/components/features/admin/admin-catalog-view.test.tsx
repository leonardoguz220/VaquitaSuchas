import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetCatalogMock } from '@/services/admin-catalog.mock';
import { AdminCatalogView } from './admin-catalog-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/catalogo',
}));

describe('AdminCatalogView (spec 009 T029)', () => {
  beforeEach(() => {
    resetCatalogMock();
  });

  it('CA-009-04: editar un plan muestra el aviso de que no cambia las suscripciones existentes', async () => {
    const user = userEvent.setup();
    render(<AdminCatalogView />);

    const netflix = await screen.findByRole('list', { name: 'Planes de Netflix' });
    await user.click(within(netflix).getAllByRole('button', { name: 'Editar plan' })[0]!);

    expect(
      await screen.findByText(/no modifica las suscripciones que ya existen/),
    ).toBeInTheDocument();
  });

  it('RF-009-04: un plan sin precio verificado se marca con texto, no solo con color', async () => {
    render(<AdminCatalogView />);

    const netflix = await screen.findByRole('list', { name: 'Planes de Netflix' });
    expect(within(netflix).getByText('! Precio por verificar')).toBeInTheDocument();
  });

  it('CA-009-05: desactivar un plan pide confirmación antes de cambiarlo', async () => {
    const user = userEvent.setup();
    render(<AdminCatalogView />);

    const netflix = await screen.findByRole('list', { name: 'Planes de Netflix' });
    await user.click(within(netflix).getAllByRole('button', { name: 'Desactivar plan' })[0]!);

    expect(
      await screen.findByRole('dialog', { name: '¿Desactivar Estándar?' }),
    ).toBeInTheDocument();
  });
});
