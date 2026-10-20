import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  myCancelled,
  myInReview,
  myOverdueFormer,
  myPaid,
  myPending,
} from '@/components/features/charges/__fixtures__/charges';
import { isPublicPath } from '@/lib/routes';
import { listMyCharges } from '@/services/charges';
import { ApiError } from '@/services/http';
import ChargesPage from './page';

jest.mock('@/services/charges', () => ({ listMyCharges: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros',
}));

const mocked = jest.mocked(listMyCharges);
const ALL = [myPending, myInReview, myPaid, myOverdueFormer, myCancelled];

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/cobros');
  mocked.mockResolvedValue({ items: ALL, nextCursor: null });
});

function cards() {
  return within(screen.getByRole('list', { name: 'Tus cobros' })).getAllByRole('listitem');
}

describe('/cobros, «Mis cobros» (T018, plan 002 §6)', () => {
  it('es una ruta protegida y pide GET /me/charges sin filtros', async () => {
    render(<ChargesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mis cobros' })).toBeVisible();
    await screen.findByRole('list', { name: 'Tus cobros' });
    expect(mocked).toHaveBeenCalledWith({}, { signal: expect.any(AbortSignal) });
    expect(isPublicPath('/cobros')).toBe(false);
  });

  it('RNF-002-06: mientras carga muestra esqueletos', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<ChargesPage />);
    expect(screen.getByText('Cargando tus cobros…')).toBeInTheDocument();
    expect(screen.getAllByTestId('charge-skeleton')).toHaveLength(3);
  });

  it('RF-002-15: la tarjeta muestra servicio, monto Bs, vencimiento y enlace al detalle', async () => {
    render(<ChargesPage />);
    await screen.findByRole('list', { name: 'Tus cobros' });
    const first = cards()[0];
    expect(first).toHaveTextContent('Spotify depa');
    expect(first).toHaveTextContent('Spotify · Octubre 2026');
    expect(first).toHaveTextContent('Bs 19,81');
    expect(first).toHaveTextContent('Vence el 21 oct 2026');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/cobros/c-pend');
    expect(cards()[2]).toHaveTextContent('Pagado el 13 oct 2026');
    expect(cards()[3]).toHaveTextContent('Venció el 8 sep 2026');
  });

  it('RNF-002-06: cada estado lleva insignia con texto, no solo color', async () => {
    render(<ChargesPage />);
    await screen.findByRole('list', { name: 'Tus cobros' });
    const labels = cards().map((card) => card.textContent);
    ['Pendiente', 'En revisión', 'Pagado', 'Atrasado', 'Cancelado'].forEach((label, index) =>
      expect(labels[index]).toContain(label),
    );
  });

  it('CA-002-32: el cobro atrasado de un grupo que dejó lleva el aviso de deuda', async () => {
    render(<ChargesPage />);
    await screen.findByRole('list', { name: 'Tus cobros' });
    const notice = 'Ya no perteneces a este grupo; paga tu deuda para limpiar tu historial.';
    expect(cards()[3]).toHaveTextContent(notice);
    expect(screen.getAllByText(notice)).toHaveLength(1);
  });

  it('RF-002-15: los filtros de estado y período van como query a la API', async () => {
    const user = userEvent.setup();
    render(<ChargesPage />);
    await screen.findByRole('list', { name: 'Tus cobros' });

    await user.selectOptions(screen.getByLabelText('Estado'), 'atrasado');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith(
        { status: ['atrasado'] },
        { signal: expect.any(AbortSignal) },
      ),
    );

    const periodSelect = screen.getByLabelText('Período') as HTMLSelectElement;
    const firstPeriod = periodSelect.options[1].value;
    expect(firstPeriod).toMatch(/^\d{4}-\d{2}$/);
    await user.selectOptions(periodSelect, firstPeriod);
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith(
        { status: ['atrasado'], period: firstPeriod },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('RNF-002-06: sin cobros muestra «Aún no tienes cobros»', async () => {
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    render(<ChargesPage />);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Aún no tienes cobros' }),
    ).toBeVisible();
  });

  it('RNF-002-06: con filtros y sin resultados permite quitarlos', async () => {
    const user = userEvent.setup();
    render(<ChargesPage />);
    await screen.findByRole('list', { name: 'Tus cobros' });
    mocked.mockResolvedValueOnce({ items: [], nextCursor: null });
    await user.selectOptions(screen.getByLabelText('Estado'), 'cancelado');
    expect(await screen.findByText('No hay cobros con estos filtros.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(await screen.findByRole('list', { name: 'Tus cobros' })).toBeVisible();
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });

  it('RNF-002-06: un error permite reintentar y sin conexión lo dice', async () => {
    const user = userEvent.setup();
    mocked.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<ChargesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Tus cobros' })).toBeVisible();
  });

  it('un error del servidor dice que no se pudieron cargar', async () => {
    mocked.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    render(<ChargesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus cobros.');
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<ChargesPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fcobros'));
  });
});
