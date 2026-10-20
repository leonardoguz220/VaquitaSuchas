import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  confirmCharge,
  getCharge,
  getReceiptFile,
  rejectCharge,
  type Charge,
} from '@/services/charges';
import { ApiError, NETWORK_ERROR_CODE } from '@/services/http';
import { pendingCharge } from './__fixtures__/charges';
import { ChargePageView } from './charge-page';

jest.mock('@/services/charges', () => ({
  getCharge: jest.fn(),
  confirmCharge: jest.fn(),
  rejectCharge: jest.fn(),
  getReceiptFile: jest.fn(),
  uploadReceipt: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros/c-review',
}));

const mockedGet = jest.mocked(getCharge);
const mockedConfirm = jest.mocked(confirmCharge);
const mockedReject = jest.mocked(rejectCharge);
const mockedFile = jest.mocked(getReceiptFile);

const ana = { userId: 'u-ana', fullName: 'Ana Quispe Mamani' };
const diego = { userId: 'u-diego', fullName: 'Diego Flores Paz' };

/** Cobro `en_revision` visto por la titular (Ana): `Charge` completo con comprobante vigente. */
const inReview: Charge = {
  ...pendingCharge,
  id: 'c-review',
  member: { ...diego, isFormerMember: false },
  amountCents: 1251,
  status: 'en_revision',
  lastRejection: null,
  paymentInfo: null,
  currentReceipt: {
    id: 'r-1',
    uploadedAt: '2026-10-18T14:42:00.000Z',
    uploadedBy: diego,
    method: 'transferencia',
    reference: 'TRX-77120',
    mime: 'image/jpeg',
    sizeBytes: 860_000,
    status: 'vigente',
    fileAvailable: true,
  },
  allowedActions: ['confirm', 'reject'],
  version: 5,
};

const confirmed: Charge = {
  ...inReview,
  status: 'pagado',
  paidAt: '2026-10-19T15:30:00.000Z',
  settlement: 'comprobante',
  settledBy: ana,
  currentReceipt: { ...inReview.currentReceipt!, status: 'confirmado' },
  allowedActions: [],
  version: 6,
};

const rejectedAs = (status: 'pendiente' | 'atrasado'): Charge => ({
  ...inReview,
  status,
  currentReceipt: null,
  lastRejection: {
    reason: 'El monto no llegó',
    invalidReceipt: true,
    at: '2026-10-19T15:30:00.000Z',
  },
  allowedActions: ['manualPayment', 'cancel'],
  version: 6,
});

async function renderPage(charge: Charge = inReview) {
  mockedGet.mockResolvedValue(charge);
  const user = userEvent.setup();
  render(<ChargePageView chargeId={charge.id} />);
  await screen.findByRole('heading', { level: 1, name: 'Cobro de Octubre 2026' });
  return user;
}

async function openReject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Rechazar' }));
  return screen.getByRole('dialog', { name: 'Rechazar el comprobante' });
}

const reasonBox = () => screen.getByRole('textbox', { name: /Motivo/ });

beforeEach(() => {
  mockedGet.mockReset();
  mockedConfirm.mockReset();
  mockedReject.mockReset();
  mockedFile.mockReset();
  replace.mockReset();
});

describe('OwnerReviewActions en /cobros/[id] (T026)', () => {
  it('CA-002-06: confirmar explica el efecto y muestra pagado con quién y cuándo', async () => {
    mockedConfirm.mockResolvedValue(confirmed);
    const user = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    const dialog = screen.getByRole('dialog', { name: '¿Confirmar el pago?' });
    expect(dialog).toHaveTextContent('Confirmas que recibiste Bs 12,51 de Diego Flores Paz.');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));

    expect(mockedConfirm).toHaveBeenCalledWith('c-review', { version: 5 });
    expect(await screen.findByText('Pago confirmado')).toBeInTheDocument();
    expect(screen.getByText('El cobro de Diego Flores Paz quedó «Pagado».')).toBeInTheDocument();
    expect(screen.getByText('Pagado el 19 oct 2026, 11:30')).toBeInTheDocument();
    expect(screen.getByText('Confirmado por Ana Quispe Mamani.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('CA-002-07: rechazar con motivo y «Comprobante inválido» vuelve a pendiente con el motivo', async () => {
    mockedReject.mockResolvedValue(rejectedAs('pendiente'));
    const user = await renderPage();

    const dialog = await openReject(user);
    await user.type(reasonBox(), '  El monto no llegó ');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Comprobante inválido' }));
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));

    expect(mockedReject).toHaveBeenCalledWith('c-review', {
      reason: 'El monto no llegó',
      invalidReceipt: true,
      version: 5,
    });
    expect(await screen.findByText('Comprobante rechazado')).toBeInTheDocument();
    expect(screen.getByText(/quedó «Pendiente»/)).toBeInTheDocument();
    expect(screen.getByText('Motivo del último rechazo')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-002-30: rechazar tras el vencimiento muestra atrasado según la API', async () => {
    mockedReject.mockResolvedValue(rejectedAs('atrasado'));
    const user = await renderPage();

    const dialog = await openReject(user);
    await user.type(reasonBox(), 'Llegó tarde');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));

    expect(await screen.findByText(/quedó «Atrasado»/)).toBeInTheDocument();
    expect(screen.getAllByText('Atrasado').length).toBeGreaterThan(0);
  });

  it('CA-002-08: el rechazo sin motivo o corto no se envía y un 400 marca el campo', async () => {
    const user = await renderPage();
    const dialog = await openReject(user);
    const submit = within(dialog).getByRole('button', { name: 'Rechazar comprobante' });

    await user.click(submit);
    expect(await within(dialog).findByText('Escribe el motivo del rechazo.')).toBeInTheDocument();
    expect(reasonBox()).toHaveAttribute('aria-invalid', 'true');
    expect(reasonBox()).toHaveFocus();

    await user.type(reasonBox(), 'Mal');
    await user.click(submit);
    expect(
      within(dialog).getByText('El motivo debe tener entre 5 y 200 caracteres.'),
    ).toBeInTheDocument();
    expect(mockedReject).not.toHaveBeenCalled();

    mockedReject.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.'));
    await user.type(reasonBox(), ' de nuevo');
    await user.click(submit);
    expect(
      await within(dialog).findByText('El motivo debe tener entre 5 y 200 caracteres.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('CA-002-12: el miembro dueño no ve Confirmar ni Rechazar; un 403 muestra el mensaje', async () => {
    await renderPage({ ...pendingCharge, allowedActions: ['uploadReceipt'] });
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('CA-002-12: si la API responde 403 al confirmar, avisa que solo el titular puede', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar pago' }),
    );
    expect(
      await screen.findByText('Solo el titular puede confirmar este cobro'),
    ).toBeInTheDocument();
  });

  it('muestra solo los botones que trae allowedActions', async () => {
    await renderPage({ ...inReview, allowedActions: ['reject'] });
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
  });

  it('409 STALE_STATE recarga el cobro y avisa', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const user = await renderPage();
    mockedGet.mockResolvedValue({ ...inReview, version: 7 });
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar pago' }),
    );
    expect(
      await screen.findByText('Otra persona modificó el cobro; recargamos los datos'),
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new ApiError(409, 'INVALID_TRANSITION', 'x'), 'Este cobro ya no admite cambios.'],
    [
      new ApiError(422, 'GROUP_FROZEN', 'x'),
      'El grupo está congelado por ahora y no admite cambios en sus cobros.',
    ],
  ])('un error de la API al rechazar cierra el modal y avisa (%s)', async (error, message) => {
    mockedReject.mockRejectedValue(error);
    const user = await renderPage();
    const dialog = await openReject(user);
    await user.type(reasonBox(), 'No coincide');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sin conexión el modal sigue abierto con el aviso', async () => {
    mockedConfirm.mockRejectedValue(new ApiError(0, NETWORK_ERROR_CODE, 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    expect(await within(dialog).findByText(/Sin conexión con el servidor/)).toBeInTheDocument();
  });

  describe('Ver comprobante', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    afterAll(() => open.mockRestore());
    beforeEach(() => open.mockClear());

    it('CA-002-13: con el cobro completo pide la URL firmada y la abre en una pestaña nueva', async () => {
      mockedFile.mockResolvedValue({
        url: 'https://storage.example/firmada',
        expiresAt: '2026-10-19T15:40:00.000Z',
        mime: 'image/jpeg',
      });
      const user = await renderPage();
      expect(screen.getByText('TRX-77120')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Ver comprobante/ }));
      expect(mockedFile).toHaveBeenCalledWith('c-review', 'r-1');
      await waitFor(() =>
        expect(open).toHaveBeenCalledWith('https://storage.example/firmada', '_blank', 'noopener'),
      );
    });

    it('CA-002-13: 410 FILE_DELETED avisa que se eliminó por antigüedad', async () => {
      mockedFile.mockRejectedValue(new ApiError(410, 'FILE_DELETED', 'x'));
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: /Ver comprobante/ }));
      expect(
        await screen.findByText('El comprobante ya fue eliminado por antigüedad'),
      ).toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
    });

    it('CA-002-13: 403 o 404 al pedir el archivo muestran su mensaje y no abren pestaña', async () => {
      mockedFile.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'x'));
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: /Ver comprobante/ }));
      expect(await screen.findByText('No encontramos este comprobante')).toBeInTheDocument();

      mockedFile.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
      await user.click(screen.getByRole('button', { name: /Ver comprobante/ }));
      expect(await screen.findByText('No tienes acceso a este comprobante')).toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
    });

    it('CA-002-13: sin archivo disponible no se ofrece el botón', async () => {
      await renderPage({
        ...inReview,
        currentReceipt: { ...inReview.currentReceipt!, fileAvailable: false },
      });
      expect(screen.queryByRole('button', { name: /Ver comprobante/ })).not.toBeInTheDocument();
    });
  });
});
