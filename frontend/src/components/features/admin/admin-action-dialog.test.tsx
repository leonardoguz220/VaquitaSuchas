import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { AdminActionDialog } from './admin-action-dialog';

function renderDialog(overrides: Partial<Parameters<typeof AdminActionDialog>[0]> = {}) {
  const onConfirm = jest.fn().mockResolvedValue({ ok: true, data: null });
  const onClose = jest.fn();
  render(
    <AdminActionDialog
      open
      onClose={onClose}
      title="¿Suspender a Ana?"
      description="Se cierran sus sesiones."
      confirmLabel="Suspender"
      danger
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onClose };
}

describe('AdminActionDialog (spec 009)', () => {
  it('CA-009-09: no envía la acción con un motivo de menos de 10 caracteres', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.type(screen.getByLabelText(/Motivo/), 'corto');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('El motivo va de 10 a 300 caracteres.')).toBeInTheDocument();
  });

  it('CA-009-09: muestra el contador de caracteres y envía el motivo sin espacios sobrantes', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.type(screen.getByLabelText(/Motivo/), '   Reclamo abierto por pago  ');
    expect(screen.getByText(/\d+ \/ 300/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith('Reclamo abierto por pago');
  });

  it('CA-009-09: si el servidor rechaza la acción, muestra su mensaje y no cierra', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockResolvedValue({
      ok: false,
      error: new ApiError(422, 'BUSINESS_RULE', 'No puedes suspenderte a ti mismo.'),
    });
    const { onClose } = renderDialog({ onConfirm });

    await user.type(screen.getByLabelText(/Motivo/), 'Motivo suficientemente largo');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(await screen.findByText('No puedes suspenderte a ti mismo.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CA-009-11: reactivar deja el motivo opcional y envía sin texto', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({
      confirmLabel: 'Reactivar',
      danger: false,
      reasonRequired: false,
    });

    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(''));
  });
});
