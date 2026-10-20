import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { openRequest } from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import { openJoinRequest } from '@/services/join-requests';
import JoinPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/unirse',
}));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  openJoinRequest: jest.fn(),
}));

const mockedOpen = jest.mocked(openJoinRequest);

async function renderPage(params: Record<string, string | string[]> = {}) {
  const ui = await JoinPage({ searchParams: Promise.resolve(params) });
  const actor = userEvent.setup();
  render(ui);
  return actor;
}

const codeInput = () => screen.getByLabelText('Código de invitación (8 caracteres)');
const submitButton = () => screen.getByRole('button', { name: 'Abrir solicitud' });

async function submitCode(actor: ReturnType<typeof userEvent.setup>, code = 'K7M2Q9XA') {
  await actor.clear(codeInput());
  await actor.type(codeInput(), code);
  await actor.click(submitButton());
}

beforeEach(() => mockedOpen.mockReset());

describe('/unirse (spec 010 T017): formulario', () => {
  it('RF-010-01: la ruta es protegida y explica que el código abre una solicitud', async () => {
    expect(metadata.title).toBe('Unirme con un código');
    expect(isPublicPath('/unirse')).toBe(false);
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Unirme con un código' })).toBeVisible();
    expect(screen.getByText(/El código no te une directamente/)).toBeVisible();
  });

  it('RF-010-25: muestra cómo funciona y que Vaquita no devuelve dinero', async () => {
    await renderPage();
    const steps = screen.getByRole('region', { name: 'Cómo funciona' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
    expect(
      screen.getByText(/Vaquita no recibe, no guarda ni devuelve dinero, y no puede obligar/),
    ).toBeVisible();
  });

  it('RF-010-01: acepta ?codigo= del enlace y lo normaliza a mayúsculas sin espacios', async () => {
    await renderPage({ codigo: 'k7m2 q9xa' });
    expect(codeInput()).toHaveValue('K7M2Q9XA');
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('RF-010-01: escribe en mayúsculas y corta en 8 caracteres', async () => {
    const actor = await renderPage();
    await actor.type(codeInput(), 'ab12 cd34ef');
    expect(codeInput()).toHaveValue('AB12CD34');
  });

  it('RF-010-01: con menos de 8 caracteres avisa junto al campo y no llama a la API', async () => {
    const actor = await renderPage();
    await submitCode(actor, 'AB12');
    expect(codeInput()).toHaveAccessibleDescription(/El código tiene 8 caracteres\./);
    expect(codeInput()).toHaveFocus();
    expect(mockedOpen).not.toHaveBeenCalled();
  });
});

describe('/unirse (spec 010 T017): resultado', () => {
  it('CA-010-01: abre la solicitud con el código y muestra los datos que entrega la API (RF-010-03)', async () => {
    mockedOpen.mockResolvedValue(openRequest);
    const actor = await renderPage();
    await submitCode(actor, 'k7m2q9xa');
    expect(mockedOpen).toHaveBeenCalledWith('K7M2Q9XA');
    const card = await screen.findByRole('region', { name: 'Max de amigos' });
    expect(within(card).getByText('Max · Estándar · cobro el día 17')).toBeVisible();
    expect(within(card).getByText('Abriste la solicitud.')).toBeVisible();
    expect(within(card).getByText('Bs 21,00')).toBeVisible();
    expect(within(card).getByText('Rodrigo Salazar Paz · ★ 4,5 · Muy bueno')).toBeVisible();
    expect(
      within(card).getByText('Ventana de ingreso abierta hasta el 19 oct 2026, 23:59.'),
    ).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Ir a la solicitud y al chat' })).toHaveAttribute(
      'href',
      '/solicitudes/jr1',
    );
  });

  it('RF-010-03: sin calificación del titular dice "Sin calificación"', async () => {
    mockedOpen.mockResolvedValue({
      ...openRequest,
      host: { ...openRequest.host, stars: null, level: null },
    });
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText('Rodrigo Salazar Paz · Sin calificación')).toBeVisible();
  });

  it('CA-010-37: con la ventana cerrada muestra la fecha de apertura que manda la API', async () => {
    mockedOpen.mockRejectedValue(
      new ApiError(422, 'ENTRY_WINDOW_CLOSED', 'x', {
        rule: 'RF-001-22',
        opensAt: '2026-11-17T04:00:00.000Z',
      }),
    );
    const actor = await renderPage();
    await submitCode(actor);
    expect(
      await screen.findByText('El ingreso a este grupo se abre el 17 nov 2026.'),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Max de amigos' })).not.toBeInTheDocument();
  });

  it('CA-010-37: también entiende BUSINESS_RULE con details.code', async () => {
    mockedOpen.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', {
        rule: 'RF-001-22',
        code: 'ENTRY_WINDOW_CLOSED',
        opensAt: '2026-11-17T04:00:00.000Z',
      }),
    );
    const actor = await renderPage();
    await submitCode(actor);
    expect(
      await screen.findByText('El ingreso a este grupo se abre el 17 nov 2026.'),
    ).toBeVisible();
  });

  it('RF-010-01: un código inválido se avisa junto al campo con el mensaje genérico', async () => {
    mockedOpen.mockRejectedValue(new ApiError(422, 'INVALID_INVITE_CODE', 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText('Código inválido.')).toBeVisible();
    expect(codeInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['ALREADY_MEMBER', 'Ya eres miembro de este grupo.'],
    ['GROUP_NOT_ACCEPTING', 'El titular pausó la recepción de nuevos miembros.'],
    ['NO_SLOTS_AVAILABLE', 'No hay cupos disponibles en este grupo.'],
  ])('CA-010-02: %s se rechaza con un mensaje claro', async (code, message) => {
    mockedOpen.mockRejectedValue(new ApiError(422, code, 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText(message)).toBeVisible();
  });

  it.each([
    ['ACTIVE_REQUEST_EXISTS', 'Ya tienes una solicitud activa en este grupo.'],
    ['TOO_MANY_ACTIVE_REQUESTS', /Ya tienes 5 solicitudes activas/],
  ])('CA-010-03: %s se rechaza con un mensaje claro', async (code, message) => {
    mockedOpen.mockRejectedValue(new ApiError(422, code, 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText(message)).toBeVisible();
  });

  it('CA-010-45: con un cobro abierto en el grupo explica que debe saldarlo', async () => {
    mockedOpen.mockRejectedValue(new ApiError(422, 'OPEN_CHARGES_IN_GROUP', 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText(/Tienes un cobro abierto en este grupo/)).toBeVisible();
  });

  it('CA-010-34: una cuenta restringida no puede abrir solicitudes', async () => {
    mockedOpen.mockRejectedValue(new ApiError(403, 'ACCOUNT_RESTRICTED', 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(
      await screen.findByText('Tu cuenta está restringida y no puede abrir solicitudes.'),
    ).toBeVisible();
  });

  it('RF-010-01: con 429 pide esperar los minutos que indica la API', async () => {
    mockedOpen.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 600 }),
    );
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByText(/Prueba de nuevo en 10 minutos\./)).toBeVisible();
  });

  it('RF-010-01: sin conexión muestra el aviso y deja el código para reintentar', async () => {
    mockedOpen.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const actor = await renderPage();
    await submitCode(actor);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(codeInput()).toHaveValue('K7M2Q9XA');
    mockedOpen.mockResolvedValue(openRequest);
    await actor.click(submitButton());
    expect(await screen.findByRole('region', { name: 'Max de amigos' })).toBeVisible();
  });
});
