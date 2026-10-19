import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listingView, ownerListing } from '@/services/__fixtures__/listings';
import type { GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import {
  createGroupListing,
  getGroupListing,
  renewGroupListing,
  updateGroupListing,
  withdrawGroupListing,
} from '@/services/listings';
import { GroupListingBadge } from './group-listing-badge';
import { GroupListingTab } from './group-listing-tab';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/grupos/g1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  getGroupListing: jest.fn(),
  createGroupListing: jest.fn(),
  updateGroupListing: jest.fn(),
  renewGroupListing: jest.fn(),
  withdrawGroupListing: jest.fn(),
}));

const mockedGet = jest.mocked(getGroupListing);
const mockedCreate = jest.mocked(createGroupListing);
const mockedUpdate = jest.mocked(updateGroupListing);
const mockedRenew = jest.mocked(renewGroupListing);
const mockedWithdraw = jest.mocked(withdrawGroupListing);

// GroupDetail del contrato 001 visto por la titular (solo los campos que usa la pestaña importan).
const group = {
  id: 'g1',
  name: 'Prime de la familia',
  totalSlots: 5,
  breakdown: { memberCount: 3 },
  myRole: 'titular',
} as unknown as GroupDetail;

function renderTab() {
  const user = userEvent.setup();
  render(<GroupListingTab group={group} />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  for (const mock of [mockedGet, mockedCreate, mockedUpdate, mockedRenew, mockedWithdraw]) {
    mock.mockReset();
  }
  mockedGet.mockResolvedValue(ownerListing());
});

describe('Pestaña Publicar cupos (spec 008 T011): sin publicación', () => {
  beforeEach(() => mockedGet.mockResolvedValue(null));

  it('RN-008-03: muestra siempre el aviso de que aceptar cambia la cuota de todos', async () => {
    renderTab();
    expect(
      screen.getByText('Aceptar a alguien cambia la cuota de todos desde el siguiente cobro.'),
    ).toBeVisible();
    await screen.findByRole('button', { name: 'Publicar cupos' });
  });

  it('RF-008-01: publica cupos, descripción y condiciones recortadas y muestra el estado', async () => {
    mockedCreate.mockResolvedValue(ownerListing());
    const user = renderTab();
    expect(mockedGet).toHaveBeenCalledWith('g1');
    const slots = await screen.findByLabelText('Cupos a publicar');
    expect(screen.getByText(/El grupo tiene 3 de 5 cupos ocupados/)).toBeVisible();
    await user.clear(slots);
    await user.type(slots, '2');
    await user.type(screen.getByLabelText('Descripción (opcional)'), '  Familia puntual.  ');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));
    expect(mockedCreate).toHaveBeenCalledWith('g1', {
      slotsOffered: 2,
      description: 'Familia puntual.',
    });
    expect(await screen.findByText('Publicaste 2 cupos hasta el 17 nov 2026.')).toBeVisible();
    expect(screen.getByText('Publicación activa hasta el 17 nov 2026.')).toBeVisible();
  });

  it('RF-008-01: con 0 cupos no envía y pide al menos 1', async () => {
    const user = renderTab();
    const slots = await screen.findByLabelText('Cupos a publicar');
    await user.clear(slots);
    await user.type(slots, '0');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Ofrece al menos 1 cupo.')).toBeVisible();
    expect(slots).toHaveFocus();
  });

  it('CA-008-02: con el grupo lleno muestra «No hay cupos libres» junto al campo', async () => {
    mockedCreate.mockRejectedValue(new ApiError(422, 'NO_FREE_SLOTS', 'x'));
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Publicar cupos' }));
    expect(await screen.findByText(/No hay cupos libres/)).toBeVisible();
    expect(screen.getByLabelText('Cupos a publicar')).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-008-03: con otra publicación activa avisa y vuelve a pedirla', async () => {
    mockedCreate.mockRejectedValue(new ApiError(409, 'LISTING_ALREADY_ACTIVE', 'x'));
    const user = renderTab();
    const publish = await screen.findByRole('button', { name: 'Publicar cupos' });
    mockedGet.mockResolvedValue(ownerListing());
    await user.click(publish);
    expect(
      await screen.findByText('El grupo ya tiene una publicación activa. Cargamos la actual.'),
    ).toBeVisible();
    expect(await screen.findByText('Publicación activa hasta el 17 nov 2026.')).toBeVisible();
  });

  it('CA-008-22: una cuenta restringida ve por qué no puede publicar', async () => {
    mockedCreate.mockRejectedValue(new ApiError(403, 'ACCOUNT_RESTRICTED', 'x'));
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Publicar cupos' }));
    expect(
      await screen.findByText('Tu cuenta está restringida: no puedes publicar cupos.'),
    ).toBeVisible();
  });

  it('RF-008-01: los textos no pasan de 300 caracteres', async () => {
    renderTab();
    expect(await screen.findByLabelText('Descripción (opcional)')).toHaveAttribute(
      'maxLength',
      '300',
    );
    expect(screen.getByLabelText('Condiciones (opcional)')).toHaveAttribute('maxLength', '300');
  });
});

describe('Pestaña Publicar cupos (spec 008 T011): con publicación', () => {
  it('RF-008-05: muestra activa hasta, cupos, solicitudes, reportes y la vista previa de la API', async () => {
    renderTab();
    expect(await screen.findByText('Publicación activa hasta el 17 nov 2026.')).toBeVisible();
    const status = screen.getByRole('region', { name: 'Tu publicación' });
    expect(status).toHaveTextContent('Cupos ofrecidos:2 cupos');
    expect(status).toHaveTextContent('Solicitudes en curso:1');
    expect(status).toHaveTextContent('Reportes:0');
    const preview = screen.getByRole('region', { name: 'Así la verán' });
    const card = within(preview).getByRole('article', { name: 'Prime Video · Estándar' });
    expect(card).toHaveTextContent('Cuota estimada');
    expect(card).toHaveTextContent('Bs 9,30');
    expect(card).toHaveTextContent('2 cupos · Cobro el día 18');
    expect(within(card).getByText('Nivel: Excelente')).toBeVisible();
    expect(card).toHaveTextContent('Abierta hasta el 20 oct 2026, 23:59');
  });

  it('RN-008-07: la vista previa muestra descripción y condiciones como texto, sin HTML', async () => {
    mockedGet.mockResolvedValue(
      ownerListing({
        preview: listingView({
          description: '<script>alert(1)</script>\nVisita https://ejemplo.com',
          conditions: '<b>Puntuales</b>',
        }),
      }),
    );
    renderTab();
    const text = await screen.findByText(/<script>alert\(1\)<\/script>/);
    expect(text).toHaveClass('whitespace-pre-wrap');
    expect(screen.getByText('<b>Puntuales</b>')).toBeVisible();
    const preview = screen.getByRole('region', { name: 'Así la verán' });
    expect(preview.querySelector('script, b')).toBeNull();
    expect(within(preview).queryByRole('link')).toBeNull();
  });

  it('RF-008-05: «Renovar 30 días» actualiza la fecha con la respuesta de la API', async () => {
    mockedRenew.mockResolvedValue(
      ownerListing({ expiresAt: '2026-11-20T14:00:00.000Z', version: 4 }),
    );
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Renovar 30 días' }));
    expect(mockedRenew).toHaveBeenCalledWith('g1');
    expect(await screen.findByText('Renovaste la publicación hasta el 20 nov 2026.')).toBeVisible();
    expect(screen.getByText('Publicación activa hasta el 20 nov 2026.')).toBeVisible();
  });

  it('RF-008-06: «Editar» envía los cambios con la versión', async () => {
    mockedUpdate.mockResolvedValue(ownerListing({ slotsOffered: 1, version: 4 }));
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const slots = screen.getByLabelText('Cupos a publicar');
    expect(slots).toHaveValue(2);
    await user.clear(slots);
    await user.type(slots, '1');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(mockedUpdate).toHaveBeenCalledWith('g1', {
      slotsOffered: 1,
      description: 'Somos una familia que comparte Prime Video desde hace un año.',
      conditions: 'Pago por QR dentro del plazo.',
      version: 3,
    });
    expect(await screen.findByText('Guardamos los cambios.')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Tu publicación' })).toHaveTextContent(
      'Cupos ofrecidos:1 cupo',
    );
  });

  it('RF-008-06: con 409 STALE_STATE al editar vuelve a pedir la publicación y lo avisa', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText(
        'La publicación cambió mientras la editabas. Cargamos los datos actualizados.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });

  it('RF-008-06: «Retirar» pide confirmación y deja el formulario para publicar de nuevo', async () => {
    mockedWithdraw.mockResolvedValue(undefined);
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Retirar' }));
    const dialog = screen.getByRole('dialog', { name: '¿Retirar la publicación?' });
    await user.click(within(dialog).getByRole('button', { name: 'Retirar publicación' }));
    expect(mockedWithdraw).toHaveBeenCalledWith('g1');
    expect(
      await screen.findByText(
        'Retiraste la publicación. Las solicitudes en curso siguen su trámite.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publicar cupos' })).toBeVisible();
  });

  it('RF-008-18: una publicación oculta lo explica y no ofrece renovar', async () => {
    mockedGet.mockResolvedValue(
      ownerListing({ status: 'oculta', hiddenAt: '2026-10-19T14:00:00.000Z', reportCount: 3 }),
    );
    renderTab();
    expect(await screen.findByText('Oculta por reportes')).toBeVisible();
    expect(screen.getByText(/Tu publicación está oculta desde el 19 oct 2026/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Renovar 30 días' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
  });

  it('CA-008-14: una publicación expirada se puede renovar pero no editar', async () => {
    mockedGet.mockResolvedValue(ownerListing({ status: 'expirada' }));
    renderTab();
    expect(await screen.findByText('Expirada')).toBeVisible();
    expect(screen.getByText(/Tu publicación venció el 17 nov 2026/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Renovar 30 días' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('RF-008-05: LISTING_HIDDEN al renovar explica que espera la revisión', async () => {
    mockedRenew.mockRejectedValue(new ApiError(422, 'LISTING_HIDDEN', 'x'));
    const user = renderTab();
    await user.click(await screen.findByRole('button', { name: 'Renovar 30 días' }));
    expect(await screen.findByText(/está oculta por reportes: podrás renovarla/)).toBeVisible();
  });

  it('RF-008-01: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mockedGet
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(ownerListing());
    const { unmount } = render(<GroupListingTab group={group} />);
    expect(screen.getByText('Cargando la publicación…')).toBeInTheDocument();
    unmount();
    const user = renderTab();
    expect(await screen.findByText('No pudimos cargar la publicación.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Publicación activa hasta el 17 nov 2026.')).toBeVisible();
  });
});

describe('Insignia «El grupo publicó cupos» (spec 008 T011)', () => {
  it('RF-008-01: un miembro ve la insignia con los cupos y hasta cuándo', async () => {
    mockedGet.mockResolvedValue({
      active: true,
      slotsOffered: 2,
      expiresAt: '2026-11-17T14:00:00.000Z',
    });
    render(<GroupListingBadge groupId="g1" />);
    expect(
      await screen.findByText('El grupo publicó cupos · 2 cupos hasta el 17 nov 2026'),
    ).toBeVisible();
  });

  it('RF-008-01: sin publicación activa o con error no muestra nada', async () => {
    mockedGet.mockResolvedValueOnce({ active: false, slotsOffered: null, expiresAt: null });
    const { container, unmount } = render(<GroupListingBadge groupId="g1" />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const second = render(<GroupListingBadge groupId="g1" />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
