import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  applicantSelf,
  awaitingPaymentRequest,
  hostAwaitingRequest,
  hostOpenRequest,
  hostReportedRequest,
  hostSelf,
  openDisputeFixture,
  openRequest,
  reportedRequest,
  SERVER_NOW,
  unansweredRequest,
} from '@/services/__fixtures__/join-requests';
import { getMe } from '@/services/auth';
import { ApiError } from '@/services/http';
import {
  cancelJoinRequest,
  confirmJoinRequest,
  extendJoinRequest,
  getJoinRequest,
  getPaymentQr,
  listDisputes,
  listMessages,
  markMessagesRead,
  openDispute,
  registerCashPayment,
  rejectJoinRequest,
  respondDispute,
  sendPaymentData,
  uploadJoinProof,
  type JoinRequest,
} from '@/services/join-requests';
import RequestPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/solicitudes/jr1',
}));
jest.mock('@/services/auth', () => ({ getMe: jest.fn() }));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  getJoinRequest: jest.fn(),
  sendPaymentData: jest.fn(),
  extendJoinRequest: jest.fn(),
  getPaymentQr: jest.fn(),
  uploadJoinProof: jest.fn(),
  confirmJoinRequest: jest.fn(),
  registerCashPayment: jest.fn(),
  rejectJoinRequest: jest.fn(),
  cancelJoinRequest: jest.fn(),
  listMessages: jest.fn(),
  markMessagesRead: jest.fn(),
  sendMessage: jest.fn(),
  getMessageImage: jest.fn(),
  openDispute: jest.fn(),
  respondDispute: jest.fn(),
  listDisputes: jest.fn(),
}));

const mockedMe = jest.mocked(getMe);
const mockedGet = jest.mocked(getJoinRequest);
const mockedSend = jest.mocked(sendPaymentData);
const mockedExtend = jest.mocked(extendJoinRequest);
const mockedQr = jest.mocked(getPaymentQr);
const mockedProof = jest.mocked(uploadJoinProof);
const mockedConfirm = jest.mocked(confirmJoinRequest);
const mockedCash = jest.mocked(registerCashPayment);
const mockedReject = jest.mocked(rejectJoinRequest);
const mockedCancel = jest.mocked(cancelJoinRequest);
const mockedMessages = jest.mocked(listMessages);
const mockedRead = jest.mocked(markMessagesRead);
const mockedOpenDispute = jest.mocked(openDispute);
const mockedRespond = jest.mocked(respondDispute);
const mockedDisputes = jest.mocked(listDisputes);

const QR_LINK = {
  url: 'https://storage.vaquita.test/jr1/qr?token=abc',
  expiresAt: '2026-10-18T18:51:00.000Z',
  mime: 'image/png',
};

async function renderPage(options: { fakeTimers?: boolean } = {}) {
  const ui = await RequestPage({ params: Promise.resolve({ id: 'jr1' }) });
  const actor = userEvent.setup(
    options.fakeTimers ? { advanceTimers: jest.advanceTimersByTime } : {},
  );
  render(ui);
  return actor;
}

function as(viewer: 'solicitante' | 'titular', request: JoinRequest) {
  mockedMe.mockResolvedValue(viewer === 'titular' ? hostSelf : applicantSelf);
  mockedGet.mockResolvedValue(request);
}

const actionBar = () => screen.getByRole('group', { name: 'Acciones de la solicitud' });

beforeEach(() => {
  mockedMe.mockReset();
  mockedGet.mockReset();
  mockedSend.mockReset();
  mockedExtend.mockReset();
  mockedQr.mockReset();
  mockedProof.mockReset();
  mockedConfirm.mockReset();
  mockedCash.mockReset();
  mockedReject.mockReset();
  mockedCancel.mockReset();
  mockedQr.mockResolvedValue(QR_LINK);
  mockedMessages.mockReset();
  mockedMessages.mockResolvedValue({ items: [], serverNow: SERVER_NOW });
  mockedRead.mockReset();
  mockedRead.mockResolvedValue(undefined);
  mockedOpenDispute.mockReset();
  mockedRespond.mockReset();
  mockedDisputes.mockReset();
});

afterEach(() => jest.useRealTimers());

describe('/solicitudes/[id] (spec 010 T022): carga', () => {
  it('RF-010-26: la ruta es protegida y pide la solicitud del segmento', async () => {
    as('solicitante', openRequest);
    expect(metadata.title).toBe('Solicitud de ingreso');
    expect(isPublicPath('/solicitudes/jr1')).toBe(false);
    await renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Solicitud a Max de amigos' }),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith('jr1');
  });

  it('RF-010-26: mientras carga muestra el esqueleto', async () => {
    mockedMe.mockResolvedValue(applicantSelf);
    mockedGet.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(screen.getByText('Cargando la solicitud…')).toBeInTheDocument();
  });

  it('CA-010-20: con 404 dice que no la encontró, sin revelar si existe', async () => {
    mockedMe.mockResolvedValue(applicantSelf);
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    await renderPage();
    expect(await screen.findByText('No encontramos esta solicitud.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('CA-010-20: con 403 explica que solo la ven las dos partes', async () => {
    mockedMe.mockResolvedValue(applicantSelf);
    mockedGet.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    await renderPage();
    expect(await screen.findByText('Esta solicitud no es tuya.')).toBeVisible();
  });

  it('RF-010-26: con un error de conexión muestra Reintentar y vuelve a pedir', async () => {
    mockedMe.mockResolvedValue(applicantSelf);
    mockedGet.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = await renderPage();
    expect(await screen.findByText('No pudimos cargar la solicitud.')).toBeVisible();
    mockedGet.mockResolvedValue(openRequest);
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' })).toBeVisible();
  });
});

describe('/solicitudes/[id] (spec 010 T022): cabecera', () => {
  it('RF-010-03: el solicitante ve servicio, titular con calificación, cuota estimada y estado con texto', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(SERVER_NOW));
    as('solicitante', openRequest);
    await renderPage({ fakeTimers: true });
    await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' });
    expect(screen.getByText('Abierta')).toHaveClass('bg-status-en-revision-bg');
    expect(screen.getByText('Max · Estándar')).toBeVisible();
    expect(screen.getByText('Titular: Rodrigo Salazar Paz · ★ 4,5 · Muy bueno')).toBeVisible();
    expect(screen.getByText(/Cuota estimada:/)).toHaveTextContent('Cuota estimada: Bs 21,00');
    expect(screen.getByRole('timer')).toHaveTextContent('Faltan 1 día y 9 h');
    expect(screen.getByText('para que el titular te envíe los datos de pago')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a mis solicitudes' })).toHaveAttribute(
      'href',
      '/solicitudes',
    );
    expect(within(actionBar()).queryByRole('button', { name: 'Enviar datos de pago' })).toBeNull();
    expect(within(actionBar()).getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible();
  });

  it('RNF-010-06: esperando pago muestra mm:ss y la cuenta se corrige con serverNow', async () => {
    jest.useFakeTimers();
    // El celular va 3 minutos adelantado: la cuenta igual dice 12:34.
    jest.setSystemTime(new Date(Date.parse(SERVER_NOW) + 180_000));
    as('solicitante', awaitingPaymentRequest);
    await renderPage({ fakeTimers: true });
    await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' });
    expect(screen.getByRole('timer')).toHaveTextContent('12:34');
    expect(screen.getByText('para pagar y subir tu comprobante')).toBeVisible();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('12:29');
  });

  it('CA-010-09: al llegar a 0 vuelve a pedir la solicitud y muestra el estado del servidor', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(SERVER_NOW));
    const due = {
      ...awaitingPaymentRequest,
      phase: {
        ...awaitingPaymentRequest.phase,
        deadlineAt: new Date(Date.parse(SERVER_NOW) + 2000).toISOString(),
      },
    };
    const expired: JoinRequest = {
      ...awaitingPaymentRequest,
      phase: { status: 'expirada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'plazo_pago',
      allowedActions: [],
    };
    mockedMe.mockResolvedValue(applicantSelf);
    mockedGet.mockResolvedValueOnce(due).mockResolvedValue(expired);
    await renderPage({ fakeTimers: true });
    await screen.findByRole('timer');
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(await screen.findByText('Expirada')).toBeVisible();
    expect(screen.getByText('No se subió el comprobante dentro del plazo.')).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('RF-010-27: la línea de tiempo es colapsable y muestra tipo, autor y fecha en La Paz', async () => {
    as('solicitante', awaitingPaymentRequest);
    const actor = await renderPage();
    await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' });
    await actor.click(screen.getByText('Línea de tiempo (2)'));
    const list = screen.getByRole('list', { name: 'Línea de tiempo de la solicitud' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Solicitud abierta');
    expect(items[0]).toHaveTextContent('Ana Quispe Mamani · 18 oct 2026, 14:20');
    expect(items[1]).toHaveTextContent('Datos de pago enviados');
  });
});

describe('/solicitudes/[id] (spec 010 T022): vista del solicitante con los datos de pago', () => {
  it('CA-010-04: muestra la cuota fijada por la API, el cálculo, el QR firmado y el texto', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    const card = await screen.findByRole('region', { name: 'Paga tu cuota de ingreso' });
    expect(within(card).getByText('Bs 21,00')).toBeVisible();
    expect(within(card).getByText('Bs 84,00 del mes entre 4 miembros, contándote')).toBeVisible();
    expect(
      await within(card).findByRole('img', { name: 'QR de pago del titular' }),
    ).toHaveAttribute('src', QR_LINK.url);
    expect(mockedQr).toHaveBeenCalledWith('jr1');
    expect(within(card).getByText('BNB · Cuenta 4502-117733 · Rodrigo Salazar Paz')).toBeVisible();
    expect(screen.getByText(/Cuota de ingreso fijada:/)).toHaveTextContent('Bs 21,00');
  });

  it('RF-010-11: Copiar monto copia el monto sin prefijo y Copiar datos el texto', async () => {
    as('solicitante', awaitingPaymentRequest);
    const actor = await renderPage();
    // userEvent.setup() instala su propio portapapeles: se reemplaza después.
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const card = await screen.findByRole('region', { name: 'Paga tu cuota de ingreso' });
    await actor.click(within(card).getByRole('button', { name: 'Copiar monto' }));
    expect(writeText).toHaveBeenLastCalledWith('21,00');
    expect(await within(card).findByText('Copiado.')).toBeVisible();
    await actor.click(within(card).getByRole('button', { name: 'Copiar datos' }));
    expect(writeText).toHaveBeenLastCalledWith('BNB · Cuenta 4502-117733 · Rodrigo Salazar Paz');
  });

  it('RF-010-11: sin QR no lo pide; si el QR se borró lo dice', async () => {
    as('solicitante', {
      ...awaitingPaymentRequest,
      paymentInfo: { text: 'Pago en efectivo', qrAvailable: false },
    });
    await renderPage();
    await screen.findByRole('region', { name: 'Paga tu cuota de ingreso' });
    expect(mockedQr).not.toHaveBeenCalled();
  });

  it('RF-010-11: con 410 avisa que el QR ya no está disponible', async () => {
    mockedQr.mockRejectedValue(new ApiError(410, 'FILE_DELETED', 'x'));
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    expect(await screen.findByText('El QR ya no está disponible.')).toBeVisible();
  });
});

describe('/solicitudes/[id] (spec 010 T022): acciones del titular', () => {
  it('RF-010-11: el titular ve la solicitud del solicitante y la acción Enviar datos de pago', async () => {
    as('titular', hostOpenRequest);
    await renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Solicitud de Ana Quispe Mamani' }),
    ).toBeVisible();
    expect(screen.getByText('Ana Quispe Mamani: Nuevo')).toBeVisible();
    expect(screen.getByText('para enviar los datos de pago')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a Max de amigos' })).toHaveAttribute(
      'href',
      '/grupos/g7',
    );
    expect(within(actionBar()).getByRole('button', { name: 'Enviar datos de pago' })).toBeVisible();
    expect(within(actionBar()).queryByRole('button', { name: /Prorrogar/ })).toBeNull();
  });

  it('CA-010-04: enviar los datos del grupo manda solo la versión y muestra la cuota que fija el servidor', async () => {
    as('titular', hostOpenRequest);
    mockedSend.mockResolvedValue(hostAwaitingRequest);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Enviar datos de pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar datos de pago' });
    expect(within(dialog).getByLabelText(/Los datos de pago del grupo/)).toBeChecked();
    expect(within(dialog).getByText(/Cuota estimada:/)).toHaveTextContent('Bs 21,00');
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(mockedSend).toHaveBeenCalledWith('jr1', { version: 1 });
    expect(
      await screen.findByText(
        'Enviaste los datos de pago. La cuota quedó fijada y el cupo reservado.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Esperando pago')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Datos de pago enviados' })).toHaveTextContent(
      'Bs 84,00 del mes entre 4 miembros',
    );
    expect(screen.getByText('para que Ana pague y suba su comprobante')).toBeVisible();
  });

  it('RF-010-11: con otros datos manda el texto y el QR elegido', async () => {
    as('titular', hostOpenRequest);
    mockedSend.mockResolvedValue(hostAwaitingRequest);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Enviar datos de pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar datos de pago' });
    await actor.click(within(dialog).getByLabelText(/Otros datos solo para esta solicitud/));
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(within(dialog).getByText('Escribe los datos de pago o sube un QR.')).toBeVisible();
    expect(mockedSend).not.toHaveBeenCalled();
    await actor.type(within(dialog).getByLabelText(/Datos de pago \(opcional/), 'Tigo Money 7000');
    const qr = new File(['qr'], 'qr.png', { type: 'image/png' });
    fireEvent.change(within(dialog).getByLabelText('Subir QR'), { target: { files: [qr] } });
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(mockedSend).toHaveBeenCalledWith('jr1', { text: 'Tigo Money 7000', qr, version: 1 });
  });

  it('RF-010-12: sin cupo avisa en el modal y la solicitud sigue abierta', async () => {
    as('titular', hostOpenRequest);
    mockedSend.mockRejectedValue(
      new ApiError(422, 'NO_SLOTS_AVAILABLE', 'x', { rule: 'RN-010-02' }),
    );
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Enviar datos de pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar datos de pago' });
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(
      await within(dialog).findByText('No hay un cupo disponible: la solicitud sigue abierta.'),
    ).toBeVisible();
    expect(screen.getByText('Abierta')).toBeInTheDocument();
  });

  it('CA-010-38: si la ventana terminó cierra el modal, avisa y vuelve a pedir la solicitud', async () => {
    as('titular', hostOpenRequest);
    mockedSend.mockRejectedValue(new ApiError(422, 'ENTRY_WINDOW_CLOSED', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Enviar datos de pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar datos de pago' });
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(
      await screen.findByText('La ventana de ingreso terminó: ya no puedes enviar datos de pago.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('RF-010-11: sin datos de pago en el grupo pide elegir otros', async () => {
    as('titular', hostOpenRequest);
    mockedSend.mockRejectedValue(new ApiError(422, 'PAYMENT_INFO_MISSING', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Enviar datos de pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar datos de pago' });
    await actor.click(within(dialog).getByRole('button', { name: 'Enviar datos de pago' }));
    expect(await within(dialog).findByText(/El grupo no tiene datos de pago/)).toBeVisible();
  });

  it('CA-010-42: Prorrogar suma el plazo con la respuesta de la API', async () => {
    as('titular', hostAwaitingRequest);
    mockedExtend.mockResolvedValue({ ...hostAwaitingRequest, extended: true, allowedActions: [] });
    const actor = await renderPage();
    await actor.click(
      await within(
        await screen.findByRole('group', { name: 'Acciones de la solicitud' }),
      ).findByRole('button', { name: 'Prorrogar 15 min' }),
    );
    expect(mockedExtend).toHaveBeenCalledWith('jr1', { version: 2 });
    expect(await screen.findByText('Prorrogaste el plazo de pago 15 minutos.')).toBeVisible();
    expect(screen.getByText('Plazo ya prorrogado.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prorrogar 15 min' })).toBeNull();
  });

  it('CA-010-42: una segunda prórroga se rechaza con un aviso y se recarga la solicitud', async () => {
    as('titular', hostAwaitingRequest);
    mockedExtend.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RF-010-28', code: 'ALREADY_EXTENDED' }),
    );
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Prorrogar 15 min' }));
    expect(
      await screen.findByText('Ya prorrogaste el plazo una vez: no se puede prorrogar de nuevo.'),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('RF-010-11: el titular no ve Copiar monto en los datos que envió', async () => {
    as('titular', hostAwaitingRequest);
    await renderPage();
    const card = await screen.findByRole('region', { name: 'Datos de pago enviados' });
    expect(within(card).queryByRole('button', { name: 'Copiar monto' })).toBeNull();
  });
});

describe('/solicitudes/[id] (spec 010 T026): comprobante del solicitante', () => {
  const proofSection = () => screen.getByRole('region', { name: 'Sube tu comprobante' });
  const fileInput = () => within(proofSection()).getByLabelText('Elegir archivo');
  const chooseFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
  const jpg = (bytes = 2 * 1024 * 1024) =>
    new File([new Uint8Array(bytes)], 'pago.jpg', { type: 'image/jpeg' });

  it('RF-010-13: con uploadProof muestra la subida y el botón de la barra lleva a ella', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    expect(await screen.findByRole('region', { name: 'Sube tu comprobante' })).toBeVisible();
    expect(within(actionBar()).getByRole('link', { name: 'Subir comprobante' })).toHaveAttribute(
      'href',
      '#comprobante',
    );
    expect(within(proofSection()).getByText('JPG, PNG o PDF hasta 5 MB')).toBeVisible();
  });

  it('RF-010-13: sin uploadProof no hay subida', async () => {
    as('solicitante', openRequest);
    await renderPage();
    await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' });
    expect(screen.queryByRole('region', { name: 'Sube tu comprobante' })).toBeNull();
  });

  it('CA-010-07: un JPG de 2 MB con referencia pasa a pago informado con la respuesta de la API', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedProof.mockResolvedValue(reportedRequest);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    const file = jpg();
    chooseFile(file);
    expect(within(proofSection()).getByText('pago.jpg')).toBeVisible();
    expect(within(proofSection()).getByText('2 MB · JPG, PNG o PDF hasta 5 MB')).toBeVisible();
    await actor.click(within(proofSection()).getByLabelText('Transferencia'));
    await actor.type(within(proofSection()).getByLabelText('Referencia (obligatoria)'), ' TRF-1 ');
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(mockedProof).toHaveBeenCalledWith('jr1', {
      file,
      method: 'transferencia',
      reference: 'TRF-1',
      version: 2,
    });
    expect(
      await screen.findByText('Enviamos tu comprobante. El titular lo revisará en su banco.'),
    ).toBeVisible();
    expect(screen.getByText('Pago informado')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Sube tu comprobante' })).toBeNull();
    const summary = screen.getByRole('region', { name: 'Comprobante de ingreso' });
    expect(summary).toHaveTextContent('QR-20261018-77120');
    expect(summary).toHaveTextContent('18 oct 2026, 14:50');
  });

  it('CA-010-08: un archivo de 6 MB o un .exe se avisan en el cliente y no se envían', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    chooseFile(jpg(6 * 1024 * 1024));
    expect(fileInput()).toHaveAccessibleDescription(/pesa más de 5 MB/);
    chooseFile(new File(['MZ'], 'pago.exe', { type: 'application/x-msdownload' }));
    expect(fileInput()).toHaveAccessibleDescription(/JPG o PNG, o un PDF/);
    expect(within(proofSection()).getByText('Ningún archivo elegido')).toBeVisible();
    expect(mockedProof).not.toHaveBeenCalled();
  });

  it('CA-010-08: si el servidor rechaza el tipo real (415) lo avisa junto al archivo', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedProof.mockRejectedValue(new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    chooseFile(jpg(1000));
    await actor.type(within(proofSection()).getByLabelText('Referencia (obligatoria)'), 'A1');
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(await within(proofSection()).findByText(/JPG o PNG, o un PDF/)).toBeVisible();
    expect(screen.getByText('Esperando pago')).toBeVisible();
  });

  it('CA-010-40: sin referencia avisa junto al campo y no llama a la API', async () => {
    as('solicitante', awaitingPaymentRequest);
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    chooseFile(jpg(1000));
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(
      within(proofSection()).getByLabelText('Referencia (obligatoria)'),
    ).toHaveAccessibleDescription(/Escribe la referencia/);
    expect(mockedProof).not.toHaveBeenCalled();
  });

  it('CA-010-41: una referencia ya usada en el grupo se avisa junto al campo', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedProof.mockRejectedValue(new ApiError(409, 'REFERENCE_ALREADY_USED', 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    chooseFile(jpg(1000));
    await actor.type(within(proofSection()).getByLabelText('Referencia (obligatoria)'), 'A1');
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(
      await within(proofSection()).findByText('Esa referencia ya fue usada en este grupo'),
    ).toBeVisible();
    expect(within(proofSection()).getByText('pago.jpg')).toBeVisible();
  });

  it('CA-010-10: fuera de plazo avisa que expiró y vuelve a pedir la solicitud', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedProof.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', {
        rule: 'RN-010-06',
        code: 'PAYMENT_DEADLINE_PASSED',
      }),
    );
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    mockedGet.mockResolvedValue({
      ...awaitingPaymentRequest,
      phase: { status: 'expirada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'plazo_pago',
      allowedActions: [],
    });
    chooseFile(jpg(1000));
    await actor.type(within(proofSection()).getByLabelText('Referencia (obligatoria)'), 'A1');
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(
      await screen.findByText(
        'Se venció el plazo de pago: la solicitud expiró y el chat quedó en solo lectura.',
      ),
    ).toBeVisible();
    expect(await screen.findByText('Expirada')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Sube tu comprobante' })).toBeNull();
  });

  it('RF-010-13: con 503 avisa que no se guardó y conserva los datos para reintentar', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedProof.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: 'Sube tu comprobante' });
    chooseFile(jpg(1000));
    await actor.type(within(proofSection()).getByLabelText('Referencia (obligatoria)'), 'A1');
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(
      await within(proofSection()).findByText('No pudimos guardar el archivo, intenta de nuevo'),
    ).toBeVisible();
    expect(within(proofSection()).getByLabelText('Referencia (obligatoria)')).toHaveValue('A1');
    mockedProof.mockResolvedValue(reportedRequest);
    await actor.click(within(proofSection()).getByRole('button', { name: 'Enviar comprobante' }));
    expect(await screen.findByText('Pago informado')).toBeVisible();
  });
});

describe('/solicitudes/[id] (spec 010 T030): decisiones del titular y cancelación', () => {
  const accepted = (request: JoinRequest, finalReason: string): JoinRequest => ({
    ...request,
    phase: { status: 'aceptada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
    finalReason,
    chargeId: 'c9',
    allowedActions: [],
  });

  it('RF-010-25: muestra el texto fijo de que Vaquita no custodia el dinero', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    expect(
      await screen.findByText(/Vaquita no custodia el dinero ni lo devuelve\. Si pagas y no te/),
    ).toBeVisible();
  });

  it('RF-010-17: con el pago informado el titular ve el comprobante, el monto a revisar y sus acciones', async () => {
    as('titular', hostReportedRequest);
    await renderPage();
    const check = await screen.findByRole('region', { name: 'Antes de confirmar' });
    expect(check).toHaveTextContent(
      'Revisa en tu banco que llegaron Bs 21,00 con la referencia QR-20261018-77120',
    );
    expect(screen.getByText(/Vaquita no custodia el dinero: confirma solo/)).toBeVisible();
    expect(screen.getByText('para confirmar o rechazar')).toBeVisible();
    const bar = actionBar();
    expect(within(bar).getByRole('button', { name: 'Confirmar ingreso' })).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Rechazar' })).toBeVisible();
    expect(within(bar).queryByRole('button', { name: 'Pago en efectivo' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Cancelar solicitud' })).toBeNull();
  });

  it('CA-010-11: Confirmar ingreso deja la solicitud aceptada con la respuesta de la API', async () => {
    as('titular', hostReportedRequest);
    mockedConfirm.mockResolvedValue(accepted(hostReportedRequest, 'confirmada'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar ingreso' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar ingreso' });
    await actor.click(within(dialog).getByRole('button', { name: 'Confirmar ingreso' }));
    expect(mockedConfirm).toHaveBeenCalledWith('jr1', { version: 3 });
    expect(
      await screen.findByText(
        'Confirmaste el ingreso. Ana Quispe Mamani ya es miembro y su pago quedó como su cobro del mes.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Aceptada')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver el cobro de ingreso' })).toHaveAttribute(
      'href',
      '/cobros/c9',
    );
    expect(screen.queryByRole('group', { name: 'Acciones de la solicitud' })).toBeNull();
  });

  it('CA-010-15: si al confirmar ya expiró por falta de respuesta, avisa y recarga', async () => {
    as('titular', hostReportedRequest);
    mockedConfirm.mockRejectedValue(new ApiError(409, 'INVALID_TRANSITION', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar ingreso' }));
    await actor.click(
      within(screen.getByRole('dialog', { name: 'Confirmar ingreso' })).getByRole('button', {
        name: 'Confirmar ingreso',
      }),
    );
    expect(
      await screen.findByText(
        'La solicitud ya no admite esta acción. Cargamos los datos actualizados.',
      ),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('CA-010-16: Pago en efectivo pide confirmar y acepta con la respuesta de la API', async () => {
    as('titular', hostAwaitingRequest);
    mockedCash.mockResolvedValue(accepted(hostAwaitingRequest, 'efectivo'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Pago en efectivo' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar pago en efectivo' });
    expect(dialog).toHaveTextContent('Acepta a Ana Quispe Mamani sin comprobante');
    await actor.click(within(dialog).getByRole('button', { name: 'Registrar pago en efectivo' }));
    expect(mockedCash).toHaveBeenCalledWith('jr1', { version: 2 });
    expect(
      await screen.findByText('Registraste el pago en efectivo. Ana Quispe Mamani ya es miembro.'),
    ).toBeVisible();
    expect(screen.getByText('El titular registró un pago en efectivo.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CA-010-17: rechazar sin motivo válido avisa junto al campo y no llama a la API', async () => {
    as('titular', hostReportedRequest);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = screen.getByRole('dialog', { name: 'Rechazar solicitud' });
    await actor.type(within(dialog).getByLabelText(/Motivo/), 'no');
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));
    expect(within(dialog).getByLabelText(/Motivo/)).toHaveAccessibleDescription(
      /El motivo debe tener entre 5 y 200 caracteres\./,
    );
    expect(mockedReject).not.toHaveBeenCalled();
  });

  it('CA-010-17: rechazar con motivo y comprobante falso deja la solicitud rechazada', async () => {
    as('titular', hostReportedRequest);
    mockedReject.mockResolvedValue({
      ...hostReportedRequest,
      phase: { status: 'rechazada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'rechazo_titular',
      rejectReason: 'No me llegó el dinero',
      rejectedAsFalse: true,
      allowedActions: [],
    });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = screen.getByRole('dialog', { name: 'Rechazar solicitud' });
    await actor.type(within(dialog).getByLabelText(/Motivo/), ' No me llegó el dinero ');
    await actor.click(within(dialog).getByLabelText(/El comprobante me parece falso/));
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));
    expect(mockedReject).toHaveBeenCalledWith('jr1', {
      reason: 'No me llegó el dinero',
      markProofAsFalse: true,
      version: 3,
    });
    expect(
      await screen.findByText('Rechazaste la solicitud. Ana Quispe Mamani verá el motivo.'),
    ).toBeVisible();
    expect(screen.getByText('Rechazada')).toBeVisible();
    expect(screen.getByText('Motivo: No me llegó el dinero')).toBeVisible();
    expect(screen.getByText('Marcó el comprobante como falso.')).toBeVisible();
  });

  it('CA-010-17: sin pago informado el modal no ofrece marcar el comprobante como falso', async () => {
    as('titular', hostOpenRequest);
    mockedReject.mockResolvedValue({ ...hostOpenRequest, allowedActions: [] });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = screen.getByRole('dialog', { name: 'Rechazar solicitud' });
    expect(within(dialog).queryByLabelText(/El comprobante me parece falso/)).toBeNull();
    await actor.type(within(dialog).getByLabelText(/Motivo/), 'Ya no hay cupo');
    await actor.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));
    expect(mockedReject).toHaveBeenCalledWith('jr1', { reason: 'Ya no hay cupo', version: 1 });
  });

  it('CA-010-17: el solicitante ve el motivo del rechazo', async () => {
    as('solicitante', {
      ...reportedRequest,
      phase: { status: 'rechazada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'rechazo_titular',
      rejectReason: 'El monto no coincide',
      allowedActions: [],
    });
    await renderPage();
    expect(await screen.findByText('El titular rechazó la solicitud.')).toBeVisible();
    expect(screen.getByText('Motivo: El monto no coincide')).toBeVisible();
  });

  it('CA-010-18: el solicitante cancela con confirmación y la solicitud queda cancelada', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedCancel.mockResolvedValue({
      ...awaitingPaymentRequest,
      phase: { status: 'cancelada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'cancelada_solicitante',
      allowedActions: [],
    });
    const actor = await renderPage();
    await actor.click(
      await within(
        await screen.findByRole('group', { name: 'Acciones de la solicitud' }),
      ).findByRole('button', { name: 'Cancelar solicitud' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cancelar solicitud' });
    await actor.click(within(dialog).getByRole('button', { name: 'Cancelar solicitud' }));
    expect(mockedCancel).toHaveBeenCalledWith('jr1', { version: 2 });
    expect(await screen.findByText('Cancelaste la solicitud. El cupo quedó libre.')).toBeVisible();
    expect(screen.getByText('Cancelada')).toBeVisible();
  });

  it('CA-010-18: con el pago informado el solicitante no ve Cancelar (lo decide allowedActions)', async () => {
    as('solicitante', reportedRequest);
    await renderPage();
    await screen.findByRole('region', { name: 'Comprobante de ingreso' });
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).toBeNull();
  });

  it('CA-010-18: si el servidor ya no permite cancelar, avisa y recarga', async () => {
    as('solicitante', awaitingPaymentRequest);
    mockedCancel.mockRejectedValue(new ApiError(409, 'INVALID_TRANSITION', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Cancelar solicitud' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancelar solicitud' });
    await actor.click(within(dialog).getByRole('button', { name: 'Cancelar solicitud' }));
    expect(await screen.findByText(/La solicitud ya no admite esta acción/)).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

describe('/solicitudes/[id] (spec 010 T034): chat en el detalle', () => {
  it('RF-010-05: el solicitante ve el chat con el titular, solo para los dos', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    const chat = await screen.findByRole('region', { name: 'Chat con Rodrigo' });
    expect(within(chat).getByText(/Solo lo ven ustedes dos/)).toBeVisible();
    expect(within(chat).getByRole('textbox', { name: 'Mensaje para Rodrigo' })).toBeVisible();
    expect(mockedMessages).toHaveBeenCalledWith('jr1', { limit: 100 });
  });

  it('CA-010-24: en un estado final el chat queda en solo lectura', async () => {
    as('titular', { ...hostReportedRequest, allowedActions: [] });
    await renderPage();
    const chat = await screen.findByRole('region', { name: 'Chat con Ana' });
    expect(
      within(chat).getByText('La solicitud terminó: el chat quedó en solo lectura.'),
    ).toBeVisible();
    expect(within(chat).queryByRole('textbox')).toBeNull();
  });
});

describe('/solicitudes/[id] (spec 010 T039): reclamos', () => {
  const disputesRegion = () => screen.getByRole('region', { name: /Abrir un reclamo/ });
  const withDispute = (
    request: JoinRequest,
    ref: Partial<JoinRequest['disputes'][number]> = {},
  ): JoinRequest => ({
    ...request,
    canOpenDispute: null,
    disputes: [
      {
        id: 'd1',
        kind: 'pago_sin_ingreso',
        status: 'abierto',
        openedByMe: true,
        canRespond: false,
        ...ref,
      },
    ],
  });

  it('RF-010-21: sin canOpenDispute ni reclamos no muestra nada de reclamos', async () => {
    as('solicitante', awaitingPaymentRequest);
    await renderPage();
    await screen.findByRole('heading', { name: 'Solicitud a Max de amigos' });
    expect(screen.queryByRole('button', { name: 'Abrir reclamo' })).toBeNull();
    expect(mockedDisputes).not.toHaveBeenCalled();
  });

  it('RF-010-25: con canOpenDispute muestra el plazo y el aviso de que Vaquita no devuelve dinero', async () => {
    as('solicitante', unansweredRequest);
    const actor = await renderPage();
    expect(await screen.findByText('El titular no respondió a tiempo.')).toBeVisible();
    expect(disputesRegion()).toHaveTextContent('Abrir un reclamo: pago sin ingreso');
    expect(disputesRegion()).toHaveTextContent('Puedes abrirlo hasta el 25 oct 2026, 20:00.');
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    expect(
      within(disputesRegion()).getByText(/Vaquita no puede devolverte el dinero/),
    ).toBeVisible();
    expect(within(disputesRegion()).getAllByRole('listitem')).toHaveLength(3);
  });

  it('CA-010-27: el solicitante abre el reclamo con descripción y evidencia, y se recarga la solicitud', async () => {
    as('solicitante', unansweredRequest);
    mockedOpenDispute.mockResolvedValue(openDisputeFixture);
    const actor = await renderPage();
    await screen.findByRole('region', { name: /Abrir un reclamo/ });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    const description = within(disputesRegion()).getByLabelText(/Cuenta qué pasó/);
    await actor.type(description, '  Pagué Bs 21,00 y no me agregó al grupo.  ');
    const evidence = new File(['png'], 'banco.png', { type: 'image/png' });
    fireEvent.change(within(disputesRegion()).getByLabelText('Adjuntar imagen'), {
      target: { files: [evidence] },
    });
    expect(within(disputesRegion()).getByText('banco.png')).toBeVisible();
    mockedGet.mockResolvedValue(withDispute(unansweredRequest));
    mockedDisputes.mockResolvedValue({ items: [openDisputeFixture] });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    expect(mockedOpenDispute).toHaveBeenCalledWith('jr1', {
      description: 'Pagué Bs 21,00 y no me agregó al grupo.',
      evidence,
    });
    expect(
      await screen.findByText('Abriste el reclamo. Un administrador revisará la evidencia.'),
    ).toBeVisible();
    const card = await screen.findByRole('article', { name: 'Reclamo: Pago sin ingreso' });
    expect(within(card).getByText('Abierto')).toBeVisible();
    expect(card).toHaveTextContent(
      'Abierto por Ana Quispe Mamani el 18 oct 2026 · con imagen de evidencia',
    );
    expect(card).toHaveTextContent('Un administrador revisará la evidencia.');
    expect(screen.queryByRole('region', { name: /Abrir un reclamo/ })).toBeNull();
  });

  it('CA-010-28: una descripción de menos de 10 caracteres no se envía', async () => {
    as('solicitante', unansweredRequest);
    const actor = await renderPage();
    await screen.findByRole('region', { name: /Abrir un reclamo/ });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    await actor.type(within(disputesRegion()).getByLabelText(/Cuenta qué pasó/), 'corto');
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    expect(within(disputesRegion()).getByLabelText(/Cuenta qué pasó/)).toHaveAccessibleDescription(
      /Cuenta qué pasó en 10 a 500 caracteres\./,
    );
    expect(mockedOpenDispute).not.toHaveBeenCalled();
  });

  it.each([
    ['DISPUTE_WINDOW_CLOSED', 'Pasaron los 7 días para abrir un reclamo.'],
    ['DISPUTE_ALREADY_OPEN', 'Ya abriste un reclamo sobre esta solicitud.'],
    ['DISPUTE_NOT_ALLOWED', 'Esta solicitud ya no admite un reclamo tuyo.'],
  ])('CA-010-28: %s se avisa y se recarga la solicitud', async (code, message) => {
    as('solicitante', unansweredRequest);
    mockedOpenDispute.mockRejectedValue(new ApiError(422, code, 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: /Abrir un reclamo/ });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    await actor.type(
      within(disputesRegion()).getByLabelText(/Cuenta qué pasó/),
      'Pagué y no me agregó.',
    );
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('CA-010-46: una evidencia de más de 5 MB o un PDF se avisan y no se adjuntan', async () => {
    as('solicitante', unansweredRequest);
    const actor = await renderPage();
    await screen.findByRole('region', { name: /Abrir un reclamo/ });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    const input = within(disputesRegion()).getByLabelText('Adjuntar imagen');
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(6 * 1024 * 1024)], 'a.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(input).toHaveAccessibleDescription('La imagen pesa más de 5 MB. Elige una más liviana.');
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] },
    });
    expect(input).toHaveAccessibleDescription('La evidencia debe ser una imagen JPG o PNG.');
    expect(within(disputesRegion()).getByText(/Evidencia \(opcional\)/)).toBeVisible();
  });

  it('CA-010-46: si el servidor rechaza la evidencia (413) lo avisa junto a la imagen', async () => {
    as('solicitante', unansweredRequest);
    mockedOpenDispute.mockRejectedValue(new ApiError(413, 'FILE_TOO_LARGE', 'x'));
    const actor = await renderPage();
    await screen.findByRole('region', { name: /Abrir un reclamo/ });
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    await actor.type(
      within(disputesRegion()).getByLabelText(/Cuenta qué pasó/),
      'Pagué y no me agregó.',
    );
    await actor.click(within(disputesRegion()).getByRole('button', { name: 'Abrir reclamo' }));
    expect(
      await within(disputesRegion()).findByText(
        'La imagen pesa más de 5 MB. Elige una más liviana.',
      ),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('RF-010-22: la otra parte deja una respuesta y se recarga el reclamo', async () => {
    as('titular', withDispute(hostReportedRequest, { openedByMe: false, canRespond: true }));
    mockedDisputes.mockResolvedValue({ items: [openDisputeFixture] });
    mockedRespond.mockResolvedValue({
      ...openDisputeFixture,
      response: {
        text: 'Nunca me llegó el dinero.',
        evidenceAvailable: false,
        respondedAt: '2026-10-18T21:00:00.000Z',
      },
    });
    const actor = await renderPage();
    const card = await screen.findByRole('article', { name: 'Reclamo: Pago sin ingreso' });
    await actor.type(within(card).getByLabelText(/Tu respuesta/), 'Nunca me llegó el dinero.');
    mockedGet.mockResolvedValue(
      withDispute(hostReportedRequest, { openedByMe: false, canRespond: false }),
    );
    mockedDisputes.mockResolvedValue({
      items: [
        {
          ...openDisputeFixture,
          response: {
            text: 'Nunca me llegó el dinero.',
            evidenceAvailable: false,
            respondedAt: '2026-10-18T21:00:00.000Z',
          },
        },
      ],
    });
    await actor.click(within(card).getByRole('button', { name: 'Enviar respuesta' }));
    expect(mockedRespond).toHaveBeenCalledWith('jr1', 'd1', { text: 'Nunca me llegó el dinero.' });
    expect(await screen.findByText('Enviaste tu respuesta al reclamo.')).toBeVisible();
    const updated = await screen.findByText('Respuesta · 18 oct 2026');
    expect(updated).toBeVisible();
    expect(screen.queryByLabelText(/Tu respuesta/)).toBeNull();
  });

  it('RF-010-22: quien abrió el reclamo no ve el formulario de respuesta', async () => {
    as('solicitante', withDispute(unansweredRequest));
    mockedDisputes.mockResolvedValue({ items: [openDisputeFixture] });
    await renderPage();
    await screen.findByRole('article', { name: 'Reclamo: Pago sin ingreso' });
    expect(screen.queryByLabelText(/Tu respuesta/)).toBeNull();
  });

  it('RF-010-24: ambas partes ven la decisión del administrador con su motivo', async () => {
    as('solicitante', withDispute(unansweredRequest, { status: 'resuelto' }));
    mockedDisputes.mockResolvedValue({
      items: [
        {
          ...openDisputeFixture,
          status: 'resuelto',
          resolution: {
            result: 'estafa_confirmada',
            reason: 'El banco confirma el pago y el titular no respondió.',
            resolvedAt: '2026-10-20T15:00:00.000Z',
          },
        },
      ],
    });
    await renderPage();
    const card = await screen.findByRole('article', { name: 'Reclamo: Pago sin ingreso' });
    expect(within(card).getByText('Resuelto')).toBeVisible();
    expect(within(card).getByText('Decisión: Estafa confirmada')).toBeVisible();
    expect(card).toHaveTextContent('Motivo: El banco confirma el pago y el titular no respondió.');
    expect(card).toHaveTextContent('20 oct 2026, 11:00');
  });

  it('RF-010-24: si fallan los reclamos muestra Reintentar', async () => {
    as('solicitante', withDispute(unansweredRequest));
    mockedDisputes.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = await renderPage();
    expect(await screen.findByText('No pudimos cargar los reclamos.')).toBeVisible();
    mockedDisputes.mockResolvedValue({ items: [openDisputeFixture] });
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('article', { name: 'Reclamo: Pago sin ingreso' })).toBeVisible();
  });

  it('CA-010-43: el titular que marcó el comprobante como falso puede abrir su reclamo', async () => {
    as('titular', {
      ...hostReportedRequest,
      phase: { status: 'rechazada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
      finalReason: 'rechazo_titular',
      rejectReason: 'El comprobante está editado',
      rejectedAsFalse: true,
      canOpenDispute: { kind: 'comprobante_falso', closesAt: '2026-10-26T00:00:00.000Z' },
      allowedActions: ['openDispute'],
    });
    await renderPage();
    expect(
      await screen.findByRole('region', { name: 'Abrir un reclamo: comprobante falso' }),
    ).toBeVisible();
  });
});

describe('/solicitudes/[id] (spec 008 T019): solicitudes desde una publicación', () => {
  it('RF-008-10: una solicitud de una publicación lleva la marca «Desde publicación»', async () => {
    as('titular', { ...hostReportedRequest, source: 'publicacion' });
    await renderPage();
    expect(await screen.findByText('Desde publicación')).toBeVisible();
  });

  it('RF-008-10: una solicitud por código no lleva la marca', async () => {
    as('titular', hostReportedRequest);
    await renderPage();
    await screen.findByRole('button', { name: 'Confirmar ingreso' });
    expect(screen.queryByText('Desde publicación')).toBeNull();
  });

  it('RN-008-03: el modal de confirmar muestra la cuota nueva de todos antes de aceptar', async () => {
    as('titular', { ...hostReportedRequest, source: 'publicacion' });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Confirmar ingreso' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar ingreso' });
    expect(dialog).toHaveTextContent(
      'Aceptar a alguien cambia la cuota de todos desde el siguiente cobro. Con Ana Quispe Mamani, el grupo tendrá 4 miembros contando al titular y la cuota de cada uno será de unos Bs 21,00 (estimada).',
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
    await actor.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('RN-008-03: el pago en efectivo también avisa el cambio de cuota', async () => {
    as('titular', hostAwaitingRequest);
    const actor = await renderPage();
    await actor.click(await screen.findByRole('button', { name: 'Pago en efectivo' }));
    expect(screen.getByRole('dialog', { name: 'Registrar pago en efectivo' })).toHaveTextContent(
      'Aceptar a alguien cambia la cuota de todos desde el siguiente cobro.',
    );
  });
});
