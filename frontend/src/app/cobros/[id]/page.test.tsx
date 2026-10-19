import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { pendingCharge, reviewCharge } from '@/services/__fixtures__/charges';
import {
  confirmCharge,
  getCharge,
  getReceiptFile,
  rejectCharge,
  uploadReceipt,
  type Charge,
} from '@/services/charges';
import { getMe } from '@/services/auth';
import { ApiError } from '@/services/http';
import ChargePage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cobros/c1',
}));
jest.mock('@/services/auth', () => ({ getMe: jest.fn(() => new Promise(() => {})) }));
jest.mock('@/services/charges', () => ({
  ...jest.requireActual('@/services/charges'),
  getCharge: jest.fn(),
  uploadReceipt: jest.fn(),
  confirmCharge: jest.fn(),
  rejectCharge: jest.fn(),
  getReceiptFile: jest.fn(),
}));

const mockedGet = jest.mocked(getCharge);
const mockedUpload = jest.mocked(uploadReceipt);
const mockedConfirm = jest.mocked(confirmCharge);
const mockedReject = jest.mocked(rejectCharge);
const mockedFile = jest.mocked(getReceiptFile);

async function renderPage(id = 'c1') {
  const ui = await ChargePage({ params: Promise.resolve({ id }) });
  const actor = userEvent.setup();
  render(ui);
  return actor;
}

const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  mockedGet.mockReset();
  mockedUpload.mockReset();
  mockedConfirm.mockReset();
  mockedReject.mockReset();
  mockedFile.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('/cobros/[id] (spec 002 T018): carga', () => {
  it('RF-002-09: la ruta es protegida y pide el cobro del segmento', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    expect(metadata.title).toBe('Cobro');
    expect(isPublicPath('/cobros/c1')).toBe(false);
    await renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cobro de Octubre 2026' }),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith('c1');
  });

  it('RF-002-09: mientras carga muestra el esqueleto', async () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(screen.getByText('Cargando el cobro…')).toBeInTheDocument();
  });

  it('CA-002-23: con 404 dice que no lo encontró sin revelar si existe', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    await renderPage('ajeno');
    expect(await screen.findByText('No encontramos este cobro.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis cobros' })).toHaveAttribute(
      'href',
      '/cobros',
    );
  });

  it('CA-002-13: con 403 explica que el cobro es de otro miembro', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    await renderPage();
    expect(await screen.findByText('Este cobro es de otro miembro.')).toBeInTheDocument();
  });

  it('RF-002-09: con un error de conexión muestra Reintentar y vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = await renderPage();
    expect(await screen.findByText('No pudimos cargar el cobro.')).toBeInTheDocument();
    mockedGet.mockResolvedValue(pendingCharge);
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Cobro de Octubre 2026' })).toBeVisible();
  });
});

describe('/cobros/[id] (spec 002 T018): con datos', () => {
  it('RF-002-09: muestra monto, estado con texto y vencimiento en La Paz', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    await renderPage();
    await screen.findByRole('heading', { name: 'Cobro de Octubre 2026' });
    expect(screen.getByText('Bs 19,80')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toHaveClass('bg-status-pendiente-bg');
    expect(within(section('Estado')).getByText('Vence el 21 oct 2026, 23:59.')).toBeVisible();
    expect(screen.getByText('A nombre de Ana Quispe Mamani')).toBeInTheDocument();
  });

  it('RF-002-09: muestra los datos de pago con QR y Copiar datos copia el texto', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    const actor = await renderPage();
    const payment = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(within(payment).getByRole('img', { name: 'QR de pago del titular' })).toHaveAttribute(
      'src',
      pendingCharge.paymentInfo?.qrUrl,
    );
    expect(
      within(payment).getByText('BNB · Cuenta 4501-998877 · Marco Vargas Rojas'),
    ).toBeVisible();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await actor.click(within(payment).getByRole('button', { name: 'Copiar datos' }));
    expect(writeText).toHaveBeenCalledWith('BNB · Cuenta 4501-998877 · Marco Vargas Rojas');
    expect(within(payment).getByText('Copiamos los datos de pago.')).toBeInTheDocument();
  });

  it('RF-002-09: si el titular no configuró sus datos de pago, muestra el aviso', async () => {
    mockedGet.mockResolvedValue({
      ...pendingCharge,
      paymentInfo: { text: null, qrUrl: null, configured: false },
    });
    await renderPage();
    const payment = await screen.findByRole('region', { name: 'Datos de pago' });
    expect(
      within(payment).getByText(/El titular aún no configuró sus datos de pago/),
    ).toBeVisible();
    expect(within(payment).queryByRole('button', { name: 'Copiar datos' })).not.toBeInTheDocument();
  });

  it('RF-002-09: la cuenta regresiva muestra el tiempo hasta el dueAt de la API y al llegar a 0 vuelve a pedir el cobro', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-22T03:58:30.000Z') });
    mockedGet.mockResolvedValue(pendingCharge);
    const ui = await ChargePage({ params: Promise.resolve({ id: 'c1' }) });
    render(ui);
    await act(async () => {});
    expect(screen.getByRole('timer')).toHaveTextContent('Faltan 1 min.');
    mockedGet.mockResolvedValue({ ...pendingCharge, status: 'atrasado', allowedActions: [] });
    await act(async () => {
      jest.advanceTimersByTime(91_000);
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Venció el 21 oct 2026, 23:59.')).toBeInTheDocument();
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
  });

  it('CA-002-07: el miembro ve el motivo del último rechazo', async () => {
    mockedGet.mockResolvedValue({
      ...pendingCharge,
      lastRejection: {
        reason: 'El monto no llegó a mi cuenta.',
        invalidReceipt: true,
        at: '2026-10-20T13:00:00.000Z',
      },
    });
    await renderPage();
    expect(
      await screen.findByText('El titular rechazó el último comprobante.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Motivo: El monto no llegó a mi cuenta.')).toBeVisible();
    expect(screen.getByText('Lo marcó como comprobante inválido.')).toBeVisible();
  });

  it('CA-002-18: la línea de tiempo muestra evento, autor y fecha en La Paz', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    await renderPage();
    const timeline = await screen.findByRole('list', { name: 'Historial de este cobro' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Cobro generado');
    expect(items[0]).toHaveTextContent('Sistema · 18 oct 2026, 00:00');
    expect(items[1]).toHaveTextContent('Comprobante subido');
    expect(items[1]).toHaveTextContent('Ana Quispe Mamani · 19 oct 2026, 10:42');
  });

  it('RF-002-02: muestra la copia del cobro (precio, tipo de cambio, total y miembros)', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    await renderPage();
    const snapshot = await screen.findByRole('region', { name: 'Cómo se calculó' });
    expect(within(snapshot).getByText('USD 17,07')).toBeInTheDocument();
    expect(within(snapshot).getByText('Bs 118,81')).toBeInTheDocument();
    expect(within(snapshot).getByText('6')).toBeInTheDocument();
  });

  it('RN-002-11: el retirado con deuda ve el aviso en el detalle', async () => {
    const debt: Charge = {
      ...pendingCharge,
      status: 'atrasado',
      member: { ...pendingCharge.member, isFormerMember: true },
    };
    mockedGet.mockResolvedValue(debt);
    await renderPage();
    expect(
      await screen.findByText(
        'Ya no perteneces a este grupo. Paga tu deuda para limpiar tu historial.',
      ),
    ).toBeInTheDocument();
  });

  it('RF-002-12: un cobro pagado en efectivo muestra la fecha y la nota; uno cancelado su motivo', async () => {
    mockedGet.mockResolvedValueOnce({
      ...pendingCharge,
      status: 'pagado',
      paidAt: '2026-10-20T16:00:00.000Z',
      settlement: 'manual',
      manualNote: 'Me pagó en el depa.',
      paymentInfo: null,
      allowedActions: [],
    });
    await renderPage();
    const state = await screen.findByRole('region', { name: 'Estado' });
    expect(within(state).getByText('Pagado el 20 oct 2026, 12:00.')).toBeVisible();
    expect(within(state).getByText('Pago en efectivo registrado por el titular.')).toBeVisible();
    expect(within(state).getByText('Nota: Me pagó en el depa.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Datos de pago' })).not.toBeInTheDocument();
  });

  it('RF-002-13: un cobro cancelado muestra el motivo', async () => {
    mockedGet.mockResolvedValue({
      ...pendingCharge,
      status: 'cancelado',
      cancelReason: 'Se fue del depa.',
      paymentInfo: null,
      allowedActions: [],
    });
    await renderPage();
    const state = await screen.findByRole('region', { name: 'Estado' });
    expect(within(state).getByText('Motivo: Se fue del depa.')).toBeVisible();
  });
});

const MB = 1024 * 1024;

function receiptFile(name = 'comprobante-spotify-oct.jpg', type = 'image/jpeg', size = 2 * MB) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const uploadSection = () => screen.getByRole('region', { name: 'Sube tu comprobante' });
const fileInput = () => screen.getByLabelText('Subir comprobante');

describe('/cobros/[id] (spec 002 T022): subir el comprobante', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: jest.fn(() => 'blob:preview'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true });
  });

  it('CA-002-04 y RNF-002-06: en 3 toques (archivo, referencia, Enviar) el cobro queda en revisión', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    mockedUpload.mockResolvedValue(reviewCharge);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    const file = receiptFile();
    // Toque 1: "Subir comprobante" abre la cámara o la galería.
    await actor.upload(fileInput(), file);
    expect(
      within(uploadSection()).getByRole('img', { name: 'Vista previa del comprobante' }),
    ).toHaveAttribute('src', 'blob:preview');
    expect(within(uploadSection()).getByText('2 MB · JPG, PNG o PDF hasta 5 MB')).toBeVisible();
    expect(within(uploadSection()).getByRole('radio', { name: 'Transferencia' })).toBeChecked();
    // Toque 2: la referencia (el método ya viene elegido).
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), ' TRF-889102 ');
    // Toque 3: Enviar.
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(mockedUpload).toHaveBeenCalledWith('c1', {
      file,
      method: 'transferencia',
      reference: 'TRF-889102',
      version: 1,
    });
    expect(
      await screen.findByText('Enviamos tu comprobante. El titular lo revisará.'),
    ).toBeVisible();
    expect(screen.getByText('En revisión')).toHaveClass('bg-status-en-revision-bg');
    expect(
      within(screen.getByRole('list', { name: 'Historial de este cobro' })).getByText(
        'Comprobante subido',
      ),
    ).toBeVisible();
  });

  it('RF-002-07: el método QR se puede elegir', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    mockedUpload.mockResolvedValue(reviewCharge);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile('pago.pdf', 'application/pdf', 300 * 1024));
    expect(within(uploadSection()).queryByRole('img')).not.toBeInTheDocument();
    expect(within(uploadSection()).getByText('PDF')).toBeVisible();
    await actor.click(screen.getByRole('radio', { name: 'QR' }));
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), 'QR-1');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(mockedUpload).toHaveBeenCalledWith('c1', expect.objectContaining({ method: 'qr' }));
  });

  it('CA-002-05: un archivo de 6 MB o un .exe se avisan en el cliente y no se envían', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    fireEvent.change(fileInput(), {
      target: { files: [receiptFile('grande.jpg', 'image/jpeg', 6 * MB)] },
    });
    expect(screen.getByText('El archivo pesa más de 5 MB. Elige uno más liviano.')).toBeVisible();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(fileInput(), {
      target: { files: [receiptFile('virus.exe', 'application/x-msdownload', 1000)] },
    });
    expect(
      screen.getByText('El comprobante debe ser una imagen JPG o PNG, o un PDF.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar al titular' })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(fileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,application/pdf');
  });

  it('CA-002-26: sin referencia no se envía y se avisa junto al campo', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile());
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), '   ');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(screen.getByText('Escribe la referencia que aparece en tu comprobante.')).toBeVisible();
    expect(screen.getByLabelText('Referencia (obligatoria)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Referencia (obligatoria)')).toHaveAttribute('maxLength', '100');
  });

  it('CA-002-27: 409 REFERENCE_ALREADY_USED se muestra junto a la referencia y conserva el archivo', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    mockedUpload.mockRejectedValue(
      new ApiError(409, 'REFERENCE_ALREADY_USED', 'x', { rule: 'RN-010-14' }),
    );
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile());
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), 'TRF-1');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(await screen.findByText('Esa referencia ya fue usada en este grupo')).toBeVisible();
    expect(screen.getByText('comprobante-spotify-oct.jpg')).toBeVisible();
    expect(screen.getByLabelText('Referencia (obligatoria)')).toHaveValue('TRF-1');
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('RF-002-06: 503 dice que no se guardó el archivo, el cobro no cambia y se puede reintentar', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    mockedUpload.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    mockedUpload.mockResolvedValueOnce(reviewCharge);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile());
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), 'TRF-1');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(
      await screen.findByText('No pudimos guardar el archivo, intenta de nuevo'),
    ).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(await screen.findByText('En revisión')).toBeInTheDocument();
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });

  it('RF-002-06: 409 STALE_STATE recarga el cobro y avisa', async () => {
    mockedGet.mockResolvedValueOnce(pendingCharge);
    mockedGet.mockResolvedValueOnce({ ...reviewCharge, allowedActions: ['uploadReceipt'] });
    mockedUpload.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile());
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), 'TRF-1');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(
      await screen.findByText(
        'El cobro cambió mientras lo veías. Cargamos los datos actualizados.',
      ),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('En revisión')).toBeInTheDocument();
  });

  it('CA-002-11: 409 INVALID_TRANSITION dice que el cobro ya no admite cambios', async () => {
    mockedGet.mockResolvedValueOnce(pendingCharge);
    mockedGet.mockResolvedValueOnce({ ...pendingCharge, status: 'pagado', allowedActions: [] });
    mockedUpload.mockRejectedValue(
      new ApiError(409, 'INVALID_TRANSITION', 'x', { from: 'pagado', action: 'uploadReceipt' }),
    );
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    await actor.upload(fileInput(), receiptFile());
    await actor.type(screen.getByLabelText('Referencia (obligatoria)'), 'TRF-1');
    await actor.click(screen.getByRole('button', { name: 'Enviar al titular' }));
    expect(await screen.findByText('Este cobro ya no admite cambios.')).toBeVisible();
    expect(await screen.findByText('Pagado')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sube tu comprobante' })).not.toBeInTheDocument();
  });

  it('RF-002-08: en revisión con uploadReceipt ofrece reemplazar el comprobante', async () => {
    mockedGet.mockResolvedValue({ ...reviewCharge, allowedActions: ['uploadReceipt'] });
    await renderPage();
    expect(
      await screen.findByRole('region', { name: 'Reemplazar comprobante' }),
    ).toBeInTheDocument();
  });

  it('RF-002-06: sin uploadReceipt en allowedActions no hay subida (el frontend no decide)', async () => {
    mockedGet.mockResolvedValue({ ...pendingCharge, allowedActions: [] });
    await renderPage();
    await screen.findByRole('heading', { name: 'Cobro de Octubre 2026' });
    expect(screen.queryByLabelText('Subir comprobante')).not.toBeInTheDocument();
  });
});

const paidCharge: Charge = {
  ...reviewCharge,
  status: 'pagado',
  paidAt: '2026-10-19T16:00:00.000Z',
  settlement: 'comprobante',
  settledBy: { userId: 'u1', fullName: 'Marco Vargas Rojas' },
  currentReceipt: { ...reviewCharge.currentReceipt!, status: 'confirmado' },
  allowedActions: [],
  version: 3,
};

const review = () => screen.getByRole('region', { name: 'Comprobante de Ana Quispe Mamani' });

async function openReject(actor: ReturnType<typeof userEvent.setup>) {
  await actor.click(await screen.findByRole('button', { name: 'Rechazar' }));
  return screen.getByRole('dialog', { name: 'Rechazar comprobante' });
}

describe('/cobros/[id] (spec 002 T026): acciones del titular', () => {
  it('RF-002-10: el titular ve el comprobante vigente y no los datos de pago', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    await renderPage();
    await screen.findByRole('region', { name: 'Comprobante de Ana Quispe Mamani' });
    expect(review()).toHaveTextContent('MétodoTransferencia');
    expect(review()).toHaveTextContent('ReferenciaTRF-889102');
    expect(review()).toHaveTextContent('Subido19 oct 2026, 10:42');
    expect(review()).toHaveTextContent('ArchivoImagen · 860 KB');
    expect(screen.queryByRole('region', { name: 'Datos de pago' })).not.toBeInTheDocument();
  });

  it('CA-002-06: Confirmar pago manda la versión y muestra el cobro pagado que devuelve la API', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedConfirm.mockResolvedValue(paidCharge);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar pago' }));
    expect(mockedConfirm).toHaveBeenCalledWith('c1', { version: 2 });
    expect(await screen.findByText('Confirmaste el pago. El cobro quedó pagado.')).toBeVisible();
    expect(screen.getByText('Pagado')).toHaveClass('bg-status-pagado-bg');
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('CA-002-07: Rechazar abre el modal y manda el motivo y «comprobante inválido»', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedReject.mockResolvedValue({
      ...pendingCharge,
      lastRejection: {
        reason: 'No llegó el monto.',
        invalidReceipt: true,
        at: '2026-10-19T16:00:00Z',
      },
      version: 3,
    });
    const actor = await renderPage();
    const dialog = await openReject(actor);
    const reason = within(dialog).getByLabelText('Motivo (lo verá Ana Quispe Mamani)');
    expect(reason).toHaveFocus();
    await actor.type(reason, '  No llegó el monto.  ');
    await actor.click(within(dialog).getByLabelText(/Marcar como comprobante inválido/));
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(mockedReject).toHaveBeenCalledWith('c1', {
      reason: 'No llegó el monto.',
      invalidReceipt: true,
      version: 2,
    });
    expect(
      await screen.findByText('Rechazaste el comprobante. El miembro verá el motivo.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Motivo: No llegó el monto.')).toBeVisible();
  });

  it('CA-002-08: un motivo vacío o de menos de 5 caracteres no se envía', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    const actor = await renderPage();
    const dialog = await openReject(actor);
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(
      within(dialog).getByText('El motivo debe tener entre 5 y 200 caracteres.'),
    ).toBeVisible();
    await actor.type(within(dialog).getByRole('textbox'), 'mal ');
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(mockedReject).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('maxLength', '200');
  });

  it('CA-002-08: si la API responde 400 VALIDATION_ERROR, el error va junto al motivo', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedReject.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const actor = await renderPage();
    const dialog = await openReject(actor);
    await actor.type(within(dialog).getByRole('textbox'), 'Motivo válido');
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(
      await within(dialog).findByText('El motivo debe tener entre 5 y 200 caracteres.'),
    ).toBeVisible();
  });

  it('CA-002-19: con 409 STALE_STATE al confirmar recarga el cobro y avisa', async () => {
    mockedGet.mockResolvedValueOnce(reviewCharge).mockResolvedValueOnce(paidCharge);
    mockedConfirm.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar pago' }));
    expect(
      await screen.findByText(
        'El cobro cambió mientras lo veías. Cargamos los datos actualizados.',
      ),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Pagado')).toBeInTheDocument();
  });

  it('CA-002-19: con 409 INVALID_TRANSITION al rechazar cierra el modal, recarga y avisa', async () => {
    mockedGet.mockResolvedValueOnce(reviewCharge).mockResolvedValueOnce(paidCharge);
    mockedReject.mockRejectedValue(
      new ApiError(409, 'INVALID_TRANSITION', 'x', { from: 'pagado', action: 'reject' }),
    );
    const actor = await renderPage();
    const dialog = await openReject(actor);
    await actor.type(within(dialog).getByRole('textbox'), 'Motivo válido');
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar comprobante' }));
    expect(
      await screen.findByText('El cobro ya no está en revisión. Cargamos los datos actualizados.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('CA-002-12: si la API responde 403 al confirmar, avisa que solo puede el titular', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedConfirm.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar pago' }));
    expect(await screen.findByText('Solo el titular del grupo puede hacer esto.')).toBeVisible();
    expect(screen.getByText('En revisión')).toBeInTheDocument();
  });

  it('CA-002-12: los botones siguen allowedActions; el dueño del cobro no ve Confirmar ni Rechazar', async () => {
    mockedGet.mockResolvedValueOnce({ ...reviewCharge, allowedActions: ['reject'] });
    const { unmount } = render(await ChargePage({ params: Promise.resolve({ id: 'c1' }) }));
    expect(await screen.findByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValueOnce({ ...reviewCharge, allowedActions: ['uploadReceipt'] });
    await renderPage();
    expect(await screen.findByRole('button', { name: 'Ver comprobante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('RNF-002-01: Ver comprobante pide la URL firmada y la abre en una pestaña nueva', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedFile.mockResolvedValue({
      url: 'https://storage.vaquita.test/receipts/firmado?token=1',
      expiresAt: '2026-10-19T15:00:00.000Z',
      mime: 'image/jpeg',
    });
    const tab = { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Ver comprobante' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(mockedFile).toHaveBeenCalledWith('c1', 'r1');
    expect(tab.location.href).toBe('https://storage.vaquita.test/receipts/firmado?token=1');
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it('RN-002-06: con 410 FILE_DELETED cierra la pestaña y explica que el archivo ya no está', async () => {
    mockedGet.mockResolvedValue(reviewCharge);
    mockedFile.mockRejectedValue(new ApiError(410, 'FILE_DELETED', 'x'));
    const tab = { opener: null, location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Ver comprobante' }));
    expect(
      await screen.findByText(
        'El archivo ya no está disponible: se eliminó 2 meses después del cierre del grupo.',
      ),
    ).toBeVisible();
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('/cobros/[id] (spec 007 T032): reputación', () => {
  const mockedMe = jest.mocked(getMe);

  beforeEach(() => mockedMe.mockClear());

  it('RF-007-14: en un cobro pagado de ciclo, el dueño ve «Reportar calificación»', async () => {
    mockedMe.mockResolvedValueOnce({
      id: 'u2',
      fullName: 'Ana Quispe Mamani',
      email: 'ana@vaquita.test',
      ciMasked: '*****123',
      phone: '+59176543210',
      role: 'usuario',
      status: 'activo',
      lastLoginAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockedGet.mockResolvedValue({
      ...pendingCharge,
      status: 'pagado',
      paidAt: '2026-10-20T14:00:00.000Z',
      paymentInfo: null,
      allowedActions: [],
    });
    await renderPage();
    const reputation = await screen.findByRole('region', { name: 'Reputación' });
    expect(within(reputation).getByRole('button', { name: 'Reportar calificación' })).toBeVisible();
  });

  it('RF-007-14: en un cobro pendiente no ofrece acciones de reputación', async () => {
    mockedGet.mockResolvedValue(pendingCharge);
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Cobro de Octubre 2026' });
    expect(screen.queryByRole('region', { name: 'Reputación' })).toBeNull();
    expect(mockedMe).not.toHaveBeenCalled();
  });
});
