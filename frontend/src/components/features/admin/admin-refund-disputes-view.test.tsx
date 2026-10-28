import { render, screen } from '@testing-library/react';
import { listDisputedRefunds, type DisputedRefund } from '@/services/shortfalls';
import { AdminRefundDisputesView } from './admin-refund-disputes-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/devoluciones',
}));

jest.mock('@/services/shortfalls', () => ({ listDisputedRefunds: jest.fn() }));

const listMock = listDisputedRefunds as jest.MockedFunction<typeof listDisputedRefunds>;

const item: DisputedRefund = {
  rowId: 'row-1',
  groupId: 'g-1',
  groupName: 'Netflix familia',
  period: '2026-11',
  memberName: 'Ana Prueba',
  hostName: 'Luis Titular',
  refundAmountCents: 2500,
  refundMethod: 'qr',
  refundReference: 'DEV-3',
  disputeReason: 'No me llegó',
  disputedAt: '2026-11-20T15:00:00Z',
};

describe('AdminRefundDisputesView (spec 011 T017, CA-011-16)', () => {
  beforeEach(() => listMock.mockReset());

  it('muestra cada devolución disputada con su motivo y la referencia', async () => {
    listMock.mockResolvedValue([item]);
    render(<AdminRefundDisputesView />);

    const card = await screen.findByRole('article', { name: 'Devolución de Ana Prueba' });
    expect(card).toHaveTextContent('Netflix familia · Noviembre 2026');
    expect(card).toHaveTextContent('Bs 25,00');
    expect(card).toHaveTextContent('Registrada por QR · ref. DEV-3');
    expect(card).toHaveTextContent('Motivo: No me llegó');
  });

  it('sin devoluciones disputadas lo dice', async () => {
    listMock.mockResolvedValue([]);
    render(<AdminRefundDisputesView />);

    expect(await screen.findByText('No hay devoluciones disputadas por ahora.')).toBeVisible();
  });
});
