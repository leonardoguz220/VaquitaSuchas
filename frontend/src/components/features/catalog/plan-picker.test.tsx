import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCatalogService, type CatalogServiceDetail } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { PlanPicker, type PlanPickerProps } from './plan-picker';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/nuevo',
}));
jest.mock('@/services/catalog', () => ({ getCatalogService: jest.fn() }));

const mockedGet = jest.mocked(getCatalogService);

// Datos simulados del contrato 004: planes ordenados por precio ascendente (CA-004-04).
const detail: CatalogServiceDetail = {
  service: {
    id: 'svc-1',
    slug: 'netflix',
    name: 'Netflix',
    category: 'video',
    categoryLabel: 'Video',
    logoUrl: null,
    brandColor: '#E50914',
  },
  plans: [
    {
      id: 'p1',
      slug: 'netflix-basico',
      name: 'Básico',
      priceCents: 699,
      currency: 'USD',
      maxSlots: 2,
      individualPriceCents: null,
      verifiedOn: '2026-10-01',
    },
    {
      id: 'p2',
      slug: 'netflix-estandar',
      name: 'Estándar',
      priceCents: 1466,
      currency: 'USD',
      maxSlots: 4,
      individualPriceCents: 1466,
      verifiedOn: '2026-10-01',
    },
  ],
};

function renderPicker(props: Partial<PlanPickerProps> = {}) {
  const handlers = { onSelectPlan: jest.fn(), onChangeService: jest.fn() };
  render(<PlanPicker serviceSlug="netflix" selectedPlanSlug={null} {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => mockedGet.mockReset());

describe('PlanPicker (spec 004 T011)', () => {
  it('RF-004-05: mientras carga muestra esqueletos', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderPicker();
    expect(screen.getByText('Cargando planes…')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('netflix');
  });

  it('RF-004-02: lista los planes en el orden de la API con precio, moneda y cupos máximos', async () => {
    mockedGet.mockResolvedValue(detail);
    renderPicker();

    expect(
      await screen.findByRole('heading', { name: '2. Elige el plan de Netflix' }),
    ).toBeInTheDocument();
    const options = screen.getAllByRole('radio');
    expect(options.map((radio) => radio.closest('label')?.textContent)).toEqual([
      'BásicoHasta 2 personas, contándoteUSD 6,99',
      'EstándarHasta 4 personas, contándoteUSD 14,66',
    ]);
    expect(screen.getByRole('group')).toHaveAccessibleDescription(
      'El precio es una sugerencia: podrás cambiarlo.',
    );
  });

  it('RF-004-05: al elegir un plan entrega el plan y el servicio', async () => {
    mockedGet.mockResolvedValue(detail);
    const actor = userEvent.setup();
    const { onSelectPlan } = renderPicker({ selectedPlanSlug: 'netflix-basico' });

    expect(await screen.findByRole('radio', { name: /Básico/ })).toBeChecked();
    await actor.click(screen.getByRole('radio', { name: /Estándar/ }));
    expect(onSelectPlan).toHaveBeenCalledWith(detail.plans[1], detail.service);
  });

  it('CA-004-12: el encabezado muestra la inicial sobre el color de marca si no hay logo', async () => {
    mockedGet.mockResolvedValue(detail);
    renderPicker();
    await screen.findByRole('radio', { name: /Básico/ });
    expect(screen.getByTestId('service-logo')).toHaveTextContent('N');
    expect(screen.getByTestId('service-logo')).toHaveStyle({ backgroundColor: '#E50914' });
  });

  it('CA-004-08: con 404 avisa que el servicio ya no está disponible y deja elegir otro', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const actor = userEvent.setup();
    const { onChangeService } = renderPicker();

    const notice = await screen.findByText(/Este servicio ya no está disponible/);
    await actor.click(
      within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', {
        name: 'Elegir otro servicio',
      }),
    );
    expect(onChangeService).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('RF-004-05: si falla por otra causa muestra el error con Reintentar', async () => {
    mockedGet
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'))
      .mockResolvedValueOnce(detail);
    const actor = userEvent.setup();
    renderPicker();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los planes.');
    expect(alert).toHaveTextContent('Ocurrió un error inesperado. Inténtalo de nuevo.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: /Estándar/ })).toBeInTheDocument();
  });
});
