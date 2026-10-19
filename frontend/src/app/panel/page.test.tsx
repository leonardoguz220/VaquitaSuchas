import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { chargeLine, collection, dashboard } from '@/services/__fixtures__/reports';
import { listGroups } from '@/services/groups';
import { ApiError } from '@/services/http';
import {
  getDashboard,
  getDashboardCharts,
  listDashboard,
  type DashboardCharts,
  type DashboardListParams,
} from '@/services/reports';
import PanelPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/panel',
}));
jest.mock('@/services/reports', () => ({
  getDashboard: jest.fn(),
  getDashboardCharts: jest.fn(),
  listDashboard: jest.fn(),
}));
// Recharts se prueba en su propio archivo; aquí cada gráfico deja ver los datos que recibe.
jest.mock('@/components/features/dashboard/charts/dashboard-recharts', () => {
  const chart = (name: string) =>
    function FakeChart({ data }: { data: unknown[] }) {
      return <p data-testid={name}>{`${name}: ${data.length} barras`}</p>;
    };
  return {
    MonthlySpendChart: chart('monthly'),
    ServiceSpendChart: chart('byService'),
    SavingsChart: chart('savings'),
  };
});
jest.mock('@/services/groups', () => ({ listGroups: jest.fn() }));

const mockedDashboard = jest.mocked(getDashboard);
const mockedList = jest.mocked(listDashboard);
const mockedCharts = jest.mocked(getDashboardCharts);

const charts: DashboardCharts = {
  monthly: [
    { period: '2026-09', totalCents: 7250, paidCents: 7250 },
    { period: '2026-10', totalCents: 5550, paidCents: 3000 },
  ],
  byService: [
    { groupId: 'g2', serviceName: 'Spotify', costCents: 3000 },
    { groupId: 'g1', serviceName: 'Netflix', costCents: 2550 },
  ],
  savings: [
    { period: '2026-09', savingsCents: null, cumulativeCents: 0 },
    { period: '2026-10', savingsCents: 4960, cumulativeCents: 4960 },
  ],
};
const mockedGroups = jest.mocked(listGroups);

const debtPending = chargeLine();
const debtLate = chargeLine({
  chargeId: 'c2',
  groupName: 'Paramount+ del curso',
  serviceName: 'Paramount+',
  period: '2026-09',
  amountCents: 1500,
  status: 'atrasado',
  dueDate: '2026-09-08',
  link: '/cobros/c2',
});
const inReview = chargeLine({
  chargeId: 'c3',
  status: 'en_revision',
  amountCents: 1640,
  link: '/cobros/c3',
});
const owedReview = chargeLine({
  chargeId: 'c4',
  groupName: 'Netflix de la familia',
  serviceName: 'Netflix',
  memberName: 'Luis Mamani',
  status: 'en_revision',
  amountCents: 1500,
  link: '/cobros/c4',
});

function listsBy(lists: Partial<Record<DashboardListParams['list'], unknown[]>>) {
  mockedList.mockImplementation(async (params) => ({
    items: (lists[params.list] ?? []) as never[],
    nextCursor: null,
  }));
}

function renderPage() {
  const user = userEvent.setup();
  render(<PanelPage />);
  return user;
}

const tile = (name: string) => screen.findByRole('region', { name });

beforeEach(() => {
  replace.mockReset();
  mockedDashboard.mockReset();
  mockedList.mockReset();
  mockedGroups.mockReset();
  mockedCharts.mockReset();
  mockedCharts.mockResolvedValue(charts);
  mockedGroups.mockResolvedValue({
    items: [
      { id: 'g1', name: 'Netflix de la familia' },
      { id: 'g2', name: 'Spotify depa' },
    ] as never[],
    nextCursor: null,
  });
  listsBy({ debts: [debtPending, debtLate], in_review: [inReview], owed: [owedReview] });
});

describe('/panel (spec 006 T012)', () => {
  it('RF-006-01: el título es "Panel", la ruta es protegida y pide el mes actual sin filtros', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    expect(metadata.title).toBe('Panel');
    expect(isPublicPath('/panel')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible();
    await tile('Gasto del mes');
    expect(mockedDashboard).toHaveBeenCalledWith({});
  });

  it('RF-006-11 / RF-006-13: el panel enlaza al calendario y al historial', () => {
    mockedDashboard.mockReturnValue(new Promise(() => {}));
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'Secciones del panel' });
    expect(within(nav).getByRole('link', { name: 'Calendario' })).toHaveAttribute(
      'href',
      '/panel/calendario',
    );
    expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute(
      'href',
      '/panel/historial',
    );
  });

  it('RF-006-01: mientras carga muestra el esqueleto', () => {
    mockedDashboard.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando tu panel…')).toBeInTheDocument();
  });

  it('RF-006-01: el selector de mes y el filtro por suscripción los aplica la API', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    const user = renderPage();
    await tile('Gasto del mes');
    const monthSelect = screen.getByRole('combobox', { name: 'Mes' });
    expect(monthSelect).toHaveValue('2026-10');
    expect(
      within(monthSelect).getByRole('option', { name: 'Septiembre 2026' }),
    ).toBeInTheDocument();
    await user.selectOptions(monthSelect, '2026-09');
    expect(mockedDashboard).toHaveBeenLastCalledWith({ month: '2026-09' });
    await tile('Gasto del mes');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Suscripción' }), 'g2');
    expect(mockedDashboard).toHaveBeenLastCalledWith({ month: '2026-09', groupId: 'g2' });
  });

  it('CA-006-01: el gasto del mes muestra el total de la API (Bs 55,50) y lo pagado', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const spend = await tile('Gasto del mes');
    expect(within(spend).getByText('Bs 55,50')).toBeInTheDocument();
    expect(within(spend).getByText('Pagado: Bs 30,00')).toBeInTheDocument();
  });

  it('CA-006-22: el desglose por suscripción muestra cada cuota y el total de la API', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const list = await screen.findByRole('list', { name: 'Gasto por suscripción' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Bs 30,00')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Pagado: Bs 30,00')).toBeInTheDocument();
    // CA-006-03: el titular ve su cuota de referencia, sin «pagado».
    expect(within(rows[1]).getByText('Bs 25,50')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Cuota de referencia')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Netflix · Titular')).toBeInTheDocument();
    expect(screen.getByText('Total del mes').nextSibling).toHaveTextContent('Bs 55,50');
  });

  it('CA-006-04: el ahorro se rotula «Estimado» y muestra Bs 49,60', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const savings = await tile('Ahorro estimado');
    expect(within(savings).getByText('Estimado')).toBeInTheDocument();
    expect(within(savings).getAllByText('Bs 49,60')).toHaveLength(2);
  });

  it('CA-006-05: una suscripción sin precio individual se muestra como «Sin dato»', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const savings = await tile('Ahorro estimado');
    const without = within(savings).getByRole('list', { name: 'Suscripciones sin dato' });
    expect(within(without).getByText('Netflix')).toBeInTheDocument();
    expect(within(without).getByText('Sin dato')).toBeInTheDocument();
  });

  it('CA-006-05: si ninguna tiene dato, el total del ahorro dice «Sin dato»', async () => {
    const base = dashboard();
    mockedDashboard.mockResolvedValue(
      dashboard({ savings: { ...base.savings, totalCents: null, lines: [] } }),
    );
    renderPage();
    const savings = await tile('Ahorro estimado');
    expect(within(savings).getAllByText('Sin dato')[0]).toHaveClass('font-display');
  });

  it('CA-006-21: un ahorro negativo lleva signo menos y la nota de la API', async () => {
    const base = dashboard();
    mockedDashboard.mockResolvedValue(
      dashboard({
        savings: {
          ...base.savings,
          totalCents: -1250,
          lines: [{ ...base.savings.lines[0], savingsCents: -1250 }],
          negativeNote: 'Compartir este plan te sale más caro que el plan individual.',
        },
      }),
    );
    renderPage();
    const savings = await tile('Ahorro estimado');
    expect(within(savings).getAllByText('−Bs 12,50')).toHaveLength(2);
    expect(
      within(savings).getByText('Compartir este plan te sale más caro que el plan individual.'),
    ).toBeInTheDocument();
    expect(within(savings).getByText('Nota:')).toBeInTheDocument();
  });

  it('CA-006-06: «Debes» muestra el total de la API (Bs 25,00) y la lista con «Subir comprobante»', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const debts = await tile('Debes');
    expect(within(debts).getByText('Bs 25,00')).toBeInTheDocument();
    expect(within(debts).getByText('2 cobros pendientes o atrasados')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Lo que debes' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Pendiente')).toBeInTheDocument();
    expect(within(items[1]).getByText('Atrasado')).toBeInTheDocument();
    expect(
      within(items[1]).getByText('Paramount+ · Septiembre 2026 · vence el 8 sep 2026'),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByRole('link', { name: 'Subir comprobante: Spotify depa, Octubre 2026' }),
    ).toHaveAttribute('href', '/cobros/c1');
    expect(mockedList).toHaveBeenCalledWith({ list: 'debts', limit: 10 });
  });

  it('CA-006-07: lo que está en revisión se muestra aparte y no en «Lo que debes»', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const debts = await tile('Debes');
    expect(within(debts).getByText('En revisión: Bs 16,40 · 1 cobro')).toBeInTheDocument();
    const review = await screen.findByRole('list', { name: 'En revisión' });
    expect(within(review).getByText('En revisión')).toBeInTheDocument();
    expect(within(review).getByRole('link', { name: /Ver cobro/ })).toHaveAttribute(
      'href',
      '/cobros/c3',
    );
    const owe = screen.getByRole('list', { name: 'Lo que debes' });
    expect(within(owe).queryByText('Bs 16,40')).toBeNull();
  });

  it('CA-006-08: «Te deben» (titular) muestra el total de 5 cobros por grupo y la lista con «Revisar comprobante»', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const owed = await tile('Te deben');
    expect(within(owed).getAllByText('Bs 75,00')).toHaveLength(2);
    expect(within(owed).getByText('5 cobros de tus miembros')).toBeInTheDocument();
    expect(within(owed).getByText('Netflix de la familia · 5 cobros')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Lo que te deben' });
    expect(within(list).getByText('Luis Mamani')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /Revisar comprobante/ })).toHaveAttribute(
      'href',
      '/cobros/c4',
    );
  });

  it('RF-006-05: quien no es titular no ve «Te deben» ni pide esa lista', async () => {
    mockedDashboard.mockResolvedValue(dashboard({ owed: null, collection: [] }));
    renderPage();
    await tile('Debes');
    expect(screen.queryByRole('region', { name: 'Te deben' })).toBeNull();
    await screen.findByRole('list', { name: 'Lo que debes' });
    expect(mockedList).not.toHaveBeenCalledWith(expect.objectContaining({ list: 'owed' }));
  });

  it('RF-006-04: listas vacías y error de una lista con Reintentar', async () => {
    mockedDashboard.mockResolvedValue(dashboard({ owed: null }));
    mockedList.mockImplementation(async (params) => {
      if (params.list === 'in_review') throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'x');
      return { items: [], nextCursor: null };
    });
    const user = renderPage();
    expect(
      await screen.findByText('No tienes cobros pendientes ni atrasados.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('No pudimos cargar tus cobros en revisión.')).toBeVisible();
    mockedList.mockResolvedValue({ items: [inReview], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'En revisión' })).toBeInTheDocument();
  });

  it('RF-006-04: «Ver más» pide la siguiente página de la lista', async () => {
    mockedDashboard.mockResolvedValue(dashboard({ owed: null }));
    mockedList.mockImplementation(async (params) =>
      params.list === 'debts' && !params.cursor
        ? { items: [debtPending], nextCursor: 'k2' }
        : params.list === 'debts'
          ? { items: [debtLate], nextCursor: null }
          : { items: [], nextCursor: null },
    );
    const user = renderPage();
    await screen.findByRole('list', { name: 'Lo que debes' });
    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(mockedList).toHaveBeenCalledWith({ list: 'debts', limit: 10, cursor: 'k2' });
    expect(
      await within(screen.getByRole('list', { name: 'Lo que debes' })).findByText(
        'Paramount+ del curso',
      ),
    ).toBeInTheDocument();
  });

  it('CA-006-14 / RF-006-16: sin grupos muestra «Aún no tienes suscripciones» con crear y unirse', async () => {
    mockedDashboard.mockResolvedValue(
      dashboard({
        hasGroups: false,
        isEmpty: true,
        availableMonths: [],
        owed: null,
        collection: [],
      }),
    );
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Aún no tienes suscripciones' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Crear un grupo' })).toHaveAttribute(
      'href',
      '/grupos/nuevo',
    );
    expect(screen.getByRole('link', { name: 'Unirme con un código' })).toHaveAttribute(
      'href',
      '/unirse',
    );
    expect(screen.queryByRole('region', { name: 'Gasto del mes' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Mes' })).toBeNull();
  });

  it('RF-006-16: un mes sin cobros muestra los valores en cero y el aviso, no un error', async () => {
    const base = dashboard();
    mockedDashboard.mockResolvedValue(
      dashboard({
        isEmpty: true,
        spend: { totalCents: 0, paidCents: 0, lines: [] },
        savings: { ...base.savings, totalCents: null, lines: [], withoutData: [] },
      }),
    );
    renderPage();
    expect(await screen.findByText('No hay cobros en Octubre 2026.')).toBeVisible();
    expect(within(await tile('Gasto del mes')).getByText('Bs 0,00')).toBeInTheDocument();
  });

  it('RF-006-01: un error muestra el aviso con Reintentar; un 404 explica la suscripción ajena', async () => {
    mockedDashboard
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'x'))
      .mockResolvedValue(dashboard());
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tu panel.')).toBeVisible();
    expect(screen.getByText('No encontramos esa suscripción entre las tuyas.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await tile('Gasto del mes')).toBeInTheDocument();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mockedDashboard.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fpanel'));
  });

  it('CA-006-09: «Cobranza de tus grupos» muestra 67 % cobrado en texto y Bs 30,00 pendiente', async () => {
    mockedDashboard.mockResolvedValue(dashboard());
    renderPage();
    const section = await screen.findByRole('region', { name: 'Cobranza de tus grupos' });
    const card = within(section).getByRole('region', { name: 'Netflix de la familia' });
    expect(card).toHaveTextContent('Cobrado Bs 60,00 de Bs 90,00 · 67 %');
    expect(card).toHaveTextContent('Netflix · Octubre 2026');
    expect(within(card).getByText('Pendiente').nextSibling).toHaveTextContent('Bs 30,00');
    expect(within(card).getByText('En revisión').nextSibling).toHaveTextContent('Bs 15,00');
    expect(
      within(card).getByRole('link', { name: 'Revisar el cobro de Luis Mamani' }),
    ).toHaveAttribute('href', '/cobros/c9');
  });

  it('RNF-006-05: sin monto esperado no hay barra y lo dice en texto', async () => {
    mockedDashboard.mockResolvedValue(
      dashboard({
        collection: [
          collection({
            expectedCents: 0,
            collectedCents: 0,
            pendingCents: 0,
            inReviewCents: 0,
            percentCollected: null,
            lateMembers: [],
          }),
        ],
      }),
    );
    renderPage();
    const section = await screen.findByRole('region', { name: 'Cobranza de tus grupos' });
    expect(section).toHaveTextContent('Cobrado Bs 0,00 de Bs 0,00 · sin monto esperado');
    expect(within(section).getByText('Nadie está atrasado.')).toBeInTheDocument();
  });

  it('RF-006-06: quien no es titular no ve la cobranza', async () => {
    mockedDashboard.mockResolvedValue(dashboard({ owed: null, collection: [] }));
    renderPage();
    await tile('Gasto del mes');
    expect(screen.queryByRole('region', { name: 'Cobranza de tus grupos' })).toBeNull();
  });

  describe('Gráficos (spec 006 T018)', () => {
    async function chartCard(name: string) {
      const section = await screen.findByRole('region', { name: 'Gráficos' });
      return within(section).findByRole('region', { name });
    }

    it('RF-006-07: pide las series con el mismo mes y suscripción que el panel', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      const user = renderPage();
      await chartCard('Tu gasto de los últimos 12 meses');
      expect(mockedCharts).toHaveBeenCalledWith({});
      await user.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), '2026-09');
      await chartCard('Tu gasto de los últimos 12 meses');
      expect(mockedCharts).toHaveBeenLastCalledWith({ month: '2026-09' });
    });

    it('RF-006-10: cada gráfico se carga aparte y tiene «Ver tabla» con aria-pressed', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      renderPage();
      const monthly = await chartCard('Tu gasto de los últimos 12 meses');
      expect(await within(monthly).findByTestId('monthly')).toHaveTextContent('monthly: 2 barras');
      for (const name of [
        'Tu gasto de los últimos 12 meses',
        'Gasto por servicio',
        'Ahorro acumulado',
      ]) {
        const card = await chartCard(name);
        expect(within(card).getByRole('button', { name: 'Ver tabla' })).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      }
    });

    it('CA-006-12: «Ver tabla» del gasto mensual muestra los mismos valores que el gráfico', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      const user = renderPage();
      const card = await chartCard('Tu gasto de los últimos 12 meses');
      const toggle = within(card).getByRole('button', { name: 'Ver tabla' });
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(within(card).queryByTestId('monthly')).toBeNull();
      const table = within(card).getByRole('table', { name: 'Gasto de los últimos 12 meses' });
      const rows = within(table)
        .getAllByRole('row')
        .map((row) => row.textContent);
      expect(rows).toEqual([
        'MesGastoPagado',
        'Septiembre 2026Bs 72,50Bs 72,50',
        'Octubre 2026Bs 55,50Bs 30,00',
      ]);
      await user.click(toggle);
      expect(await within(card).findByTestId('monthly')).toBeInTheDocument();
    });

    it('CA-006-12: las tablas por servicio y de ahorro muestran los valores de la API', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      const user = renderPage();
      const service = await chartCard('Gasto por servicio');
      await user.click(within(service).getByRole('button', { name: 'Ver tabla' }));
      expect(
        within(service)
          .getAllByRole('row')
          .map((row) => row.textContent),
      ).toEqual(['ServicioGasto', 'SpotifyBs 30,00', 'NetflixBs 25,50']);
      const savings = await chartCard('Ahorro acumulado');
      await user.click(within(savings).getByRole('button', { name: 'Ver tabla' }));
      expect(
        within(savings)
          .getAllByRole('row')
          .map((row) => row.textContent),
      ).toEqual([
        'MesAhorro del mesAcumulado',
        'Septiembre 2026Sin datoBs 0,00',
        'Octubre 2026Bs 49,60Bs 49,60',
      ]);
    });

    it('CA-006-21: en la tabla de ahorro un valor negativo lleva signo menos', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      mockedCharts.mockResolvedValue({
        ...charts,
        savings: [{ period: '2026-10', savingsCents: -1250, cumulativeCents: -1250 }],
      });
      const user = renderPage();
      const savings = await chartCard('Ahorro acumulado');
      await user.click(within(savings).getByRole('button', { name: 'Ver tabla' }));
      expect(within(savings).getAllByText('\u2212Bs 12,50')).toHaveLength(2);
    });

    it('RF-006-16: series vacías dicen que no hay datos, sin gráfico ni «Ver tabla»', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      mockedCharts.mockResolvedValue({ monthly: [], byService: [], savings: [] });
      renderPage();
      const monthly = await chartCard('Tu gasto de los últimos 12 meses');
      expect(within(monthly).getByText('Todavía no hay meses con datos.')).toBeInTheDocument();
      expect(within(monthly).queryByRole('button', { name: 'Ver tabla' })).toBeNull();
      expect(
        within(await chartCard('Gasto por servicio')).getByText('No hay gasto en Octubre 2026.'),
      ).toBeInTheDocument();
    });

    it('RF-006-07: si fallan los gráficos se ofrece Reintentar sin perder el resto del panel', async () => {
      mockedDashboard.mockResolvedValue(dashboard());
      mockedCharts
        .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
        .mockResolvedValue(charts);
      const user = renderPage();
      expect(await screen.findByText('No pudimos cargar los gráficos.')).toBeVisible();
      expect(screen.getByRole('region', { name: 'Gasto del mes' })).toBeInTheDocument();
      const section = screen.getByRole('region', { name: 'Gráficos' });
      await user.click(within(section).getByRole('button', { name: 'Reintentar' }));
      expect(await chartCard('Gasto por servicio')).toBeInTheDocument();
    });
  });
});
