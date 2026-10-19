import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getBillingSummary, getGroupCharges } from '@/services/charges';
import {
  billingSummary,
  groupChargesPage,
  MOCK_BILLING_GROUP_IDS,
} from '@/services/group-billing.mock';
import { ApiError } from '@/services/http';
import { GroupChargesTab } from './group-charges-tab';

jest.mock('@/services/charges', () => ({
  getBillingSummary: jest.fn(),
  getGroupCharges: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const summaryMock = jest.mocked(getBillingSummary);
const chargesMock = jest.mocked(getGroupCharges);

const OWNER = MOCK_BILLING_GROUP_IDS.owner;
const MEMBER = MOCK_BILLING_GROUP_IDS.member;

/** Responde con los datos simulados de T037 (ya calculados, como la API). */
function useMockApi() {
  summaryMock.mockImplementation(async (groupId, period) => billingSummary(groupId, period));
  chargesMock.mockImplementation(async (groupId, params) =>
    groupChargesPage(groupId, params ?? {}),
  );
}

beforeEach(() => {
  summaryMock.mockReset();
  chargesMock.mockReset();
  replace.mockReset();
  useMockApi();
});

const monthRows = () => within(screen.getByRole('list', { name: 'Cobros del mes' }));
const historyItems = () =>
  Array.from(screen.getByRole('list', { name: 'Historial de cobros' }).children) as HTMLElement[];

describe('Pestaña Cobros de /grupos/[id] (T037, plan 002 §6)', () => {
  it('RNF-001-04: mientras carga muestra esqueletos', () => {
    summaryMock.mockReturnValue(new Promise(() => {}));
    chargesMock.mockReturnValue(new Promise(() => {}));
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    expect(screen.getByText('Cargando los cobros del mes…')).toBeInTheDocument();
    expect(screen.getByText('Cargando el historial…')).toBeInTheDocument();
  });

  it('CA-002-17: el miembro ve estado y monto de todos, sin comprobantes, motivos ni totales', async () => {
    render(<GroupChargesTab groupId={MEMBER} isOwner={false} />);
    expect(
      await screen.findByRole('heading', { name: 'Cobros de octubre 2026' }),
    ).toBeInTheDocument();
    const rows = monthRows();
    expect(rows.getAllByRole('listitem')).toHaveLength(5);
    expect(rows.getByText('Sofía Mamani')).toBeInTheDocument();
    expect(rows.getAllByText('Bs 19,80')).toHaveLength(5);
    expect(rows.getAllByText('Pagado')).toHaveLength(2);
    expect(rows.getByText('En revisión')).toBeInTheDocument();
    expect(rows.getAllByText('Pendiente')).toHaveLength(2);
    expect(screen.queryByLabelText('Totales del mes')).not.toBeInTheDocument();
    await screen.findByRole('list', { name: 'Historial de cobros' });
    expect(screen.queryByText(/Motivo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/referencia:|comprobante\b.*\.(pdf|png|jpg)/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver cobro/ })).not.toBeInTheDocument();
  });

  it('CA-002-20: el titular ve esperado, cobrado, pendiente y atrasado tal como llegan', async () => {
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    const totals = within(await screen.findByLabelText('Totales del mes'));
    const value = (label: string) => totals.getByText(label).nextElementSibling;
    expect(value('Esperado')).toHaveTextContent('Bs 50,04');
    expect(value('Cobrado')).toHaveTextContent('Bs 25,02');
    expect(value('Pendiente')).toHaveTextContent('Bs 12,51');
    expect(value('Atrasado')).toHaveTextContent('Bs 12,51');

    const rows = monthRows();
    expect(rows.getAllByText('Pagado')).toHaveLength(2);
    expect(rows.getAllByText('En revisión')).toHaveLength(1);
    expect(rows.getAllByText('Atrasado')).toHaveLength(1);
    expect(rows.getAllByText('Exmiembro')).toHaveLength(2);

    const facts = within(screen.getByLabelText('Datos del ciclo'));
    expect(facts.getByText('Fecha de corte').nextElementSibling).toHaveTextContent('17 oct 2026');
    expect(facts.getByText('Vence el').nextElementSibling).toHaveTextContent('20 oct 2026');
    expect(facts.getByText('Total del mes').nextElementSibling).toHaveTextContent('Bs 62,57');
    expect(facts.getByText('Cuota por miembro').nextElementSibling).toHaveTextContent('Bs 12,51');
    expect(facts.getByText('Cuota del titular (referencia)').nextElementSibling).toHaveTextContent(
      'Bs 12,53',
    );
  });

  it('RF-002-16: el selector de período pide el resumen de ese mes', async () => {
    const user = userEvent.setup();
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    const select = await screen.findByRole('combobox', { name: 'Período' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Octubre 2026', 'Septiembre 2026']);
    await user.selectOptions(select, '2026-09');
    expect(
      await screen.findByRole('heading', { name: 'Cobros de septiembre 2026' }),
    ).toBeInTheDocument();
    expect(summaryMock).toHaveBeenLastCalledWith(OWNER, '2026-09', {
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue('2026-09');
  });

  it('CA-002-18: el historial muestra evento, autor o «Sistema» y fecha de La Paz, con «Cargar más»', async () => {
    const user = userEvent.setup();
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    await screen.findByRole('list', { name: 'Historial de cobros' });
    expect(historyItems()).toHaveLength(5);
    expect(chargesMock).toHaveBeenCalledWith(OWNER, { limit: 5 }, expect.anything());

    const diego = historyItems().find((item) => item.textContent?.includes('Diego Flores Paz'));
    const timeline = within(diego as HTMLElement).getByRole('list', { name: /Línea de tiempo/ });
    const events = within(timeline).getAllByRole('listitem');
    expect(events[0]).toHaveTextContent('Cobro emitido');
    expect(events[0]).toHaveTextContent('Sistema · 17 oct 2026, 00:00');
    expect(events[1]).toHaveTextContent('Comprobante enviado');
    expect(events[1]).toHaveTextContent('Diego Flores Paz · 18 oct 2026, 10:42');

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(historyItems()).toHaveLength(8));
    expect(chargesMock).toHaveBeenLastCalledWith(
      OWNER,
      { limit: 5, cursor: '5' },
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('CA-002-18: el titular abre cada cobro del historial en /cobros/[id]', async () => {
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    await screen.findByRole('list', { name: 'Historial de cobros' });
    const links = screen.getAllByRole('link', { name: /Ver cobro/ });
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute('href', '/cobros/7a1c5e00-0000-4000-8000-000000001001');
  });

  it('CA-002-25: el cobro de ingreso aparece pagado, con etiqueta «Ingreso» y su línea de tiempo', async () => {
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    await screen.findByRole('list', { name: 'Historial de cobros' });
    const entry = historyItems().find((item) => item.textContent?.includes('Ingreso'));
    expect(entry).toBeDefined();
    const scoped = within(entry as HTMLElement);
    expect(scoped.getByText('Septiembre 2026')).toBeInTheDocument();
    expect(scoped.getByText('Luis Mamani Choque')).toBeInTheDocument();
    expect(scoped.getByText('Pagado')).toBeInTheDocument();
    expect(scoped.getByText('Pago de ingreso registrado')).toBeInTheDocument();
    expect(scoped.getByRole('list', { name: /Línea de tiempo/ })).toHaveTextContent(
      'Ana Quispe Mamani · 18 sep 2026, 11:20',
    );
  });

  it('CA-002-17: un error al cargar más conserva lo cargado y deja reintentar', async () => {
    const user = userEvent.setup();
    render(<GroupChargesTab groupId={MEMBER} isOwner={false} />);
    await screen.findByRole('list', { name: 'Historial de cobros' });
    chargesMock.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('No pudimos cargar más cobros.')).toBeInTheDocument();
    expect(historyItems()).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(historyItems()).toHaveLength(6));
  });

  it('un 404 del resumen (sin ciclo) es el estado vacío del titular', async () => {
    render(<GroupChargesTab groupId={MOCK_BILLING_GROUP_IDS.noCycle} isOwner />);
    expect(
      await screen.findByText('Aún no hay cobros: se generan solos en la fecha de corte'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Período' })).not.toBeInTheDocument();
  });

  it('un 404 del resumen es el estado vacío del miembro', async () => {
    summaryMock.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    render(<GroupChargesTab groupId="sin-ciclo" isOwner={false} />);
    expect(await screen.findByText('Aún no hay cobros en este grupo')).toBeInTheDocument();
  });

  it('un error permite reintentar y sin conexión lo dice', async () => {
    const user = userEvent.setup();
    summaryMock.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    chargesMock.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    render(<GroupChargesTab groupId={OWNER} isOwner />);
    expect(await screen.findByText('Sin conexión con el servidor.')).toBeInTheDocument();
    expect(
      await screen.findByText('No pudimos cargar el historial de cobros.'),
    ).toBeInTheDocument();
    const [retrySummary, retryHistory] = screen.getAllByRole('button', { name: 'Reintentar' });
    await user.click(retrySummary);
    await user.click(retryHistory);
    expect(await screen.findByLabelText('Totales del mes')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Historial de cobros' })).toBeInTheDocument();
  });

  it('deja un lugar para la cola «Por revisar» del titular (T026), no para el miembro', async () => {
    const queue = <p>Cola por revisar</p>;
    const { unmount } = render(<GroupChargesTab groupId={OWNER} isOwner reviewQueue={queue} />);
    expect(await screen.findByText('Cola por revisar')).toBeInTheDocument();
    unmount();
    render(<GroupChargesTab groupId={MEMBER} isOwner={false} reviewQueue={queue} />);
    await screen.findByRole('list', { name: 'Cobros del mes' });
    expect(screen.queryByText('Cola por revisar')).not.toBeInTheDocument();
  });
});
