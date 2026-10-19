import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QUOTE_DEBOUNCE_MS } from '@/hooks/use-create-group';
import { isPublicPath } from '@/lib/routes';
import {
  getCatalogService,
  listCatalogServices,
  type CatalogServiceDetail,
  type CatalogService,
} from '@/services/catalog';
import {
  createGroup,
  getHostEligibility,
  quoteGroup,
  updatePaymentInfo,
  type GroupDetail,
  type HostEligibility,
} from '@/services/groups';
import { ApiError } from '@/services/http';
import NewGroupPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/grupos/nuevo',
}));
jest.mock('@/services/catalog', () => ({
  listCatalogServices: jest.fn(),
  getCatalogService: jest.fn(),
}));
jest.mock('@/services/groups', () => ({
  getHostEligibility: jest.fn(),
  quoteGroup: jest.fn(),
  createGroup: jest.fn(),
  updatePaymentInfo: jest.fn(),
}));

const mockedEligibility = jest.mocked(getHostEligibility);
const mockedList = jest.mocked(listCatalogServices);
const mockedDetail = jest.mocked(getCatalogService);
const mockedQuote = jest.mocked(quoteGroup);
const mockedCreate = jest.mocked(createGroup);
const mockedPaymentInfo = jest.mocked(updatePaymentInfo);

// Datos simulados que respetan los contratos 001 y 004.
const eligible: HostEligibility = {
  eligible: true,
  source: 'manual',
  activeGroups: 1,
  maxActiveGroups: 5,
  canCreateMore: true,
  requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
  current: { stars: 4.0, consideredCharges: 3, level: 'Bueno' },
};

const netflix: CatalogService = {
  id: 'svc-1',
  slug: 'netflix',
  name: 'Netflix',
  category: 'video',
  categoryLabel: 'Video',
  logoUrl: null,
  brandColor: '#E50914',
  fromPriceCents: 699,
  fromCurrency: 'USD',
  plansCount: 2,
};

const netflixDetail: CatalogServiceDetail = {
  service: netflix,
  plans: [
    {
      id: 'p1',
      slug: 'netflix-basico',
      name: 'Básico',
      priceCents: 699,
      currency: 'USD',
      maxSlots: 2,
      individualPriceCents: null,
      verifiedOn: '2026-10-01',
    },
    {
      id: 'p2',
      slug: 'netflix-estandar',
      name: 'Estándar',
      priceCents: 1466,
      currency: 'USD',
      maxSlots: 4,
      individualPriceCents: 1466,
      verifiedOn: '2026-10-01',
    },
  ],
};

const quote = {
  totalBsCents: 10203,
  baseShareCents: 2550,
  ownerShareCents: 2553,
  remainderCents: 3,
};

const created = {
  id: 'g-123',
  name: 'Netflix de la familia',
  inviteCode: 'K7M2Q9PX',
} as GroupDetail;

async function advance(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderPage() {
  const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<NewGroupPage />);
  await advance();
  return actor;
}

/** Pasos 1 y 2 con Netflix Estándar y paso al formulario. */
async function chooseNetflixStandard(actor: ReturnType<typeof userEvent.setup>) {
  await actor.click(screen.getByRole('button', { name: /Netflix/ }));
  await advance();
  await actor.click(screen.getByRole('radio', { name: /Estándar/ }));
  await actor.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
}

const summary = () => screen.getByRole('complementary', { name: 'Así queda la cuota' });

beforeEach(() => {
  jest.useFakeTimers();
  replace.mockReset();
  for (const mock of [
    mockedEligibility,
    mockedList,
    mockedDetail,
    mockedQuote,
    mockedCreate,
    mockedPaymentInfo,
  ]) {
    mock.mockReset();
  }
  mockedEligibility.mockResolvedValue(eligible);
  mockedList.mockResolvedValue({ items: [netflix], nextCursor: null });
  mockedDetail.mockResolvedValue(netflixDetail);
  mockedQuote.mockResolvedValue(quote);
  window.history.replaceState(null, '', '/grupos/nuevo');
});

afterEach(() => jest.useRealTimers());

describe('/grupos/nuevo (spec 001 T016): carga y habilitación', () => {
  it('RF-001-01: el título es "Crear suscripción" y la ruta es protegida', async () => {
    expect(metadata.title).toBe('Crear suscripción');
    expect(isPublicPath('/grupos/nuevo')).toBe(false);
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Crear suscripción' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pasos' })).toBeInTheDocument();
  });

  it('RF-001-21: mientras comprueba la habilitación muestra el esqueleto', () => {
    mockedEligibility.mockReturnValue(new Promise(() => {}));
    render(<NewGroupPage />);
    expect(screen.getByText('Cargando…').closest('[role="status"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('RF-001-21: si falla la comprobación muestra el error con Reintentar', async () => {
    mockedEligibility
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce(eligible);
    const actor = await renderPage();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos comprobar si puedes crear suscripciones.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await advance();
    expect(screen.getByRole('button', { name: /Netflix/ })).toBeInTheDocument();
  });

  it('RF-001-21: sin habilitación abre el panel que explica qué falta y no muestra el asistente', async () => {
    mockedEligibility.mockResolvedValue({ ...eligible, eligible: false, source: null });
    await renderPage();

    const panel = screen.getByRole('region', { name: 'Todavía no puedes crear suscripciones' });
    expect(panel).toHaveTextContent(
      'Para ser titular necesitas una calificación de 4,5 estrellas o más con al menos 6 cobros considerados en los últimos 12 meses, o que un administrador te habilite.',
    );
    expect(panel).toHaveTextContent('Hoy tienes 4 estrellas (Bueno) con 3 cobros considerados.');
    expect(within(panel).getByRole('link', { name: 'Volver a mis suscripciones' })).toHaveAttribute(
      'href',
      '/grupos',
    );
    expect(screen.queryByRole('list', { name: 'Pasos' })).not.toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('RF-001-21: sin cobros considerados lo dice en vez de mostrar una calificación', async () => {
    mockedEligibility.mockResolvedValue({
      ...eligible,
      eligible: false,
      source: null,
      current: { stars: null, consideredCharges: 0, level: null },
    });
    await renderPage();
    expect(
      screen.getByText('Todavía no tienes cobros considerados para tu calificación.'),
    ).toBeInTheDocument();
  });

  it('RN-001-14: con 5 grupos activos como titular explica que debe cerrar o transferir uno', async () => {
    mockedEligibility.mockResolvedValue({ ...eligible, activeGroups: 5, canCreateMore: false });
    await renderPage();
    expect(
      screen.getByRole('region', { name: 'Ya tienes el máximo de grupos como titular' }),
    ).toHaveTextContent('Tienes 5 de 5 grupos activos como titular.');
  });
});

describe('/grupos/nuevo (spec 001 T016): pasos 1 y 2', () => {
  it('RF-001-01: "Siguiente" se habilita al elegir un plan del servicio', async () => {
    const actor = await renderPage();
    const next = screen.getByRole('button', { name: 'Siguiente: datos del grupo' });
    expect(next).toBeDisabled();
    expect(
      screen.getByText('Elige un servicio o crea uno personalizado para seguir.'),
    ).toBeVisible();

    await actor.click(screen.getByRole('button', { name: /Netflix/ }));
    await advance();
    expect(mockedDetail).toHaveBeenCalledWith('netflix');
    expect(next).toBeDisabled();
    expect(screen.getByText('Elige un plan para seguir.')).toBeVisible();

    await actor.click(screen.getByRole('radio', { name: /Estándar/ }));
    expect(next).toBeEnabled();
    const steps = screen.getByRole('list', { name: 'Pasos' });
    expect(steps).toHaveTextContent('Hecho: Servicio: Netflix');
    expect(within(steps).getByText('Plan: Estándar').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/grupos');
  });
});

describe('/grupos/nuevo (spec 001 T016): paso 3 y creación', () => {
  it('RF-001-05: propone el precio, la moneda y los cupos del plan, y el foco va al título', async () => {
    const actor = await renderPage();
    await chooseNetflixStandard(actor);

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByLabelText('Nombre del grupo')).toHaveValue('Netflix');
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
    expect(screen.getByLabelText('Precio mensual del plan')).toHaveValue('14,66');
    expect(screen.getByLabelText('Precio mensual del plan')).toHaveAccessibleDescription(
      'Propuesto por el catálogo; puedes cambiarlo.',
    );
    expect(screen.getByLabelText('Cupos (contándote)')).toHaveValue(4);
    expect(screen.getByLabelText('Cupos (contándote)')).toHaveAttribute('max', '4');
    expect(screen.queryByLabelText('Nombre del servicio')).not.toBeInTheDocument();
  });

  it('RF-001-03: pide la cuota a POST /groups/quote 300 ms después y muestra lo que devuelve', async () => {
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    expect(within(summary()).getByText(/Completa el precio/)).toBeInTheDocument();

    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await advance(QUOTE_DEBOUNCE_MS - 1);
    expect(mockedQuote).not.toHaveBeenCalled();
    expect(within(summary()).getByText('Calculando la cuota…')).toBeInTheDocument();

    await advance(1);
    expect(mockedQuote).toHaveBeenCalledTimes(1);
    expect(mockedQuote).toHaveBeenCalledWith({
      priceCents: 1466,
      currency: 'USD',
      exchangeRate: '6.9600',
      memberCount: 4,
    });
    const box = summary();
    expect(box).toHaveTextContent('PrecioUSD 14,66');
    expect(box).toHaveTextContent('Tipo de cambio6,96');
    expect(box).toHaveTextContent('Total en BsBs 102,03');
    expect(box).toHaveTextContent('Cada miembro pagaríaBs 25,50');
    expect(box).toHaveTextContent('Tu parte de referencia: Bs 25,53.');
    expect(box).toHaveTextContent('Tú asumes los Bs 0,03 que sobran del redondeo.');
  });

  it('RF-001-03: con Bs no pide el tipo de cambio y cotiza sin él', async () => {
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    await actor.selectOptions(screen.getByLabelText('Moneda'), 'BS');
    expect(screen.queryByLabelText('Tipo de cambio (Bs por USD)')).not.toBeInTheDocument();
    await advance(QUOTE_DEBOUNCE_MS);
    expect(mockedQuote).toHaveBeenLastCalledWith({
      priceCents: 1466,
      currency: 'BS',
      memberCount: 4,
    });
  });

  it('RF-001-03: si la cotización falla muestra el error con Reintentar', async () => {
    mockedQuote.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await advance(QUOTE_DEBOUNCE_MS);

    const alert = within(summary()).getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos calcular la cuota.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await advance(QUOTE_DEBOUNCE_MS);
    expect(summary()).toHaveTextContent('Cada miembro pagaríaBs 25,50');
  });

  it('RF-001-04: crea con el cuerpo del contrato y muestra el código con Copiar y Compartir', async () => {
    mockedCreate.mockResolvedValue(created);
    const actor = await renderPage();
    await chooseNetflixStandard(actor);

    const name = screen.getByLabelText('Nombre del grupo');
    await actor.clear(name);
    await actor.type(name, 'Netflix de la familia');
    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '1');
    await actor.type(
      screen.getByLabelText('Datos de pago para los miembros (opcional)'),
      'Banco Unión · Caja de ahorro 1000-2345678',
    );
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();

    expect(mockedCreate).toHaveBeenCalledWith({
      catalogPlanSlug: 'netflix-estandar',
      customServiceName: null,
      name: 'Netflix de la familia',
      priceCents: 1466,
      currency: 'USD',
      exchangeRate: '6.9600',
      billingDay: 1,
      totalSlots: 4,
      paymentInfoText: 'Banco Unión · Caja de ahorro 1000-2345678',
    });
    expect(mockedPaymentInfo).not.toHaveBeenCalled();
    expect(screen.getByText('Creaste «Netflix de la familia».')).toBeInTheDocument();
    expect(screen.getByTestId('invite-code')).toHaveTextContent('K7M2Q9PX');
    expect(screen.getByRole('link', { name: 'Ir al grupo' })).toHaveAttribute(
      'href',
      '/grupos/g-123',
    );

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await actor.click(screen.getByRole('button', { name: 'Copiar' }));
    await advance();
    expect(writeText).toHaveBeenCalledWith('K7M2Q9PX');
    expect(screen.getByText('Copiamos el código.')).toBeInTheDocument();

    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    await actor.click(screen.getByRole('button', { name: 'Compartir' }));
    await advance();
    expect(share).toHaveBeenCalledWith({
      title: 'Vaquita',
      text: 'Únete a «Netflix de la familia» en Vaquita con el código K7M2Q9PX: http://localhost/unirse?codigo=K7M2Q9PX',
    });
    Reflect.deleteProperty(navigator, 'share');
  });

  it('RF-001-06: sin hoja de compartir, Compartir copia la invitación con el enlace', async () => {
    mockedCreate.mockResolvedValue(created);
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '15');
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await actor.click(screen.getByRole('button', { name: 'Compartir' }));
    await advance();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost/unirse?codigo=K7M2Q9PX'),
    );
    expect(
      screen.getByText('Copiamos la invitación con el enlace para que la pegues donde quieras.'),
    ).toBeInTheDocument();
  });

  it('RF-001-01: con un servicio personalizado pide el nombre y no manda plan', async () => {
    mockedCreate.mockResolvedValue({ ...created, name: 'Canal Andino' });
    const actor = await renderPage();
    await actor.click(screen.getByRole('button', { name: /Crear uno personalizado/ }));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));

    expect(screen.getByRole('list', { name: 'Pasos' })).toHaveTextContent('Plan: no aplica');
    expect(screen.getByLabelText('Moneda')).toHaveValue('BS');
    await actor.type(screen.getByLabelText('Nombre del servicio'), 'Canal Andino');
    await actor.type(screen.getByLabelText('Nombre del grupo'), 'Canal del depa');
    await actor.type(screen.getByLabelText('Precio mensual del plan'), '60');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '31');
    expect(screen.getByLabelText('Día de cobro')).toHaveAccessibleDescription(
      'En los meses más cortos se cobra el último día del mes.',
    );
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogPlanSlug: null,
        customServiceName: 'Canal Andino',
        priceCents: 6000,
        currency: 'BS',
        exchangeRate: null,
        billingDay: 31,
        totalSlots: 2,
        paymentInfoText: null,
      }),
    );
  });

  it('RF-001-02: con campos inválidos no envía, marca los errores y lleva el foco al primero', async () => {
    const actor = await renderPage();
    await actor.click(screen.getByRole('button', { name: /Crear uno personalizado/ }));
    await actor.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre del servicio')).toHaveFocus();
    expect(screen.getByLabelText('Nombre del servicio')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Precio mensual del plan')).toHaveAccessibleDescription(
      /Escribe el precio con coma decimal/,
    );
    expect(screen.getByLabelText('Día de cobro')).toHaveAccessibleDescription(
      /Elige el día de cobro/,
    );
  });

  it('RF-001-20: el QR muestra vista previa, avisa tipo y tamaño, y se sube después de crear', async () => {
    const createObjectURL = jest.fn(() => 'blob:qr-preview');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    mockedCreate.mockResolvedValue(created);
    mockedPaymentInfo.mockResolvedValue({
      paymentInfo: { text: null, qrUrl: null, configured: true },
    });
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    const input = screen.getByLabelText('Subir QR');

    const pdf = new File(['%PDF'], 'qr.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(screen.getByText('El QR debe ser una imagen JPG o PNG.')).toBeInTheDocument();

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'qr.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(
      screen.getByText('El QR pesa más de 2 MB. Elige una imagen más liviana.'),
    ).toBeInTheDocument();

    const qr = new File(['png'], 'mi-qr.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [qr] } });
    expect(screen.getByRole('img', { name: 'Vista previa del QR de pago' })).toHaveAttribute(
      'src',
      'blob:qr-preview',
    );
    expect(screen.getByText('mi-qr.png')).toBeInTheDocument();
    expect(screen.queryByText(/El QR pesa más/)).not.toBeInTheDocument();

    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '1');
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();
    expect(mockedPaymentInfo).toHaveBeenCalledWith('g-123', { qr });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:qr-preview');
  });

  it('RF-001-20: si falla la subida del QR, el grupo queda creado y se avisa', async () => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
    mockedCreate.mockResolvedValue(created);
    mockedPaymentInfo.mockRejectedValue(new ApiError(413, 'FILE_TOO_LARGE', 'x'));
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    fireEvent.change(screen.getByLabelText('Subir QR'), {
      target: { files: [new File(['png'], 'qr.png', { type: 'image/png' })] },
    });
    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '1');
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();

    expect(screen.getByText(/no pudimos subir el QR/)).toBeInTheDocument();
    expect(screen.getByTestId('invite-code')).toHaveTextContent('K7M2Q9PX');
  });

  it('RF-001-01: un error de conexión al crear muestra Reintentar, que vuelve a enviar', async () => {
    mockedCreate
      .mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'))
      .mockResolvedValueOnce(created);
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    await actor.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await actor.selectOptions(screen.getByLabelText('Día de cobro'), '1');
    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    await advance();

    const alert = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('No pudimos crear la suscripción.'))!;
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await advance();
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('invite-code')).toBeInTheDocument();
  });

  it('RF-001-05: Atrás vuelve a los pasos 1 y 2 y conserva lo escrito si no cambia el plan', async () => {
    const actor = await renderPage();
    await chooseNetflixStandard(actor);
    const price = screen.getByLabelText('Precio mensual del plan');
    await actor.clear(price);
    await actor.type(price, '15,99');

    await actor.click(screen.getByRole('button', { name: 'Atrás' }));
    await advance();
    expect(screen.getByRole('radio', { name: /Estándar/ })).toBeChecked();
    await actor.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    expect(screen.getByLabelText('Precio mensual del plan')).toHaveValue('15,99');

    // Con otro plan vuelve a proponer sus valores.
    await actor.click(screen.getByRole('button', { name: 'Atrás' }));
    await advance();
    await actor.click(screen.getByRole('radio', { name: /Básico/ }));
    await actor.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    expect(screen.getByLabelText('Precio mensual del plan')).toHaveValue('6,99');
    expect(screen.getByLabelText('Cupos (contándote)')).toHaveValue(2);
  });
});
