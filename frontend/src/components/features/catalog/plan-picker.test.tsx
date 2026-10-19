import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogServiceState, UseCatalogServiceResult } from '@/hooks/use-catalog-service';
import { ApiError } from '@/services/http';
import type { CatalogPlan } from '@/services/catalog';
import { netflixDetail, netflixPlans, tigoPlayDetail } from './__fixtures__/catalog';
import { PlanPicker } from './plan-picker';

function detail(state: CatalogServiceState): UseCatalogServiceResult {
  return { state, retry: jest.fn() };
}

const loaded = (value = netflixDetail) =>
  detail({ status: 'success', service: value.service, plans: value.plans });

function renderPicker(value: UseCatalogServiceResult) {
  const onSelect = jest.fn();
  const onBack = jest.fn();
  render(<PlanPicker detail={value} onSelect={onSelect} onBack={onBack} />);
  return { onSelect, onBack };
}

function planOption(name: RegExp) {
  return screen.getByRole('radio', { name });
}

const LEGEND = 'El precio es una sugerencia: podrás cambiarlo';

describe('PlanPicker (T011, plan 004 §6, paso 2 de /grupos/nuevo)', () => {
  it('RF-004-05: mientras carga muestra esqueletos y anuncia la carga', () => {
    renderPicker(detail({ status: 'loading' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cargando planes…');
    expect(screen.getAllByTestId('plan-skeleton').length).toBeGreaterThan(0);
  });

  it('CA-004-04: lista los planes con precio, moneda y cupos máximos en el orden de la API', () => {
    renderPicker(loaded());
    const group = screen.getByRole('radiogroup', { name: 'Plan' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(
      netflixPlans.map((plan) => plan.slug),
    );
    expect(planOption(/Básico con anuncios/)).toHaveAccessibleName(
      /USD 7,99.*Hasta 2 cupos \(titular incluido\)/,
    );
    expect(planOption(/Estándar/)).toHaveAccessibleName(/USD 14,66.*Hasta 3 cupos/);
    expect(planOption(/Premium/)).toHaveAccessibleName(/USD 22,99.*Hasta 4 cupos/);
  });

  it('CA-004-04: no reordena: si la API entregara otro orden, se respeta tal cual', () => {
    const reversed: CatalogPlan[] = [...netflixPlans].reverse();
    renderPicker(detail({ status: 'success', service: netflixDetail.service, plans: reversed }));
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(
      reversed.map((plan) => plan.slug),
    );
  });

  it('RF-004-02: un plan en Bs se muestra en Bs, sin convertir', () => {
    renderPicker(loaded(tigoPlayDetail));
    expect(planOption(/Familiar/)).toHaveAccessibleName(/Bs 25,51.*Hasta 5 cupos/);
    expect(planOption(/Familiar/)).not.toHaveAccessibleName(/USD/);
  });

  it('CA-004-11: muestra el precio individual cuando existe y lo omite cuando es null', () => {
    renderPicker(loaded());
    expect(planOption(/Premium/)).toHaveAccessibleName(/Precio individual: USD 11,99/);
    expect(planOption(/Estándar/)).not.toHaveAccessibleName(/Precio individual/);
    expect(planOption(/Básico con anuncios/)).not.toHaveAccessibleName(/Precio individual/);
    // Solo muestra el dato: no calcula ahorro.
    expect(screen.queryByText(/ahorr/i)).not.toBeInTheDocument();
  });

  it('RN-004-01: muestra la leyenda de que el precio es una sugerencia', () => {
    renderPicker(loaded());
    expect(screen.getByText(LEGEND)).toBeVisible();
  });

  it('RF-004-05: al continuar entrega el plan elegido', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker(loaded());
    await user.click(planOption(/Premium/));
    await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    expect(onSelect).toHaveBeenCalledWith(netflixPlans[2]);
  });

  it('RF-004-05: continuar sin elegir plan avisa junto al grupo y no avanza', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker(loaded());
    await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup', { name: 'Plan' })).toHaveAccessibleDescription(
      'Elige un plan para continuar.',
    );
  });

  it('RF-004-05: si falla muestra el error con Reintentar', async () => {
    const user = userEvent.setup();
    const value = detail({ status: 'error', error: new ApiError(500, 'INTERNAL_ERROR', 'x') });
    renderPicker(value);
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los planes.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(value.retry).toHaveBeenCalledTimes(1);
  });

  it('RF-004-05: un 404 dice que el servicio ya no está disponible y permite volver al paso 1', async () => {
    const user = userEvent.setup();
    const { onBack } = renderPicker(detail({ status: 'not_found' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Este servicio ya no está disponible');
    await user.click(screen.getByRole('button', { name: 'Elegir otro servicio' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('RF-004-05: un servicio sin planes activos se trata igual que el 404', () => {
    renderPicker(detail({ status: 'success', service: netflixDetail.service, plans: [] }));
    expect(screen.getByRole('alert')).toHaveTextContent('Este servicio ya no está disponible');
  });

  it('CA-004-09: mientras redirige a /ingresar no muestra datos ni errores', () => {
    renderPicker(detail({ status: 'redirecting' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('RNF-004-02: cada opción de plan es un objetivo táctil de 44 px o más', () => {
    renderPicker(loaded());
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')).toHaveClass('min-h-11');
    }
  });
});
