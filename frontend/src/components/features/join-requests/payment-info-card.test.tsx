import { render, screen } from '@testing-library/react';
import type { JoinRequest } from '@/services/join-requests';
import { PaymentInfoCard } from './payment-info-card';

jest.mock('@/hooks/use-join-requests', () => ({
  usePaymentQr: () => ({ status: 'idle', data: null, error: null }),
}));

function requestWith(memberCount: number): JoinRequest {
  return {
    id: 'r1',
    paymentInfo: { text: 'Cuenta de prueba', qrAvailable: false },
    quote: { amountCents: 3128, totalBsCents: 6257, memberCount },
  } as unknown as JoinRequest;
}

describe('PaymentInfoCard (QA-07)', () => {
  it('con 1 miembro dice «1 miembro», en singular', () => {
    render(<PaymentInfoCard request={requestWith(1)} viewer="titular" />);
    expect(screen.getByText(/del mes entre 1 miembro$/)).toBeInTheDocument();
  });

  it('con 2 o más miembros dice «miembros» y «contándote» al solicitante', () => {
    render(<PaymentInfoCard request={requestWith(2)} viewer="solicitante" />);
    expect(screen.getByText(/del mes entre 2 miembros, contándote/)).toBeInTheDocument();
  });
});
