import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { paidCharge, pendingCharge } from '@/components/features/charges/__fixtures__/charges';
import { ChargeDetailView } from '@/components/features/charges/charge-detail';
import { isPublicPath } from '@/lib/routes';
import { getCharge } from '@/services/charges';
import { ApiError } from '@/services/http';
import ChargePage from './page';

jest.mock('@/services/charges', () => ({ getCharge: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cobros/abc',
}));

const mocked = jest.mocked(getCharge);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/cobros/abc');
  mocked.mockResolvedValue(pendingCharge);
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('/cobros/[id] (T018, plan 002 §6)', () => {
  it('lee el id de la ruta, muestra monto y estado con texto, y exige sesión', async () => {
    render(await ChargePage({ params: Promise.resolve({ id: pendingCharge.id }) }));
    expect(await heading('Cobro de Octubre 2026')).toBeVisible();
    expect(mocked).toHaveBeenCalledWith(pendingCharge.id, { signal: expect.any(AbortSignal) });
    expect(screen.getByText('Bs 19,81')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
    expect(screen.getByText('A nombre de Ana Quispe Mamani')).toBeVisible();
    expect(isPublicPath('/cobros/abc')).toBe(false);
  });

  it('RNF-002-06: mientras carga muestra esqueletos', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<ChargeDetailView chargeId="abc" />);
    expect(screen.getByText('Cargando el cobro…')).toBeInTheDocument();
  });

  it('CA-002-12: un 403 muestra «No tienes acceso a este cobro»', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    render(<ChargeDetailView chargeId="otro" />);
    expect(await heading('No tienes acceso a este cobro')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir a Mis cobros' })).toHaveAttribute(
      'href',
      '/cobros',
    );
  });

  it('CA-002-23: un 404 muestra «Cobro no encontrado»', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    render(<ChargeDetailView chargeId="ajeno" />);
    expect(await heading('Cobro no encontrado')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Datos de pago' })).not.toBeInTheDocument();
  });

  it('RNF-002-06: un error permite reintentar y sin conexión lo dice', async () => {
    const user = userEvent.setup();
    mocked.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    render(<ChargeDetailView chargeId="abc" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await heading('Cobro de Octubre 2026')).toBeVisible();
  });

  it('CA-002-07: el miembro ve el motivo del último rechazo', async () => {
    render(<ChargeDetailView chargeId="abc" />);
    await heading('Cobro de Octubre 2026');
    const alert = screen.getByText('Motivo del último rechazo').closest('[role="status"]');
    expect(alert).toHaveTextContent('El monto no coincide.');
    expect(alert).toHaveTextContent('El titular marcó el comprobante como inválido.');
    expect(alert).toHaveTextContent('Rechazado el 18 oct 2026, 18:05.');
  });

  it('CA-002-18: la línea de tiempo muestra evento, autor (o Sistema) y fecha en La Paz', async () => {
    render(<ChargeDetailView chargeId="abc" />);
    await heading('Cobro de Octubre 2026');
    const items = within(screen.getByRole('list', { name: 'Línea de tiempo' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Cobro emitido');
    expect(items[0]).toHaveTextContent('Sistema · 18 oct 2026, 00:00');
    expect(items[1]).toHaveTextContent('Comprobante enviado');
    expect(items[1]).toHaveTextContent('Ana Quispe Mamani · 18 oct 2026, 10:30');
    expect(items[2]).toHaveTextContent('Pago rechazado');
    expect(items[2]).toHaveTextContent('Marco Vargas Rojas · 18 oct 2026, 18:05');
    expect(items[2]).toHaveTextContent('Motivo: El monto no coincide.');
  });

  it('CA-001-23: muestra los datos de pago con texto, QR y botón Copiar', async () => {
    const user = userEvent.setup();
    const writeText = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ChargeDetailView chargeId="abc" />);
    const section = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(section).getByText('BNB · Cuenta 4501-998877')).toBeVisible();
    expect(within(section).getByRole('img', { name: 'QR de pago del titular' })).toHaveAttribute(
      'src',
      'https://storage.example/qr.png',
    );
    await user.click(within(section).getByRole('button', { name: 'Copiar datos' }));
    expect(writeText).toHaveBeenCalledWith('BNB · Cuenta 4501-998877');
    expect(await within(section).findByText('Datos de pago copiados.')).toBeVisible();
  });

  it('CA-001-23: sin datos de pago configurados muestra un aviso', async () => {
    mocked.mockResolvedValue({
      ...pendingCharge,
      paymentInfo: { text: null, qrUrl: null, configured: false },
    });
    render(<ChargeDetailView chargeId="abc" />);
    const section = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(section).getByRole('status')).toHaveTextContent('Todavía no hay datos de pago.');
    expect(within(section).queryByRole('img')).not.toBeInTheDocument();
  });

  it('CA-001-23: si la API no entrega datos de pago (null) lo avisa', async () => {
    mocked.mockResolvedValue(paidCharge);
    render(<ChargeDetailView chargeId="abc" />);
    const section = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Este cobro no muestra datos de pago.',
    );
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
  });

  it('RF-002-09: vencimiento en La Paz con cuenta regresiva para un cobro pendiente', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-19T15:59:00.000Z') });
    try {
      render(<ChargeDetailView chargeId="abc" />);
      await act(() => jest.advanceTimersByTimeAsync(400));
      const section = screen.getByRole('region', { name: 'Vencimiento' });
      expect(section).toHaveTextContent('Vence el 21 oct 2026, 23:59');
      expect(within(section).getByRole('timer')).toHaveTextContent('2 días y 12 horas');
    } finally {
      jest.useRealTimers();
    }
  });

  it('RF-002-09: un cobro pagado muestra la fecha de pago y quién lo confirmó', async () => {
    mocked.mockResolvedValue(paidCharge);
    render(<ChargeDetailView chargeId="abc" />);
    const section = await screen.findByRole('region', { name: 'Vencimiento' });
    expect(section).toHaveTextContent('Pagado el 13 oct 2026, 15:40');
    expect(section).toHaveTextContent('Confirmado por Marco Vargas Rojas.');
    expect(within(section).queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByText('Motivo del último rechazo')).not.toBeInTheDocument();
  });

  it('CA-002-32: un retirado con deuda ve el aviso y no el enlace al grupo', async () => {
    mocked.mockResolvedValue({
      ...pendingCharge,
      status: 'atrasado',
      member: { ...pendingCharge.member, isFormerMember: true },
    });
    render(<ChargeDetailView chargeId="abc" />);
    expect(
      await screen.findByText(
        'Ya no perteneces a este grupo; paga tu deuda para limpiar tu historial.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Vencimiento' })).toHaveTextContent(
      'Venció el 21 oct 2026, 23:59',
    );
    expect(screen.queryByRole('link', { name: 'Ver el grupo' })).not.toBeInTheDocument();
  });

  it('la zona de acciones solo se monta si allowedActions trae alguna', async () => {
    const actions = jest.fn(() => <p>Acciones montadas</p>);
    const { unmount } = render(<ChargeDetailView chargeId="abc" actions={actions} />);
    expect(await screen.findByText('Acciones montadas')).toBeVisible();
    expect(actions).toHaveBeenCalledWith(pendingCharge, { onChargeChange: expect.any(Function) });
    unmount();

    mocked.mockResolvedValue(paidCharge);
    render(<ChargeDetailView chargeId="abc" actions={actions} />);
    await heading('Cobro de Octubre 2026');
    expect(screen.queryByRole('region', { name: 'Acciones del cobro' })).not.toBeInTheDocument();
  });

  it('un 401 redirige a /ingresar', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<ChargeDetailView chargeId="abc" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fcobros%2Fabc'));
  });
});
