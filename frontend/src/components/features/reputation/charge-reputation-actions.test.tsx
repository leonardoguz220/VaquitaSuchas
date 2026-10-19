import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pendingCharge } from '@/components/features/charges/__fixtures__/charges';
import type { Charge } from '@/services/charges';
import { ApiError, NETWORK_ERROR_CODE } from '@/services/http';
import { excludeChargeReputation, reportChargeReputation } from '@/services/reputation';
import { ChargeReputationActions } from './charge-reputation-actions';

jest.mock('@/services/reputation', () => ({
  reportChargeReputation: jest.fn(),
  excludeChargeReputation: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/cobros/c-test',
}));

const mockedReport = jest.mocked(reportChargeReputation);
const mockedExclude = jest.mocked(excludeChargeReputation);

/** Dueño del cobro: la API le ofrece subir comprobante (no es titular). */
const owned: Charge = { ...pendingCharge, id: 'c-owned', allowedActions: ['uploadReceipt'] };
/** Titular: la API le ofrece confirmar o rechazar. */
const hosted: Charge = {
  ...pendingCharge,
  id: 'c-hosted',
  status: 'en_revision',
  allowedActions: ['confirm', 'reject'],
};
const noActions: Charge = { ...pendingCharge, id: 'c-none', allowedActions: [] };

const VALID_TEXT = 'La calificación no refleja el pago que hice a tiempo.';

beforeEach(() => {
  mockedReport.mockReset();
  mockedExclude.mockReset();
  mockedReport.mockResolvedValue(undefined);
  mockedExclude.mockResolvedValue(undefined);
});

describe('ChargeReputationActions (RF-007-14; CA-007-13)', () => {
  it('CA-007-13: el titular ve «Excluir de reputación» y no «Reportar calificación»', () => {
    render(<ChargeReputationActions charge={hosted} onNotice={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Excluir de reputación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reportar calificación' })).not.toBeInTheDocument();
  });

  it('CA-007-13: el dueño del cobro ve «Reportar calificación» y no la exclusión', () => {
    render(<ChargeReputationActions charge={owned} onNotice={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Reportar calificación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir de reputación' })).not.toBeInTheDocument();
  });

  it('CA-007-13: sin acciones de la API no se muestra nada', () => {
    const { container } = render(
      <ChargeReputationActions charge={noActions} onNotice={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('CA-007-13: excluir exige un motivo de 10 a 300 caracteres y no llama a la API si no cumple', async () => {
    const user = userEvent.setup();
    render(<ChargeReputationActions charge={hosted} onNotice={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de la reputación' });
    await user.type(within(dialog).getByRole('textbox'), 'corto');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));
    expect(within(dialog).getByText('Escribe entre 10 y 300 caracteres.')).toBeInTheDocument();
    expect(mockedExclude).not.toHaveBeenCalled();
  });

  it('CA-007-13: el contador del motivo muestra los caracteres escritos', async () => {
    const user = userEvent.setup();
    render(<ChargeReputationActions charge={hosted} onNotice={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de la reputación' });
    await user.type(within(dialog).getByRole('textbox'), 'Pagó tarde');
    expect(within(dialog).getByText(/\(10\/300\)/)).toBeInTheDocument();
  });

  it('CA-007-13: la exclusión envía el motivo al servicio y deja el aviso de éxito en la página', async () => {
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={hosted} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de la reputación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success', title: 'Cobro excluido de la reputación' }),
      ),
    );
    expect(mockedExclude).toHaveBeenCalledWith('c-hosted', { reason: VALID_TEXT });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-007-13: el dueño envía el reporte con el comentario y ve el aviso de éxito', async () => {
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={owned} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success', title: 'Reporte enviado' }),
      ),
    );
    expect(mockedReport).toHaveBeenCalledWith('c-owned', { comment: VALID_TEXT });
  });

  it('CA-007-13: REPORT_ALREADY_SENT cierra el modal y deja «Ya enviaste un reporte para este cobro» en la página', async () => {
    mockedReport.mockRejectedValue(
      new ApiError(422, 'REPORT_ALREADY_SENT', 'Ya enviaste un reporte para este cobro.'),
    );
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={owned} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({
        variant: 'warning',
        title: 'Ya enviaste un reporte para este cobro',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-007-13: CHARGE_ALREADY_EXCLUDED al reportar deja «Este cobro ya está excluido de la reputación» en la página', async () => {
    mockedReport.mockRejectedValue(
      new ApiError(422, 'CHARGE_ALREADY_EXCLUDED', 'El cobro ya está excluido de la reputación.'),
    );
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={owned} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({
        variant: 'warning',
        title: 'Este cobro ya está excluido de la reputación',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-007-13: un 400 de validación se muestra en el campo del motivo', async () => {
    mockedExclude.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'Dato inválido.'));
    const user = userEvent.setup();
    render(<ChargeReputationActions charge={hosted} onNotice={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de la reputación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));

    expect(
      await within(dialog).findByText('Escribe entre 10 y 300 caracteres.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-007-13: sin conexión el aviso queda dentro del modal y se conserva el texto', async () => {
    mockedReport.mockRejectedValue(new ApiError(0, NETWORK_ERROR_CODE, 'Sin red.'));
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={owned} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));

    expect(
      await within(dialog).findByText(
        'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox')).toHaveValue(VALID_TEXT);
    expect(onNotice.mock.calls.every(([notice]) => notice === null)).toBe(true);
  });

  it('CA-007-13: un 403 al excluir deja el aviso de permisos en la página', async () => {
    mockedExclude.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Sin permiso.'));
    const user = userEvent.setup();
    const onNotice = jest.fn();
    render(<ChargeReputationActions charge={hosted} onNotice={onNotice} />);
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de la reputación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({
        variant: 'error',
        title: 'Solo el titular del grupo puede excluir este cobro de la reputación.',
      }),
    );
  });

  it('CA-007-13: mientras se envía el botón queda en estado de carga', async () => {
    let resolve: () => void = () => {};
    mockedReport.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    const user = userEvent.setup();
    render(<ChargeReputationActions charge={owned} onNotice={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByRole('textbox'), VALID_TEXT);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));

    expect(within(dialog).getByRole('button', { name: /Enviar reporte/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    resolve();
  });
});
