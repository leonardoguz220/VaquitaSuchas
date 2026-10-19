import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  applicantSelf,
  awaitingPaymentRequest,
  hostAwaitingRequest,
  hostOpenRequest,
  hostSelf,
  openRequest,
  reportedRequest,
  SERVER_NOW,
} from '@/services/__fixtures__/join-requests';
import { getMe } from '@/services/auth';
import { ApiError } from '@/services/http';
import {
  extendJoinRequest,
  getJoinRequest,
  getPaymentQr,
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
}));

const mockedMe = jest.mocked(getMe);
const mockedGet = jest.mocked(getJoinRequest);
const mockedSend = jest.mocked(sendPaymentData);
const mockedExtend = jest.mocked(extendJoinRequest);
const mockedQr = jest.mocked(getPaymentQr);
const mockedProof = jest.mocked(uploadJoinProof);

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
  mockedQr.mockResolvedValue(QR_LINK);
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
    expect(screen.queryByRole('group', { name: 'Acciones de la solicitud' })).toBeNull();
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
