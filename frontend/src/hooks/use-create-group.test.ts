import { act, renderHook } from '@testing-library/react';
import {
  createGroup,
  quoteGroup,
  updatePaymentInfo,
  type CreateGroupRequest,
  type GroupDetail,
  type QuoteRequest,
} from '@/services/groups';
import { ApiError } from '@/services/http';
import { QUOTE_DEBOUNCE_MS, useCreateGroup, useGroupQuote } from './use-create-group';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));
jest.mock('@/services/groups', () => ({
  getHostEligibility: jest.fn(),
  quoteGroup: jest.fn(),
  createGroup: jest.fn(),
  updatePaymentInfo: jest.fn(),
}));

const mockedQuote = jest.mocked(quoteGroup);
const mockedCreate = jest.mocked(createGroup);
const mockedPaymentInfo = jest.mocked(updatePaymentInfo);

const quote = {
  totalBsCents: 10203,
  baseShareCents: 2550,
  ownerShareCents: 2553,
  remainderCents: 3,
};
const input: QuoteRequest = {
  priceCents: 1466,
  currency: 'USD',
  exchangeRate: '6.9600',
  memberCount: 4,
};

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  replace.mockReset();
  mockedQuote.mockReset();
  mockedCreate.mockReset();
  mockedPaymentInfo.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
});

afterEach(() => jest.useRealTimers());

describe('useGroupQuote (POST /groups/quote)', () => {
  it('RF-001-03: sin datos completos queda en idle y no pide nada', async () => {
    const { result } = renderHook(() => useGroupQuote(null));
    await advance(QUOTE_DEBOUNCE_MS);
    expect(result.current.status).toBe('idle');
    expect(mockedQuote).not.toHaveBeenCalled();
  });

  it('RF-001-03: pide la cotización 300 ms después del último cambio y muestra la del backend', async () => {
    mockedQuote.mockResolvedValue(quote);
    const { result, rerender } = renderHook(({ value }) => useGroupQuote(value), {
      initialProps: { value: { ...input, memberCount: 3 } as QuoteRequest | null },
    });
    expect(result.current.status).toBe('loading');
    await advance(QUOTE_DEBOUNCE_MS - 1);
    rerender({ value: input });
    await advance(QUOTE_DEBOUNCE_MS - 1);
    expect(mockedQuote).not.toHaveBeenCalled();

    await advance(1);
    expect(mockedQuote).toHaveBeenCalledTimes(1);
    expect(mockedQuote).toHaveBeenCalledWith(input);
    expect(result.current).toMatchObject({ status: 'success', quote });
  });

  it('RF-001-03: si falla queda en error y retry vuelve a pedir', async () => {
    mockedQuote
      .mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'x'))
      .mockResolvedValueOnce(quote);
    const { result } = renderHook(() => useGroupQuote(input));
    await advance(QUOTE_DEBOUNCE_MS);
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('VALIDATION_ERROR');

    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await advance(QUOTE_DEBOUNCE_MS);
    expect(result.current.quote).toEqual(quote);
  });
});

describe('useCreateGroup (POST /groups y PUT /groups/:id/payment-info)', () => {
  const body: CreateGroupRequest = {
    catalogPlanSlug: 'netflix-estandar',
    customServiceName: null,
    name: 'Netflix de la familia',
    priceCents: 1466,
    currency: 'USD',
    exchangeRate: '6.9600',
    billingDay: 1,
    totalSlots: 4,
    paymentInfoText: null,
  };
  const created = { id: 'g1', inviteCode: 'K7M2Q9PX' } as GroupDetail;

  it('RF-001-04: crea el grupo y, sin QR, no llama a payment-info', async () => {
    mockedCreate.mockResolvedValue(created);
    const { result } = renderHook(() => useCreateGroup());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit({ group: body, qr: null });
    });
    expect(outcome).toEqual({ ok: true, data: { group: created, qrError: null } });
    expect(mockedCreate).toHaveBeenCalledWith(body);
    expect(mockedPaymentInfo).not.toHaveBeenCalled();
  });

  it('RF-001-20: con QR lo sube después de crear y un fallo del QR no pierde el grupo', async () => {
    mockedCreate.mockResolvedValue(created);
    const qr = new File(['png'], 'qr.png', { type: 'image/png' });
    mockedPaymentInfo.mockRejectedValue(new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x'));
    const { result } = renderHook(() => useCreateGroup());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit({ group: body, qr });
    });
    expect(mockedPaymentInfo).toHaveBeenCalledWith('g1', { qr });
    expect(outcome).toMatchObject({
      ok: true,
      data: { group: created, qrError: { code: 'UNSUPPORTED_FILE_TYPE' } },
    });
  });

  it('RF-001-01: si falla la creación devuelve el ApiError', async () => {
    mockedCreate.mockRejectedValue(new ApiError(422, 'TOO_MANY_ACTIVE_GROUPS', 'x'));
    const { result } = renderHook(() => useCreateGroup());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit({ group: body, qr: null });
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: 'TOO_MANY_ACTIVE_GROUPS' } });
  });
});
