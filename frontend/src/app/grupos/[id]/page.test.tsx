import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { reviewCharge } from '@/services/__fixtures__/charges';
import { listGroupCharges } from '@/services/charges';
import { getGroup, updateGroup, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import GroupPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/g2',
}));
jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  updateGroup: jest.fn(),
  regenerateInviteCode: jest.fn(),
}));

jest.mock('@/services/charges', () => ({
  ...jest.requireActual('@/services/charges'),
  listGroupCharges: jest.fn(),
}));

const mockedGet = jest.mocked(getGroup);
const mockedGroupCharges = jest.mocked(listGroupCharges);
const mockedUpdate = jest.mocked(updateGroup);

// Datos simulados del contrato 001 (GroupDetail visto por un miembro).
const memberView: GroupDetail = {
  id: 'g2',
  name: 'Spotify depa',
  status: 'activo',
  frozenReason: null,
  createdAt: '2026-09-18T14:00:00.000Z',
  service: {
    name: 'Spotify',
    planName: 'Familiar',
    logoUrl: null,
    brandColor: '#1DB954',
    isCustom: false,
  },
  billingDay: 18,
  totalSlots: 6,
  priceCents: 1707,
  currency: 'USD',
  exchangeRate: '6.9600',
  breakdown: {
    priceCents: 1707,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 11881,
    memberCount: 6,
    baseShareCents: 1980,
    ownerShareCents: 1981,
    remainderCents: 1,
  },
  myShareCents: 1980,
  myRole: 'miembro',
  entryWindow: {
    isOpen: true,
    opensAt: null,
    closesAt: '2026-10-21T03:59:59.000Z',
    acceptingMembers: true,
  },
  members: [
    {
      userId: 'u1',
      fullName: 'Marco Vargas Rojas',
      role: 'titular',
      phone: '+59171234567',
      joinedAt: '2026-09-18T14:00:00.000Z',
    },
    {
      userId: 'u2',
      fullName: 'Ana Quispe Mamani',
      role: 'miembro',
      phone: '+59176543210',
      joinedAt: '2026-10-18T15:00:00.000Z',
    },
  ],
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877 · Marco Vargas Rojas',
    qrUrl: 'https://storage.vaquita.test/qr/firmado?token=abc',
    configured: true,
  },
  version: 3,
};

async function renderPage(id = 'g2') {
  const ui = await GroupPage({ params: Promise.resolve({ id }) });
  const actor = userEvent.setup();
  render(ui);
  return actor;
}

const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  mockedGet.mockReset();
  mockedUpdate.mockReset();
  mockedGroupCharges.mockReset();
});

describe('/grupos/[id] (spec 001 T020): carga', () => {
  it('RF-001-13: la ruta es protegida y pide el grupo del segmento', async () => {
    mockedGet.mockResolvedValue(memberView);
    expect(metadata.title).toBe('Grupo');
    expect(isPublicPath('/grupos/g2')).toBe(false);
    await renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Spotify depa' })).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith('g2');
  });

  it('RNF-001-04: mientras carga muestra el esqueleto', async () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(screen.getByText('Cargando el grupo…')).toBeInTheDocument();
  });

  it('RNF-001-01: con 404 dice que no lo encontró sin revelar si existe', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    await renderPage('ajeno');
    expect(await screen.findByText('No encontramos este grupo.')).toBeInTheDocument();
    expect(screen.getByText('Puede que no exista o que no seas parte de él.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis suscripciones' })).toBeInTheDocument();
  });

  it('RF-001-13: con otro error muestra Reintentar, que vuelve a pedirlo', async () => {
    mockedGet
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValueOnce(memberView);
    const actor = await renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el grupo.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Spotify depa' })).toBeVisible();
  });
});

describe('/grupos/[id] (spec 001 T020): pestaña Resumen', () => {
  it('RF-001-13: muestra la cuota y el desglose que entrega la API, sin calcular', async () => {
    mockedGet.mockResolvedValue(memberView);
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Spotify depa' });

    expect(screen.getByText('Eres miembro')).toBeInTheDocument();
    expect(
      screen.getByText('Spotify · Familiar · 6 de 6 cupos · Cobro el día 18 de cada mes'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');

    const share = section('Tu cuota');
    expect(share).toHaveTextContent('Bs 19,80 por mes');
    const steps = within(share).getByRole('list', { name: 'Cómo se calcula' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Precio del planUSD 17,07',
      '× Tipo de cambio que definió el titular6,96',
      '= Total del mesBs 118,81',
      '÷ 6 miembros, contando al titularBs 19,80',
    ]);
    expect(share).toHaveTextContent('Los centavos que sobran del redondeo los asume el titular.');
  });

  it('RN-001-10: el titular ve su cuota de referencia y que no tiene cobro propio', async () => {
    mockedGet.mockResolvedValue({
      ...memberView,
      myRole: 'titular',
      myShareCents: 1981,
      inviteCode: 'K7M2Q9PX',
    });
    await renderPage();
    const share = await screen.findByRole('region', { name: 'Tu cuota de referencia' });
    expect(share).toHaveTextContent('Bs 19,81 por mes');
    expect(share).toHaveTextContent(
      'No tienes cobro propio: tu cuota es solo de referencia (Bs 19,81, con los Bs 0,01 que sobran del redondeo).',
    );
    expect(screen.getByText('Eres titular')).toBeInTheDocument();
    expect(section('Tus datos de pago')).toBeInTheDocument();
  });

  it('RF-001-13: con un precio en Bs no muestra el tipo de cambio', async () => {
    mockedGet.mockResolvedValue({
      ...memberView,
      currency: 'BS',
      exchangeRate: null,
      breakdown: { ...memberView.breakdown, currency: 'BS', exchangeRate: null, priceCents: 11881 },
    });
    await renderPage();
    const steps = await screen.findByRole('list', { name: 'Cómo se calcula' });
    expect(steps).toHaveTextContent('Precio del planBs 118,81');
    expect(steps).not.toHaveTextContent('Tipo de cambio');
  });

  it('RF-001-22: la ventana abierta dice hasta cuándo en hora de La Paz', async () => {
    mockedGet.mockResolvedValue(memberView);
    await renderPage();
    const entry = await screen.findByRole('region', { name: 'Ventana de ingreso' });
    expect(entry).toHaveTextContent('Abierta');
    expect(entry).toHaveTextContent('Abierta hasta el 20 oct 2026, 23:59.');
  });

  it('RF-001-22: la ventana cerrada dice cuándo se abre y si el titular pausó la recepción', async () => {
    mockedGet.mockResolvedValue({
      ...memberView,
      entryWindow: {
        isOpen: false,
        opensAt: '2026-11-18T04:00:00.000Z',
        closesAt: null,
        acceptingMembers: false,
      },
    });
    await renderPage();
    const entry = await screen.findByRole('region', { name: 'Ventana de ingreso' });
    expect(entry).toHaveTextContent('Cerrada');
    expect(entry).toHaveTextContent('Se abre el 18 nov 2026.');
    expect(entry).toHaveTextContent('El titular pausó la recepción de nuevos miembros.');
  });

  it('RF-001-20: muestra los datos de pago con el QR firmado', async () => {
    mockedGet.mockResolvedValue(memberView);
    await renderPage();
    const payment = await screen.findByRole('region', { name: 'Datos de pago del titular' });
    expect(payment).toHaveTextContent('BNB · Cuenta 4501-998877 · Marco Vargas Rojas');
    const qr = within(payment).getByRole('img', { name: 'QR de pago del titular' });
    expect(qr).toHaveAttribute('src', memberView.paymentInfo.qrUrl);
    expect(qr).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('RF-001-20: sin datos de pago muestra el aviso de la spec', async () => {
    mockedGet.mockResolvedValue({
      ...memberView,
      paymentInfo: { text: null, qrUrl: null, configured: false },
    });
    await renderPage();
    const payment = await screen.findByRole('region', { name: 'Datos de pago del titular' });
    expect(payment).toHaveTextContent('El titular aún no configuró sus datos de pago.');
  });
});

describe('/grupos/[id] (spec 001 T020): pestaña Miembros', () => {
  it('RF-001-19: lista nombres, rol, celular y desde cuándo, con el teclado', async () => {
    mockedGet.mockResolvedValue(memberView);
    const actor = await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Spotify depa' });

    await actor.click(screen.getByRole('tab', { name: 'Miembros' }));
    const members = section('Miembros (2)');
    const rows = within(members).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Marco Vargas Rojas');
    expect(rows[0]).toHaveTextContent('Titular');
    expect(rows[0]).toHaveTextContent('Desde el 18 sep 2026');
    expect(rows[1]).toHaveTextContent('Ana Quispe Mamani');
    expect(rows[1]).not.toHaveTextContent('Titular');

    await actor.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Tu cuota' })).toBeInTheDocument();
  });

  it('RN-003-03: un miembro sin celular visible no muestra el dato', async () => {
    mockedGet.mockResolvedValue({
      ...memberView,
      members: [{ ...memberView.members[0], phone: null }],
    });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('tab', { name: 'Miembros' }));
    const row = within(section('Miembros (1)')).getByRole('listitem');
    expect(row).not.toHaveTextContent('+591');
  });
});

describe('/grupos/[id] (spec 001 T025): código de invitación del titular', () => {
  const ownerView: GroupDetail = {
    ...memberView,
    myRole: 'titular',
    myShareCents: 1981,
    inviteCode: 'K7M2Q9PX',
  };

  it('RF-001-06: el titular ve el código en Resumen; un miembro no', async () => {
    mockedGet.mockResolvedValueOnce(ownerView);
    const { unmount } = render(await GroupPage({ params: Promise.resolve({ id: 'g2' }) }));
    const code = await screen.findByRole('region', { name: 'Código de invitación' });
    expect(within(code).getByTestId('invite-code')).toHaveTextContent('K7M2Q9PX');
    expect(within(code).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    unmount();

    mockedGet.mockResolvedValueOnce(memberView);
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Spotify depa' });
    expect(screen.queryByRole('region', { name: 'Código de invitación' })).not.toBeInTheDocument();
  });

  it('RF-001-09: pausar actualiza la pantalla con el grupo que devuelve la API', async () => {
    mockedGet.mockResolvedValue(ownerView);
    mockedUpdate.mockResolvedValue({
      ...ownerView,
      entryWindow: { ...ownerView.entryWindow, acceptingMembers: false },
      version: 4,
    });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('region', { name: 'Ventana de ingreso' })).toHaveTextContent(
      'El titular pausó la recepción de nuevos miembros.',
    );
  });

  it('RF-001-09: con 409 STALE_STATE vuelve a pedir el grupo y conserva el aviso', async () => {
    mockedGet
      .mockResolvedValueOnce(ownerView)
      .mockResolvedValueOnce({ ...ownerView, name: 'Spotify del depa', version: 9 });
    mockedUpdate.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('switch'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Spotify del depa' }),
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Otra persona modificó el grupo. Cargamos los datos actualizados.',
    );
  });
});

describe('/grupos/[id] (spec 002 T026): cola «Por revisar» del titular', () => {
  const ownerView: GroupDetail = { ...memberView, myRole: 'titular', inviteCode: 'K7M2Q9PX' };

  it('RF-002-10: el titular ve en Cobros los comprobantes en revisión con enlace al detalle', async () => {
    mockedGet.mockResolvedValue(ownerView);
    mockedGroupCharges.mockResolvedValue({ items: [reviewCharge], nextCursor: null });
    const actor = await renderPage();
    await actor.click(await screen.findByRole('tab', { name: 'Cobros' }));
    const queue = await screen.findByRole('region', { name: 'Por revisar · 1 comprobante' });
    expect(mockedGroupCharges).toHaveBeenCalledWith('g2', { status: 'en_revision', limit: 20 });
    expect(queue).toHaveTextContent('Ana Quispe Mamani · Octubre 2026');
    expect(queue).toHaveTextContent('Subió su pago de Bs 19,80 el 19 oct 2026, 10:42.');
    expect(within(queue).getByText('En revisión')).toBeInTheDocument();
    expect(within(queue).getByRole('link', { name: 'Revisar comprobante' })).toHaveAttribute(
      'href',
      '/cobros/c1',
    );
  });

  it('RF-002-10: sin comprobantes en revisión lo dice; con error ofrece Reintentar', async () => {
    mockedGet.mockResolvedValue(ownerView);
    mockedGroupCharges.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const actor = await renderPage();
    await actor.click(await screen.findByRole('tab', { name: 'Cobros' }));
    expect(
      await screen.findByText('No pudimos cargar los comprobantes por revisar.'),
    ).toBeInTheDocument();
    mockedGroupCharges.mockResolvedValue({ items: [], nextCursor: null });
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay comprobantes por revisar.')).toBeInTheDocument();
  });

  it('RF-002-11: un miembro no ve la cola «Por revisar»', async () => {
    mockedGet.mockResolvedValue(memberView);
    mockedGroupCharges.mockResolvedValue({ items: [], nextCursor: null });
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Spotify depa' });
    expect(screen.queryByText(/Por revisar/)).not.toBeInTheDocument();
    expect(mockedGroupCharges).not.toHaveBeenCalledWith(
      'g2',
      expect.objectContaining({ status: 'en_revision' }),
    );
  });
});
