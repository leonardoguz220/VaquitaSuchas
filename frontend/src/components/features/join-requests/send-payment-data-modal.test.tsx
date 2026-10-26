import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JoinRequest } from '@/services/join-requests';
import { SendPaymentDataModal } from './send-payment-data-modal';

jest.mock('@/hooks/use-join-requests', () => ({
  useSendPaymentData: () => ({ submit: jest.fn(), isSubmitting: false }),
}));

const request = { id: 'r1', version: 1, estimatedShareCents: 3128 } as unknown as JoinRequest;

describe('SendPaymentDataModal (QA-09)', () => {
  it('al cambiar de opción quita el error de la opción anterior', async () => {
    render(
      <SendPaymentDataModal
        request={request}
        open
        onClose={jest.fn()}
        onSent={jest.fn()}
        onStale={jest.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Otros datos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar datos de pago' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /datos de pago del grupo/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
