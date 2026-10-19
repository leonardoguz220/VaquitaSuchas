import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cancelCharge, getCharge, registerManualPayment, type Charge } from '@/services/charges';
import { ApiError } from '@/services/http';
import { pendingCharge } from './__fixtures__/charges';
import { ChargePageView } from './charge-page';

jest.mock('@/services/charges', () => ({
  getCharge: jest.fn(),
  confirmCharge: jest.fn(),
  rejectCharge: jest.fn(),
  registerManualPayment: jest.fn(),
  cancelCharge: jest.fn(),
  getReceiptFile: jest.fn(),
  uploadReceipt: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros/c-overdue',
}));

const mockedGet = jest.mocked(getCharge);
const mockedManual = jest.mocked(registerManualPayment);
const mockedCancel = jest.mocked(cancelCharge);

const diego = { userId: 'u-diego', fullName: 'Diego Flores Paz' };
const ana = { userId: 'u-ana', fullName: 'Ana Quispe Mamani' };

/** Cobro `atrasado` de Diego, visto por la titular Ana: admite pago en efectivo y cancelar. */
const overdue: Charge = {
  ...pendingCharge,
  id: 'c-overdue',
  member: { ...diego, isFormerMember: false },
  amountCents: 1251,
  status: 'atrasado',
  issuedAt: '2026-10-15T04:00:00.000Z',
  lastRejection: null,
  paymentInfo: null,
  currentReceipt: null,
  allowedActions: ['manualPayment', 'cancel'],
  version: 3,
};

const paid: Charge = {
  ...overdue,
  status: 'pagado',
  paidAt: '2026-10-19T15:30:00.000Z',
  settlement: 'manual',
  settledBy: ana,
  manualNote: 'Entregó en mano',
  allowedActions: [],
  version: 4,
};

const cancelled: Charge = {
  ...overdue,
  status: 'cancelado',
  cancelReason: 'Se dio de baja',
  allowedActions: [],
  version: 4,
};

async function renderPage(charge: Charge = overdue) {
  mockedGet.mockResolvedValue(charge);
  const user = userEvent.setup();
  render(<ChargePageView chargeId={charge.id} />);
  await screen.findByRole('heading', { level: 1, name: 'Cobro de Octubre 2026' });
  return user;
}

async function openManual(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Pago en efectivo' }));
  return screen.getByRole('dialog', { name: 'Registrar pago en efectivo' });
}

async function openCancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Cancelar cobro' }));
  return screen.getByRole('dialog', { name: 'Cancelar el cobro' });
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedManual.mockReset();
  mockedCancel.mockReset();
  replace.mockReset();
});

describe('OwnerSettlementActions en /cobros/[id] (T030)', () => {
  it('CA-002-14: sin pago en efectivo ni cancelar en allowedActions no hay botones (el miembro no los ve)', async () => {
    await renderPage({ ...overdue, allowedActions: [] });
    expect(screen.queryByRole('button', { name: 'Pago en efectivo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar cobro' })).not.toBeInTheDocument();
  });

  it('CA-002-14: registra el pago en efectivo con nota y muestra el cobro pagado', async () => {
    mockedManual.mockResolvedValue(paid);
    const user = await renderPage();
    const dialog = await openManual(user);

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nota (opcional)' }),
      ' Entregó en mano ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() =>
      expect(mockedManual).toHaveBeenCalledWith(
        'c-overdue',
        expect.objectContaining({ note: 'Entregó en mano', version: 3 }),
      ),
    );
    expect(await screen.findByText('Pago en efectivo registrado')).toBeInTheDocument();
  });

  it('CA-002-14: una fecha de pago anterior a la emisión no se envía y avisa en el campo', async () => {
    const user = await renderPage();
    const dialog = await openManual(user);

    fireEvent.change(within(dialog).getByLabelText('Fecha y hora del pago (opcional)'), {
      target: { value: '2026-10-14T10:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));

    expect(
      within(dialog).getByText('La fecha del pago no puede ser anterior a la emisión del cobro.'),
    ).toBeInTheDocument();
    expect(mockedManual).not.toHaveBeenCalled();
  });

  it('CA-002-14: si el cobro ya no admite el pago (409), el modal se cierra y la página avisa', async () => {
    mockedManual.mockRejectedValue(new ApiError(409, 'INVALID_TRANSITION', 'Cambió.'));
    const user = await renderPage();
    const dialog = await openManual(user);

    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));

    expect(await screen.findByText('Este cobro ya no admite cambios.')).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Registrar pago en efectivo' }),
    ).not.toBeInTheDocument();
  });

  it('CA-002-15: cancelar pide un motivo de 5 a 200 caracteres y envía el motivo con la versión', async () => {
    mockedCancel.mockResolvedValue(cancelled);
    const user = await renderPage();
    const dialog = await openCancel(user);
    const reason = within(dialog).getByRole('textbox', { name: 'Motivo' });

    await user.type(reason, 'nota');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar cobro' }));
    expect(
      within(dialog).getByText('El motivo debe tener entre 5 y 200 caracteres.'),
    ).toBeInTheDocument();
    expect(mockedCancel).not.toHaveBeenCalled();

    await user.clear(reason);
    await user.type(reason, 'Se dio de baja');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar cobro' }));

    await waitFor(() =>
      expect(mockedCancel).toHaveBeenCalledWith('c-overdue', {
        reason: 'Se dio de baja',
        version: 3,
      }),
    );
    expect(await screen.findByText('Cobro cancelado')).toBeInTheDocument();
  });

  it('CA-002-19: un 409 STALE_STATE al cancelar recarga el cobro y avisa', async () => {
    mockedCancel.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'El cobro cambió.'));
    const user = await renderPage();
    mockedGet.mockResolvedValue(paid);
    const dialog = await openCancel(user);

    await user.type(within(dialog).getByRole('textbox', { name: 'Motivo' }), 'Se dio de baja');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar cobro' }));

    expect(
      await screen.findByText('Otra persona modificó el cobro; recargamos los datos'),
    ).toBeInTheDocument();
    expect(mockedGet.mock.calls.length).toBeGreaterThan(1);
  });
});
