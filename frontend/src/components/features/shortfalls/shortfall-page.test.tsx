import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import * as shortfalls from '@/services/shortfalls';
import type { ShortfallQuote, ShortfallRound, ShortfallRow } from '@/services/shortfalls';
import { ShortfallPageView } from './shortfall-page';

jest.mock('@/services/shortfalls');
jest.mock('@/hooks/use-unauthorized-redirect', () => ({
  useUnauthorizedRedirect: () => () => false,
}));

const api = jest.mocked(shortfalls);

const quote: ShortfallQuote = {
  groupId: 'g1',
  cycleId: 'c1',
  period: '2026-11',
  totalBsCents: 10000,
  memberCountAfter: 3,
  baseShareCents: 3333,
  ownerShareCents: 3334,
  shortfallCents: 1666,
  rows: [
    { userId: 'a', fullName: 'Ana Pérez', paidCents: 2500, extraDueCents: 833 },
    { userId: 'b', fullName: 'Beto Rojas', paidCents: 2500, extraDueCents: 833 },
  ],
};

const row = (overrides: Partial<ShortfallRow> = {}): ShortfallRow => ({
  id: 'row-a',
  roundId: 'round-1',
  groupId: 'g1',
  member: { userId: 'a', fullName: 'Ana Pérez' },
  paidCents: 2500,
  extraDueCents: 833,
  choice: 'pendiente',
  extra: {
    status: 'no_aplica',
    method: null,
    reference: null,
    deadlineAt: null,
    rejectReason: null,
  },
  refund: {
    status: 'no_aplica',
    amountCents: null,
    method: null,
    reference: null,
    dueAt: null,
    disputeReason: null,
  },
  version: 1,
  allowedActions: [],
  timeline: [],
  ...overrides,
});

const round = (rows: ShortfallRow[], extra: Partial<ShortfallRound> = {}): ShortfallRound => ({
  id: 'round-1',
  groupId: 'g1',
  period: '2026-11',
  roundNumber: 1,
  status: 'abierta',
  totalBsCents: 10000,
  memberCountAfter: 3,
  baseShareCents: 3333,
  ownerShareCents: 3334,
  shortfallCents: 1666,
  openedAt: '2026-11-20T12:00:00Z',
  respondBy: '2026-11-22T12:00:00Z',
  payBy: '2026-11-24T12:00:00Z',
  closedAt: null,
  version: 1,
  rows,
  allowedActions: [],
  ...extra,
});

beforeEach(() => jest.resetAllMocks());

describe('ShortfallPageView (spec 011)', () => {
  it('HU-011-01: el titular ve la cotización del backend y avisa al grupo', async () => {
    api.getCurrentShortfall.mockResolvedValue(null);
    api.getShortfallPreview.mockResolvedValue(quote);
    api.openShortfallRound.mockResolvedValue(round([row()]));

    render(<ShortfallPageView groupId="g1" />);

    expect(await screen.findByText('Falta cubrir Bs 16,66')).toBeInTheDocument();
    expect(screen.getAllByText('Debe agregar Bs 8,33')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Avisar al grupo' }));

    await waitFor(() => expect(api.openShortfallRound).toHaveBeenCalledWith('g1'));
    expect(await screen.findByText('Ronda de Noviembre 2026')).toBeInTheDocument();
  });

  it('CA-011-02: sin diferencia no hay botón para avisar', async () => {
    api.getCurrentShortfall.mockResolvedValue(null);
    api.getShortfallPreview.mockResolvedValue({ ...quote, shortfallCents: 0, rows: [] });

    render(<ShortfallPageView groupId="g1" />);

    expect(await screen.findByText('No falta nada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avisar al grupo' })).not.toBeInTheDocument();
  });

  it('CA-011-13: un miembro que no es el titular solo ve que no hay ronda', async () => {
    api.getCurrentShortfall.mockResolvedValue(null);
    api.getShortfallPreview.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'No'));

    render(<ShortfallPageView groupId="g1" />);

    expect(
      await screen.findByText('No hay una ronda de faltante en este grupo.'),
    ).toBeInTheDocument();
  });

  it('CA-011-05: el afectado elige cubrir con las acciones que dice la API', async () => {
    api.getCurrentShortfall.mockResolvedValue(
      round([row({ allowedActions: ['cover', 'requestRefund'] })]),
    );
    api.respondToShortfall.mockResolvedValue(
      row({
        choice: 'cubrir',
        extra: {
          status: 'pendiente_pago',
          method: null,
          reference: null,
          deadlineAt: '2026-11-22T12:00:00Z',
          rejectReason: null,
        },
        allowedActions: ['pay'],
        version: 2,
      }),
    );

    render(<ShortfallPageView groupId="g1" />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Cubrir mi parte \(Bs 8,33\)/ }),
    );

    await waitFor(() =>
      expect(api.respondToShortfall).toHaveBeenCalledWith('row-a', {
        choice: 'cubrir',
        version: 1,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Informar mi pago' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cubrir mi parte/ })).not.toBeInTheDocument();
  });

  it('CA-011-06: pedir devolución avisa que se sale del grupo', async () => {
    api.getCurrentShortfall.mockResolvedValue(
      round([row({ allowedActions: ['cover', 'requestRefund'] })]),
    );

    render(<ShortfallPageView groupId="g1" />);

    expect(
      await screen.findByRole('button', { name: 'Pedir mi devolución y salir del grupo' }),
    ).toBeInTheDocument();
  });

  it('un error de plazo se muestra por su código y recarga la ronda', async () => {
    api.getCurrentShortfall.mockResolvedValue(
      round([row({ allowedActions: ['cover', 'requestRefund'] })]),
    );
    api.respondToShortfall.mockRejectedValue(new ApiError(422, 'DEADLINE_PASSED', 'x'));

    render(<ShortfallPageView groupId="g1" />);
    await userEvent.click(await screen.findByRole('button', { name: /Cubrir mi parte/ }));

    expect(await screen.findByText('El plazo para esta acción venció.')).toBeInTheDocument();
    await waitFor(() => expect(api.getCurrentShortfall).toHaveBeenCalledTimes(2));
  });

  it('RF-011-06: el titular puede cancelar solo si la API lo permite', async () => {
    api.getCurrentShortfall.mockResolvedValue(round([row()], { allowedActions: ['cancel'] }));
    api.cancelShortfallRound.mockResolvedValue(round([row()], { status: 'cancelada' }));

    render(<ShortfallPageView groupId="g1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar la ronda' }));

    await waitFor(() => expect(api.cancelShortfallRound).toHaveBeenCalledWith('round-1'));
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it('CA-011-11: el afectado confirma o disputa una devolución registrada', async () => {
    api.getCurrentShortfall.mockResolvedValue(
      round(
        [
          row({
            choice: 'devolucion',
            refund: {
              status: 'enviada',
              amountCents: 2500,
              method: 'qr',
              reference: 'D1',
              dueAt: null,
              disputeReason: null,
            },
            allowedActions: ['confirmRefund', 'disputeRefund'],
          }),
        ],
        { status: 'cerrada' },
      ),
    );

    render(<ShortfallPageView groupId="g1" />);

    expect(
      await screen.findByRole('button', { name: 'Confirmar que recibí mi devolución' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disputar devolución' })).toBeInTheDocument();
  });

  it('muestra el aviso de error con Reintentar si la carga falla', async () => {
    api.getCurrentShortfall.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'x'));

    render(<ShortfallPageView groupId="g1" />);

    expect(await screen.findByText('No pudimos cargar el faltante del grupo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
