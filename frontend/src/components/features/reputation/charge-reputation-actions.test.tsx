import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pendingCharge } from '@/services/__fixtures__/charges';
import { getMe, type UserSelf } from '@/services/auth';
import type { Charge } from '@/services/charges';
import { ApiError } from '@/services/http';
import { excludeChargeFromReputation, reportChargeRating } from '@/services/reputation';
import { ChargeReputationActions, chargeCountsForReputation } from './charge-reputation-actions';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cobros/c1',
}));
jest.mock('@/services/auth', () => ({ getMe: jest.fn() }));
jest.mock('@/services/reputation', () => ({
  ...jest.requireActual('@/services/reputation'),
  reportChargeRating: jest.fn(),
  excludeChargeFromReputation: jest.fn(),
}));

const mockedMe = jest.mocked(getMe);
const mockedReport = jest.mocked(reportChargeRating);
const mockedExclude = jest.mocked(excludeChargeFromReputation);

/** Cobro de Ana (u2) pagado tarde, de origen `ciclo`. */
const paidCharge: Charge = {
  ...pendingCharge,
  status: 'pagado',
  paidAt: '2026-10-23T14:00:00.000Z',
  paymentInfo: null,
  allowedActions: [],
};

function person(id: string, fullName: string): UserSelf {
  return {
    id,
    fullName,
    email: `${id}@vaquita.test`,
    ciMasked: '*****123',
    phone: '+59170000000',
    role: 'usuario',
    status: 'activo',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const ana = person('u2', 'Ana Quispe Mamani');
const marco = person('u1', 'Marco Vargas Rojas');

function renderActions(charge: Charge = paidCharge) {
  const user = userEvent.setup();
  render(<ChargeReputationActions charge={charge} />);
  return user;
}

beforeEach(() => {
  mockedMe.mockReset();
  mockedReport.mockReset();
  mockedExclude.mockReset();
  mockedMe.mockResolvedValue(ana);
});

describe('Reportar y excluir de reputación en /cobros/[id] (spec 007 T032)', () => {
  it('RF-007-14: solo se ofrecen en cobros de ciclo pagados o atrasados', () => {
    expect(chargeCountsForReputation({ origin: 'ciclo', status: 'pagado' })).toBe(true);
    expect(chargeCountsForReputation({ origin: 'ciclo', status: 'atrasado' })).toBe(true);
    expect(chargeCountsForReputation({ origin: 'ciclo', status: 'pendiente' })).toBe(false);
    expect(chargeCountsForReputation({ origin: 'ciclo', status: 'en_revision' })).toBe(false);
    expect(chargeCountsForReputation({ origin: 'ciclo', status: 'cancelado' })).toBe(false);
    // RN-007-09: el cobro de ingreso no cuenta.
    expect(chargeCountsForReputation({ origin: 'ingreso', status: 'pagado' })).toBe(false);
  });

  it('RF-007-14: el dueño del cobro ve «Reportar calificación» y no «Excluir»', async () => {
    renderActions();
    expect(await screen.findByRole('button', { name: 'Reportar calificación' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Excluir de reputación' })).toBeNull();
  });

  it('RF-007-14: el dueño envía el reporte con el comentario y ve la confirmación', async () => {
    mockedReport.mockResolvedValue(undefined);
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(
      within(dialog).getByLabelText(/Qué pasó/),
      '  Subí el comprobante el 20, antes del vencimiento.  ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(mockedReport).toHaveBeenCalledWith('c1', {
      comment: 'Subí el comprobante el 20, antes del vencimiento.',
    });
    expect(
      await screen.findByText('Enviamos tu reporte al titular. Te avisaremos si excluye el cobro.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reportar calificación' })).toBeNull();
  });

  it('RF-007-14: el texto debe tener entre 10 y 300 caracteres antes de enviarse', async () => {
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    const field = within(dialog).getByLabelText(/Qué pasó/);
    await user.type(field, 'Muy corto');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(mockedReport).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Escribe entre 10 y 300 caracteres.')).toBeVisible();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('maxLength', '300');
  });

  it('RF-007-14: REPORT_ALREADY_SENT avisa que ya lo reportó', async () => {
    mockedReport.mockRejectedValue(new ApiError(422, 'REPORT_ALREADY_SENT', 'x'));
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByLabelText(/Qué pasó/), 'Pagué a tiempo este cobro.');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(
      await screen.findByText('Ya reportaste este cobro. El titular lo revisará.'),
    ).toBeVisible();
  });

  it('RF-007-14: CHARGE_ALREADY_EXCLUDED avisa que ya está excluido', async () => {
    mockedReport.mockRejectedValue(new ApiError(422, 'CHARGE_ALREADY_EXCLUDED', 'x'));
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByLabelText(/Qué pasó/), 'Pagué a tiempo este cobro.');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByText('Este cobro ya está excluido de la reputación.')).toBeVisible();
  });

  it('RF-007-14: un error de conexión queda en el modal para reintentar', async () => {
    mockedReport.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Reportar calificación' }));
    const dialog = screen.getByRole('dialog', { name: 'Reportar calificación' });
    await user.type(within(dialog).getByLabelText(/Qué pasó/), 'Pagué a tiempo este cobro.');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar reporte' }));
    expect(await within(dialog).findByText('No se pudo contactar con el servidor.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Enviar reporte' })).toBeEnabled();
  });

  it('CA-007-13: el titular excluye el cobro con motivo y ve que se recalculó', async () => {
    mockedMe.mockResolvedValue(marco);
    mockedExclude.mockResolvedValue(undefined);
    const user = renderActions({ ...paidCharge, status: 'atrasado', paidAt: null });
    expect(
      await screen.findByText(/cuenta para la calificación de puntualidad de Ana Quispe Mamani/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reportar calificación' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de reputación' });
    await user.type(
      within(dialog).getByLabelText(/Motivo/),
      'El banco acreditó tarde un pago hecho a tiempo.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));
    expect(mockedExclude).toHaveBeenCalledWith('c1', {
      reason: 'El banco acreditó tarde un pago hecho a tiempo.',
    });
    expect(
      await screen.findByText(
        'Excluiste el cobro de la reputación. La calificación de la persona ya se recalculó.',
      ),
    ).toBeVisible();
  });

  it('RF-007-14: si la API responde 403 a la exclusión lo explica', async () => {
    mockedMe.mockResolvedValue(marco);
    mockedExclude.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const user = renderActions();
    await user.click(await screen.findByRole('button', { name: 'Excluir de reputación' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir de reputación' });
    await user.type(within(dialog).getByLabelText(/Motivo/), 'Motivo suficientemente largo.');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir de reputación' }));
    expect(
      await screen.findByText('Solo el titular del grupo puede excluir un cobro de la reputación.'),
    ).toBeVisible();
  });

  it('RF-007-14: mientras no se sabe quién consulta, no muestra nada', () => {
    mockedMe.mockReturnValue(new Promise(() => {}));
    renderActions();
    expect(screen.queryByRole('region', { name: 'Reputación' })).toBeNull();
  });
});
