import { apiRequest } from './http';
import {
  cancelShortfallRound,
  confirmShortfallPayment,
  confirmShortfallRefund,
  disputeShortfallRefund,
  getCurrentShortfall,
  getShortfallPreview,
  listMyShortfalls,
  openShortfallRound,
  payShortfallExtra,
  rejectShortfallPayment,
  respondToShortfall,
  sendShortfallRefund,
} from './shortfalls';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const GROUP = 'g-1';
const ROW = 'r-1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

beforeEach(() => mockedRequest.mockReset().mockResolvedValue({}));

describe('servicio del faltante de grupo (spec 011)', () => {
  it('RF-011-01: pide la cotización y la ronda del grupo', async () => {
    await getShortfallPreview(GROUP);
    expect(lastCall().path).toBe('/api/groups/g-1/shortfall/preview');
    await getCurrentShortfall(GROUP);
    expect(lastCall().path).toBe('/api/groups/g-1/shortfall');
  });

  it('RF-011-04: abre la ronda con POST sin montos del cliente', async () => {
    await openShortfallRound(GROUP);
    expect(lastCall()).toMatchObject({
      path: '/api/groups/g-1/shortfall',
      options: { method: 'POST', body: {} },
    });
  });

  it('RF-011-06 y HU-011-02: cancela la ronda y lista mis faltantes', async () => {
    await cancelShortfallRound('round-1');
    expect(lastCall()).toMatchObject({
      path: '/api/shortfall-rounds/round-1/cancel',
      options: { method: 'POST' },
    });
    await listMyShortfalls();
    expect(lastCall().path).toBe('/api/me/shortfalls');
  });

  it.each([
    [
      'respond',
      () => respondToShortfall(ROW, { choice: 'cubrir', version: 2 }),
      { choice: 'cubrir', version: 2 },
    ],
    [
      'pay',
      () => payShortfallExtra(ROW, { method: 'qr', reference: 'R1' }),
      { method: 'qr', reference: 'R1' },
    ],
    ['confirm-payment', () => confirmShortfallPayment(ROW, { version: 1 }), { version: 1 }],
    [
      'reject-payment',
      () => rejectShortfallPayment(ROW, { reason: 'No llegó' }),
      { reason: 'No llegó' },
    ],
    [
      'refund',
      () => sendShortfallRefund(ROW, { method: 'efectivo', reference: 'D1' }),
      { method: 'efectivo', reference: 'D1' },
    ],
    ['refund/confirm', () => confirmShortfallRefund(ROW, {}), {}],
    [
      'refund/dispute',
      () => disputeShortfallRefund(ROW, { reason: 'No llegó' }),
      { reason: 'No llegó' },
    ],
  ])('RF-011-08 a 13: %s va por POST a la fila con su cuerpo', async (suffix, call, body) => {
    await call();
    expect(lastCall()).toMatchObject({
      path: `/api/shortfall-rows/r-1/${suffix}`,
      options: { method: 'POST', body },
    });
  });
});
