/**
 * Datos simulados de la spec 006 mientras el backend no está conectado (T012 a T026). Totales,
 * ahorro, porcentajes y eventos ya vienen resueltos, como los entregaría la API: aquí no se
 * calcula nada del dominio, solo se filtran las listas por la query. Nombres y montos inventados.
 */
import { ApiError } from './http';
import type {
  ApiDownload,
  CalendarEvent,
  CalendarResponse,
  ChargeLine,
  ChargeLinesPage,
  CollectionSummary,
  DashboardCharts,
  DashboardListParams,
  DashboardParams,
  DashboardSummary,
  GroupCollection,
  GroupExportFilters,
  HistoryFilters,
  HistoryItem,
  HistoryPage,
} from './reports';

const LATENCY_MS = 350;
const DEFAULT_LIMIT = 20;

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

const GROUP = {
  spotify: '5b0d7c3e-0000-4000-8000-000000000103',
  netflix: '5b0d7c3e-0000-4000-8000-000000000109',
  disney: '5b0d7c3e-0000-4000-8000-000000000105',
} as const;

const charge = (suffix: string) => `7a1c5e00-0000-4000-8000-${suffix}`;

/** Ids del simulador para probar errores a mano. */
export const MOCK_REPORT_IDS = {
  /** Grupo del que la persona no es titular: `403` en la cobranza y su exportación. */
  notOwnerGroup: GROUP.spotify,
  ownerGroup: GROUP.netflix,
} as const;

const MONTHS = ['2026-10', '2026-09', '2026-08'];

const COLLECTION: CollectionSummary = {
  groupId: GROUP.netflix,
  groupName: 'Netflix de la U',
  serviceName: 'Netflix',
  period: '2026-10',
  expectedCents: 9000,
  collectedCents: 6000,
  inReviewCents: 1500,
  pendingCents: 3000,
  percentCollected: 67,
  lateMembers: [
    {
      userId: '9c4e2f10-0000-4000-8000-000000000501',
      fullName: 'Luis Arce Medina',
      chargeId: charge('000000000701'),
      amountCents: 1500,
      dueDate: '2026-10-08',
      daysLate: 11,
    },
  ],
};

const DASHBOARD: DashboardSummary = {
  month: '2026-10',
  groupId: null,
  availableMonths: MONTHS,
  isEmpty: false,
  hasGroups: true,
  spend: {
    totalCents: 5550,
    paidCents: 3000,
    lines: [
      {
        groupId: GROUP.spotify,
        groupName: 'Spotify depa',
        serviceName: 'Spotify',
        logoUrl: null,
        role: 'miembro',
        costCents: 3000,
        paidCents: 3000,
      },
      {
        groupId: GROUP.netflix,
        groupName: 'Netflix de la U',
        serviceName: 'Netflix',
        logoUrl: null,
        role: 'titular',
        costCents: 2550,
        paidCents: null,
      },
    ],
  },
  savings: {
    totalCents: 4960,
    estimated: true,
    lines: [
      {
        groupId: GROUP.spotify,
        serviceName: 'Spotify',
        role: 'miembro',
        individualPriceBsCents: 7960,
        shareCents: 3000,
        savingsCents: 4960,
      },
    ],
    withoutData: [{ groupId: GROUP.netflix, serviceName: 'Netflix' }],
    negativeNote: null,
  },
  debts: { totalCents: 2500, count: 2, inReviewCents: 1640, inReviewCount: 1 },
  owed: {
    totalCents: 7500,
    count: 5,
    groups: [
      {
        groupId: GROUP.netflix,
        groupName: 'Netflix de la U',
        serviceName: 'Netflix',
        totalCents: 7500,
        count: 5,
      },
    ],
  },
  collection: [COLLECTION],
};

function line(overrides: Partial<ChargeLine> & Pick<ChargeLine, 'chargeId'>): ChargeLine {
  return {
    groupId: GROUP.spotify,
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    period: '2026-10',
    memberName: null,
    amountCents: 1000,
    status: 'pendiente',
    dueDate: '2026-10-21',
    link: `/cobros/${overrides.chargeId}`,
    ...overrides,
  };
}

const LISTS: Record<DashboardListParams['list'], ChargeLine[]> = {
  debts: [
    line({ chargeId: charge('000000000501') }),
    line({
      chargeId: charge('000000000502'),
      groupId: GROUP.disney,
      groupName: 'Disney+ primos',
      serviceName: 'Disney+',
      amountCents: 1500,
      status: 'atrasado',
      dueDate: '2026-10-05',
    }),
  ],
  in_review: [
    line({
      chargeId: charge('000000000503'),
      groupId: GROUP.disney,
      groupName: 'Disney+ primos',
      serviceName: 'Disney+',
      amountCents: 1640,
      status: 'en_revision',
    }),
  ],
  owed: [
    line({
      chargeId: charge('000000000701'),
      groupId: GROUP.netflix,
      groupName: 'Netflix de la U',
      serviceName: 'Netflix',
      memberName: 'Luis Arce Medina',
      amountCents: 1500,
      status: 'atrasado',
      dueDate: '2026-10-08',
    }),
    line({
      chargeId: charge('000000001002'),
      groupId: GROUP.netflix,
      groupName: 'Netflix de la U',
      serviceName: 'Netflix',
      memberName: 'Paola Rojas Ugarte',
      amountCents: 1500,
      status: 'en_revision',
    }),
  ],
};

function page<T>(items: T[], limit = DEFAULT_LIMIT, cursor?: string) {
  const start = cursor ? Number(cursor) : 0;
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor inválido.');
  }
  const slice = items.slice(start, start + limit);
  const end = start + slice.length;
  return { items: slice, nextCursor: end < items.length ? String(end) : null };
}

function checkMonth(month: string | undefined) {
  if (month && !MONTHS.includes(month)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Mes fuera del rango disponible.');
  }
}

export function getDashboard(params: DashboardParams): Promise<DashboardSummary> {
  return delay(() => {
    checkMonth(params.month);
    const groupId = params.groupId ?? null;
    if (!groupId) return { ...DASHBOARD, month: params.month ?? DASHBOARD.month };
    return {
      ...DASHBOARD,
      month: params.month ?? DASHBOARD.month,
      groupId,
      spend: {
        ...DASHBOARD.spend,
        lines: DASHBOARD.spend.lines.filter((item) => item.groupId === groupId),
      },
      savings: {
        ...DASHBOARD.savings,
        lines: DASHBOARD.savings.lines.filter((item) => item.groupId === groupId),
        withoutData: DASHBOARD.savings.withoutData.filter((item) => item.groupId === groupId),
      },
      collection: DASHBOARD.collection.filter((item) => item.groupId === groupId),
    };
  });
}

export function listDashboard(params: DashboardListParams): Promise<ChargeLinesPage> {
  return delay(() => {
    const items = LISTS[params.list].filter(
      (item) => !params.groupId || item.groupId === params.groupId,
    );
    return page(items, params.limit, params.cursor);
  });
}

export function getGroupCollection(groupId: string, period?: string): Promise<GroupCollection> {
  return delay(() => {
    if (groupId !== MOCK_REPORT_IDS.ownerGroup) {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el titular ve la cobranza del grupo.');
    }
    checkMonth(period);
    return {
      ...COLLECTION,
      period: period ?? COLLECTION.period,
      availablePeriods: MONTHS,
      members: [
        {
          userId: '9c4e2f10-0000-4000-8000-000000000201',
          fullName: 'Ana Quispe Mamani',
          chargeId: charge('000000000801'),
          amountCents: 3000,
          status: 'pagado',
        },
        {
          userId: '9c4e2f10-0000-4000-8000-000000000301',
          fullName: 'Marco Vargas Rojas',
          chargeId: charge('000000000802'),
          amountCents: 3000,
          status: 'pagado',
        },
        {
          userId: '9c4e2f10-0000-4000-8000-000000000601',
          fullName: 'Paola Rojas Ugarte',
          chargeId: charge('000000001002'),
          amountCents: 1500,
          status: 'en_revision',
        },
        {
          userId: '9c4e2f10-0000-4000-8000-000000000501',
          fullName: 'Luis Arce Medina',
          chargeId: charge('000000000701'),
          amountCents: 1500,
          status: 'atrasado',
        },
      ],
    };
  });
}

const CHARTS: DashboardCharts = {
  monthly: [
    { period: '2026-08', totalCents: 4190, paidCents: 4190 },
    { period: '2026-09', totalCents: 7250, paidCents: 7250 },
    { period: '2026-10', totalCents: 5550, paidCents: 3000 },
  ],
  byService: [
    { groupId: GROUP.spotify, serviceName: 'Spotify', costCents: 3000 },
    { groupId: GROUP.netflix, serviceName: 'Netflix', costCents: 2550 },
  ],
  savings: [
    { period: '2026-08', savingsCents: null, cumulativeCents: 0 },
    { period: '2026-09', savingsCents: 4960, cumulativeCents: 4960 },
    { period: '2026-10', savingsCents: 4960, cumulativeCents: 9920 },
  ],
};

export function getDashboardCharts(params: DashboardParams): Promise<DashboardCharts> {
  return delay(() => {
    checkMonth(params.month);
    if (!params.groupId) return CHARTS;
    return {
      ...CHARTS,
      byService: CHARTS.byService.filter((item) => item.groupId === params.groupId),
    };
  });
}

function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, 'date' | 'kind'>) {
  return {
    groupId: GROUP.spotify,
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    role: 'miembro' as const,
    amountCents: 3000,
    estimated: false,
    chargeId: null,
    status: null,
    ...overrides,
  };
}

const EVENTS: CalendarEvent[] = [
  event({
    date: '2026-10-05',
    kind: 'vencimiento',
    chargeId: charge('000000000502'),
    status: 'atrasado',
    groupId: GROUP.disney,
    groupName: 'Disney+ primos',
    serviceName: 'Disney+',
    amountCents: 1500,
  }),
  event({
    date: '2026-10-14',
    kind: 'corte',
    groupId: GROUP.netflix,
    groupName: 'Netflix de la U',
    serviceName: 'Netflix',
    role: 'titular',
    amountCents: 2550,
  }),
  event({
    date: '2026-10-21',
    kind: 'vencimiento',
    chargeId: charge('000000000501'),
    status: 'pendiente',
    amountCents: 1000,
  }),
  event({
    date: '2026-11-14',
    kind: 'corte',
    groupId: GROUP.netflix,
    groupName: 'Netflix de la U',
    serviceName: 'Netflix',
    role: 'titular',
    amountCents: 2550,
    estimated: true,
  }),
  event({ date: '2026-11-18', kind: 'corte', amountCents: 3000, estimated: true }),
];

export function getCalendar(month?: string): Promise<CalendarResponse> {
  return delay(() => {
    const target = month ?? '2026-10';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(target)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Mes inválido.');
    }
    return { month: target, events: EVENTS.filter((item) => item.date.startsWith(target)) };
  });
}

export function getUpcomingEvents(days: number): Promise<CalendarResponse> {
  return delay(() => {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Días fuera de rango.');
    }
    return { events: EVENTS.filter((item) => item.date >= '2026-10-19') };
  });
}

const HISTORY: HistoryItem[] = MONTHS.flatMap((period, index) => [
  {
    chargeId: charge(`00000000090${index}`),
    period,
    groupId: GROUP.spotify,
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    amountCents: 3000,
    status: 'pagado' as const,
    origin: 'ciclo' as const,
    dueDate: `${period}-21`,
    paidAt: `${period}-15T14:00:00.000Z`,
  },
  {
    chargeId: charge(`00000000091${index}`),
    period,
    groupId: GROUP.disney,
    groupName: 'Disney+ primos',
    serviceName: 'Disney+',
    amountCents: 1500,
    status: index === 0 ? ('atrasado' as const) : ('pagado' as const),
    origin: index === 2 ? ('ingreso' as const) : ('ciclo' as const),
    dueDate: `${period}-05`,
    paidAt: index === 0 ? null : `${period}-04T20:00:00.000Z`,
  },
]);

function filterHistory(filters: HistoryFilters) {
  return HISTORY.filter(
    (item) =>
      (!filters.period || item.period === filters.period) &&
      (!filters.groupId || item.groupId === filters.groupId) &&
      (!filters.status || item.status === filters.status),
  );
}

export function listHistory(
  params: HistoryFilters & { limit?: number; cursor?: string },
): Promise<HistoryPage> {
  return delay(() => page(filterHistory(params), params.limit, params.cursor));
}

function csv(rows: string[][]): Blob {
  const text = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return new Blob([`﻿${text}\n`], { type: 'text/csv;charset=utf-8' });
}

const CENTS = (value: number) => (value / 100).toFixed(2).replace('.', ',');

export function exportHistoryCsv(filters: HistoryFilters): Promise<ApiDownload> {
  return delay(() => {
    const rows = filterHistory(filters).map((item) => [
      item.period,
      item.groupName,
      CENTS(item.amountCents),
      item.status,
    ]);
    return {
      blob: csv([['Período', 'Grupo', 'Monto (Bs)', 'Estado'], ...rows]),
      filename: 'vaquita-historial.csv',
    };
  });
}

export function exportGroupHistoryCsv(
  groupId: string,
  filters: GroupExportFilters,
): Promise<ApiDownload> {
  return delay(() => {
    if (groupId !== MOCK_REPORT_IDS.ownerGroup) {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el titular exporta el historial del grupo.');
    }
    const period = filters.period ?? '2026-10';
    return {
      blob: csv([
        ['Período', 'Miembro', 'Monto (Bs)', 'Estado'],
        [period, 'Luis Arce Medina', '15,00', 'atrasado'],
      ]),
      filename: `vaquita-netflix-de-la-u-${period}.csv`,
    };
  });
}
