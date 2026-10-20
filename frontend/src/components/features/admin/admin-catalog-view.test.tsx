import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetCatalogMock } from '@/services/admin-catalog.mock';
import { AdminCatalogView } from './admin-catalog-view';

/** La pantalla usa datos simulados en pruebas: el cliente de la API se cambia por el mock. */
jest.mock('@/services/admin-catalog', () => {
  const mock = jest.requireActual('@/services/admin-catalog.mock');
  return {
    ...jest.requireActual('@/services/admin-catalog'),
    listAdminCatalog: mock.listCatalog,
    createCatalogService: mock.createService,
    updateCatalogService: mock.updateService,
    setCatalogServiceActive: mock.setServiceActive,
    createCatalogPlan: mock.createPlan,
    updateCatalogPlan: mock.updatePlan,
    setCatalogPlanActive: mock.setPlanActive,
    previewCatalogImport: mock.previewImport,
    applyCatalogImport: mock.applyImport,
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/catalogo',
}));

/** Sube un archivo al selector de la importación (el tipo se detecta por el nombre). */
async function uploadFile(user: ReturnType<typeof userEvent.setup>, name: string, text: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No hay selector de archivo');
  await user.upload(input, new File([text], name, { type: 'text/csv' }));
}

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

  it('CA-009-06: una importación con una fila inválida muestra el error de esa fila y no deja aplicar', async () => {
    const user = userEvent.setup();
    render(<AdminCatalogView />);
    await screen.findByRole('list', { name: 'Planes de Netflix' });

    await uploadFile(user, 'catalogo.csv', 'invalida');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    const errors = await screen.findByRole('list', { name: 'Errores por fila' });
    expect(within(errors).getByText(/Fila 1, campo priceCents/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar importación' })).not.toBeInTheDocument();
  });

  it('CA-009-06: una importación sin errores se aplica tras revisar la vista previa', async () => {
    const user = userEvent.setup();
    render(<AdminCatalogView />);
    await screen.findByRole('list', { name: 'Planes de Netflix' });

    await uploadFile(user, 'catalogo.csv', 'slug,name\nhbo,HBO');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar importación' }));

    expect(
      await screen.findByText('Importación aplicada: 1 creados, 0 actualizados.'),
    ).toBeInTheDocument();
  });
});
