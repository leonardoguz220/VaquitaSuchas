import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  awaitingPaymentRequest,
  hostAwaitingRequest,
  SERVER_NOW,
} from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import {
  getMessageImage,
  listMessages,
  markMessagesRead,
  sendMessage,
  type JoinMessage,
} from '@/services/join-requests';
import { RequestChat } from './request-chat';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/solicitudes/jr1',
}));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  markMessagesRead: jest.fn(),
  getMessageImage: jest.fn(),
}));

const mockedList = jest.mocked(listMessages);
const mockedSend = jest.mocked(sendMessage);
const mockedRead = jest.mocked(markMessagesRead);
const mockedImage = jest.mocked(getMessageImage);

const ANA = 'u2';
const RODRIGO = 'u5';

function message(
  seq: number,
  senderId: string,
  body: string | null,
  extra: Partial<JoinMessage> = {},
) {
  return {
    id: `m${seq}`,
    seq,
    senderId,
    body,
    imageAvailable: false,
    createdAt: new Date(Date.parse('2026-10-18T18:21:00.000Z') + seq * 60_000).toISOString(),
    ...extra,
  } satisfies JoinMessage;
}

const page = (items: JoinMessage[]) => ({ items, serverNow: SERVER_NOW });

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const onStale = jest.fn();

function renderChat(
  options: { as?: 'ana' | 'rodrigo'; request?: typeof awaitingPaymentRequest; fake?: boolean } = {},
) {
  const actor = userEvent.setup(options.fake ? { advanceTimers: jest.advanceTimersByTime } : {});
  const meId = options.as === 'rodrigo' ? RODRIGO : ANA;
  const request =
    options.request ?? (meId === RODRIGO ? hostAwaitingRequest : awaitingPaymentRequest);
  render(<RequestChat request={request} meId={meId} onStale={onStale} />);
  return actor;
}

const log = () => screen.getByRole('log', { name: 'Mensajes con Rodrigo' });
const textbox = () => screen.getByRole('textbox', { name: 'Mensaje para Rodrigo' });

beforeEach(() => {
  mockedList.mockReset();
  mockedSend.mockReset();
  mockedRead.mockReset();
  mockedRead.mockResolvedValue(undefined);
  mockedImage.mockReset();
  onStale.mockReset();
  replace.mockReset();
  setVisibility('visible');
});

afterEach(() => {
  jest.useRealTimers();
  setVisibility('visible');
});

describe('RequestChat (spec 010 T034): estados', () => {
  it('RF-010-05: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderChat();
    expect(screen.getByText('Cargando los mensajes…')).toBeInTheDocument();
  });

  it('RF-010-05: sin mensajes invita a saludar', async () => {
    mockedList.mockResolvedValue(page([]));
    renderChat();
    expect(await screen.findByText(/Todavía no hay mensajes\. Saluda/)).toBeVisible();
  });

  it('QA-08: el campo de mensaje tiene ancho mínimo y la fila se parte en vez de aplastarlo', async () => {
    renderChat();
    const textarea = await screen.findByRole('textbox', { name: /Mensaje para/ });
    expect(textarea).toHaveClass('min-w-40', 'flex-1');
    expect(textarea.parentElement).toHaveClass('flex-wrap');
  });

  it('RF-010-05: con un error muestra Reintentar y vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = renderChat();
    expect(await screen.findByText('No pudimos cargar los mensajes.')).toBeVisible();
    mockedList.mockResolvedValue(page([message(1, RODRIGO, 'Hola')]));
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await within(log()).findByText('Hola')).toBeVisible();
  });

  it('RF-010-05: un 401 lleva a /ingresar', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderChat();
    await act(async () => {});
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fsolicitudes%2Fjr1');
  });
});

describe('RequestChat (spec 010 T034): conversación', () => {
  it('CA-010-19: muestra los mensajes en el orden del servidor, alineados por autor', async () => {
    mockedList.mockResolvedValue(
      page([message(2, RODRIGO, 'Te mando los datos'), message(1, ANA, '¿Tienes un cupo?')]),
    );
    renderChat();
    const items = within(await screen.findByRole('log')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('¿Tienes un cupo?');
    expect(items[0]).toHaveTextContent('Tú · 18 oct 2026, 14:22');
    expect(items[0]).toHaveClass('items-end');
    expect(items[1]).toHaveTextContent('Te mando los datos');
    expect(items[1]).toHaveTextContent('Rodrigo · 18 oct 2026, 14:23');
    expect(items[1]).toHaveClass('items-start');
  });

  it('RNF-010-06: el registro de mensajes es enfocable para desplazarse con teclado', async () => {
    mockedList.mockResolvedValue(page([message(1, ANA, '¿Tienes un cupo?')]));
    renderChat();
    const log = await screen.findByRole('log', { name: 'Mensajes con Rodrigo' });
    expect(log).toHaveAttribute('tabindex', '0');
  });

  it('CA-010-22: un mensaje con <script> se muestra como texto plano', async () => {
    const evil = '<script>alert(1)</script><b>hola</b>';
    mockedList.mockResolvedValue(page([message(1, RODRIGO, evil)]));
    const { container } = render(
      <RequestChat request={awaitingPaymentRequest} meId={ANA} onStale={onStale} />,
    );
    expect(await screen.findByText(evil)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('RF-010-09: al abrir marca como leído hasta el último mensaje', async () => {
    mockedList.mockResolvedValue(page([message(1, ANA, 'Hola'), message(4, RODRIGO, 'Hola Ana')]));
    renderChat();
    await screen.findByRole('log');
    expect(mockedRead).toHaveBeenCalledWith('jr1', 4);
  });

  it('CA-010-19: consulta cada 5 s con afterSeq y agrega los mensajes nuevos', async () => {
    jest.useFakeTimers();
    mockedList.mockResolvedValueOnce(page([message(1, ANA, 'Hola')]));
    mockedList.mockResolvedValueOnce(page([message(2, RODRIGO, 'Hola Ana, sí')]));
    mockedList.mockResolvedValue(page([]));
    renderChat({ fake: true });
    await screen.findByRole('log');
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockedList).toHaveBeenLastCalledWith('jr1', { afterSeq: 1, limit: 100 });
    expect(within(log()).getByText('Hola Ana, sí')).toBeVisible();
    expect(mockedRead).toHaveBeenLastCalledWith('jr1', 2);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockedList).toHaveBeenLastCalledWith('jr1', { afterSeq: 2, limit: 100 });
  });

  it('RF-010-09: con la pestaña oculta pausa el sondeo y al volver consulta enseguida', async () => {
    jest.useFakeTimers();
    mockedList.mockResolvedValue(page([message(1, ANA, 'Hola')]));
    renderChat({ fake: true });
    await screen.findByRole('log');
    const callsAfterLoad = mockedList.mock.calls.length;
    act(() => setVisibility('hidden'));
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(mockedList).toHaveBeenCalledTimes(callsAfterLoad);
    await act(async () => setVisibility('visible'));
    expect(mockedList).toHaveBeenCalledTimes(callsAfterLoad + 1);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockedList).toHaveBeenCalledTimes(callsAfterLoad + 2);
  });

  it('CA-010-24: en solo lectura no sondea ni deja escribir', async () => {
    jest.useFakeTimers();
    mockedList.mockResolvedValue(page([message(1, ANA, 'Hola')]));
    renderChat({ fake: true, request: { ...awaitingPaymentRequest, allowedActions: [] } });
    await screen.findByRole('log');
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('La solicitud terminó: el chat quedó en solo lectura.')).toBeVisible();
  });

  it('RF-010-09: si falla un sondeo avisa y sigue intentando', async () => {
    jest.useFakeTimers();
    mockedList.mockResolvedValueOnce(page([message(1, ANA, 'Hola')]));
    mockedList.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    mockedList.mockResolvedValue(page([]));
    renderChat({ fake: true });
    await screen.findByRole('log');
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/No pudimos traer mensajes nuevos/)).toBeVisible();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/No pudimos traer mensajes nuevos/)).toBeNull();
  });
});

describe('RequestChat (spec 010 T034): enviar', () => {
  it('CA-010-19: Enter envía el texto y el mensaje aparece con la respuesta de la API', async () => {
    mockedList.mockResolvedValue(page([message(1, RODRIGO, 'Hola')]));
    mockedSend.mockResolvedValue(message(2, ANA, 'Pago ahora mismo'));
    const actor = renderChat();
    await screen.findByRole('log');
    await actor.type(textbox(), '  Pago ahora mismo {Enter}');
    expect(mockedSend).toHaveBeenCalledWith('jr1', { text: 'Pago ahora mismo' });
    expect(await within(log()).findByText('Pago ahora mismo')).toBeVisible();
    expect(textbox()).toHaveValue('');
  });

  it('RF-010-05: Mayús+Enter hace un salto de línea y no envía', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    await actor.type(textbox(), 'Línea 1{Shift>}{Enter}{/Shift}Línea 2');
    expect(textbox()).toHaveValue('Línea 1\nLínea 2');
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('RF-010-05: un mensaje vacío no se envía', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    await actor.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('CA-010-19: una imagen JPG de 3 MB se previsualiza y se envía con el texto', async () => {
    mockedList.mockResolvedValue(page([]));
    mockedSend.mockResolvedValue(message(1, ANA, 'Mi pago', { imageAvailable: true }));
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    const image = new File([new Uint8Array(3 * 1024 * 1024)], 'captura.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText('Adjuntar imagen'), { target: { files: [image] } });
    expect(screen.getByText('captura.jpg')).toBeVisible();
    await actor.type(textbox(), 'Mi pago');
    await actor.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(mockedSend).toHaveBeenCalledWith('jr1', { text: 'Mi pago', image });
    expect(await screen.findByRole('button', { name: 'Ver imagen' })).toBeVisible();
    expect(screen.queryByText('captura.jpg')).toBeNull();
  });

  it('CA-010-21: un PDF adjunto se avisa en el cliente y no se envía', async () => {
    mockedList.mockResolvedValue(page([]));
    renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    const pdf = new File(['%PDF'], 'pago.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adjuntar imagen'), { target: { files: [pdf] } });
    expect(screen.getByText('En el chat solo se envían imágenes JPG o PNG.')).toBeVisible();
    expect(screen.queryByText('pago.pdf')).toBeNull();
  });

  it('CA-010-21: el campo admite como máximo 1.000 caracteres y el 400 se explica', async () => {
    mockedList.mockResolvedValue(page([]));
    mockedSend.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    expect(textbox()).toHaveAttribute('maxLength', '1000');
    await actor.type(textbox(), 'x{Enter}');
    expect(
      await screen.findByText('El mensaje debe tener entre 1 y 1.000 caracteres.'),
    ).toBeVisible();
  });

  it('CA-010-24: CHAT_READ_ONLY avisa y pide recargar la solicitud', async () => {
    mockedList.mockResolvedValue(page([]));
    mockedSend.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RF-010-07', code: 'CHAT_READ_ONLY' }),
    );
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    await actor.type(textbox(), 'Hola{Enter}');
    expect(onStale).toHaveBeenCalledWith('La solicitud terminó: el chat quedó en solo lectura.');
  });

  it('RF-010-10: con 429 pide esperar los segundos que indica la API y conserva el texto', async () => {
    mockedList.mockResolvedValue(page([]));
    mockedSend.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 40 }));
    const actor = renderChat();
    await screen.findByText(/Todavía no hay mensajes/);
    await actor.type(textbox(), 'Hola{Enter}');
    expect(
      await screen.findByText('Enviaste muchos mensajes seguidos. Espera 40 segundos.'),
    ).toBeVisible();
    expect(textbox()).toHaveValue('Hola');
  });
});

describe('RequestChat (spec 010 T034): imágenes y titular', () => {
  it('RF-010-08: la imagen se pide con URL firmada al abrirla', async () => {
    mockedList.mockResolvedValue(page([message(1, RODRIGO, 'Mi QR', { imageAvailable: true })]));
    mockedImage.mockResolvedValue({
      url: 'https://storage.vaquita.test/m1?token=abc',
      expiresAt: '2026-10-18T18:51:00.000Z',
      mime: 'image/png',
    });
    const actor = renderChat();
    await screen.findByRole('log');
    expect(mockedImage).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Ver imagen' }));
    expect(mockedImage).toHaveBeenCalledWith('jr1', 'm1');
    expect(await screen.findByRole('img', { name: 'Imagen enviada en el chat' })).toHaveAttribute(
      'src',
      'https://storage.vaquita.test/m1?token=abc',
    );
  });

  it('RF-010-08: si la imagen se borró por la retención lo dice', async () => {
    mockedList.mockResolvedValue(page([message(1, RODRIGO, null, { imageAvailable: true })]));
    mockedImage.mockRejectedValue(new ApiError(410, 'FILE_DELETED', 'x'));
    const actor = renderChat();
    await screen.findByRole('log');
    await actor.click(screen.getByRole('button', { name: 'Ver imagen' }));
    expect(await screen.findByText('La imagen ya no está disponible.')).toBeVisible();
  });

  it('RF-010-05: el titular conversa con el solicitante', async () => {
    mockedList.mockResolvedValue(page([message(1, ANA, 'Hola Rodrigo')]));
    renderChat({ as: 'rodrigo' });
    expect(await screen.findByRole('region', { name: 'Chat con Ana' })).toBeVisible();
    const item = within(await screen.findByRole('log', { name: 'Mensajes con Ana' })).getByRole(
      'listitem',
    );
    expect(item).toHaveTextContent('Ana · 18 oct 2026, 14:22');
    expect(screen.getByRole('textbox', { name: 'Mensaje para Ana' })).toBeVisible();
  });
});
