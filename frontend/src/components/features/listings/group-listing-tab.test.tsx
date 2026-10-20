import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createOwnerListing,
  getGroupListingSummary,
  getOwnerListing,
  renewOwnerListing,
  retireOwnerListing,
  updateOwnerListing,
  type OwnerListing,
} from '@/services/group-listing';
import type { ListingView } from '@/services/listings';
import { ApiError } from '@/services/http';
import { ownerGroup } from '../groups/__fixtures__/groups';
import { GroupListingBadge } from './group-listing-badge';
import { GroupListingTab } from './group-listing-tab';

jest.mock('@/services/group-listing', () => ({
  getOwnerListing: jest.fn(),
  getGroupListingSummary: jest.fn(),
  createOwnerListing: jest.fn(),
  updateOwnerListing: jest.fn(),
  renewOwnerListing: jest.fn(),
  retireOwnerListing: jest.fn(),
}));

const mockedGet = jest.mocked(getOwnerListing);
const mockedSummary = jest.mocked(getGroupListingSummary);
const mockedCreate = jest.mocked(createOwnerListing);
const mockedUpdate = jest.mocked(updateOwnerListing);
const mockedRenew = jest.mocked(renewOwnerListing);
const mockedRetire = jest.mocked(retireOwnerListing);

/** Grupo con 2 cupos libres: el total es el de miembros del fixture más 2. */
const group = { ...ownerGroup, totalSlots: ownerGroup.members.length + 2 };

const preview: ListingView = {
  id: 'listing-1',
  service: { name: 'Canva Pro', planName: null, logoUrl: null, brandColor: null, category: null },
  slotsOffered: 2,
  estimatedShareCents: 930,
  estimatedShareLabel: 'estimada',
  billingDay: 5,
  owner: { fullName: 'Valeria Choque', level: 'Excelente' },
  description: 'Buscamos dos personas',
  conditions: 'Pago por QR',
  publishedAt: '2026-10-18T14:00:00.000Z',
  expiresAt: '2026-11-17T14:00:00.000Z',
  entryWindow: { isOpen: true, opensAt: null, closesAt: null },
  myRequest: null,
  canRequest: false,
  cannotRequestReason: null,
};

const activeListing: OwnerListing = {
  id: 'listing-1',
  groupId: group.id,
  status: 'activa',
  slotsOffered: 2,
  description: 'Buscamos dos personas',
  conditions: 'Pago por QR',
  publishedAt: '2026-10-18T14:00:00.000Z',
  expiresAt: '2026-11-17T14:00:00.000Z',
  renewedAt: null,
  hiddenAt: null,
  endReason: null,
  reportCount: 0,
  openRequests: 1,
  preview,
  version: 4,
};

async function renderTab(listing: OwnerListing | null = null) {
  mockedGet.mockResolvedValue(listing);
  const user = userEvent.setup();
  render(<GroupListingTab group={group} />);
  await screen.findByText('Cupos libres');
  await waitFor(() => expect(mockedGet).toHaveBeenCalled());
  return user;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GroupListingTab: publicar cupos del titular (T011, spec 008)', () => {
  it('muestra el aviso fijo de cuota en todo momento', async () => {
    await renderTab(null);
    expect(
      await screen.findByText(
        'Aceptar a alguien cambia la cuota de todos desde el siguiente cobro.',
      ),
    ).toBeInTheDocument();
  });

  it('CA-008-01: publica con cupos, descripción y condiciones, y muestra la cuota estimada de la API', async () => {
    mockedCreate.mockResolvedValue(activeListing);
    const user = await renderTab(null);

    await user.type(await screen.findByLabelText('Cupos a publicar'), '2');
    await user.type(screen.getByLabelText('Descripción'), 'Buscamos dos personas');
    await user.type(screen.getByLabelText('Condiciones'), 'Pago por QR');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(group.id, {
        slotsOffered: 2,
        description: 'Buscamos dos personas',
        conditions: 'Pago por QR',
      }),
    );
    expect(await screen.findByText('Publicación creada')).toBeInTheDocument();
    expect(screen.getByText(/Publicación activa hasta el/)).toBeInTheDocument();
    expect(screen.getByText('Bs 9,30')).toBeInTheDocument();
  });

  it('no envía más cupos de los libres y avisa en el campo', async () => {
    const user = await renderTab(null);
    await user.type(await screen.findByLabelText('Cupos a publicar'), '3');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));

    expect(await screen.findByText('Solo hay 2 cupos libres.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('CA-008-03: si ya hay una publicación activa, la API rechaza y se muestra el motivo', async () => {
    mockedCreate.mockRejectedValue(new ApiError(409, 'LISTING_ALREADY_ACTIVE', 'x'));
    const user = await renderTab(null);
    await user.type(await screen.findByLabelText('Cupos a publicar'), '1');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));

    expect(
      await screen.findByText('El grupo ya tiene una publicación activa.'),
    ).toBeInTheDocument();
  });

  it('CA-008-02: una regla de negocio 422 NO_FREE_SLOTS se muestra con su texto, no con el mensaje crudo', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'mensaje crudo', { code: 'NO_FREE_SLOTS' }),
    );
    const user = await renderTab(null);
    await user.type(await screen.findByLabelText('Cupos a publicar'), '1');
    await user.click(screen.getByRole('button', { name: 'Publicar cupos' }));

    expect(await screen.findByText('No hay cupos libres.')).toBeInTheDocument();
    expect(screen.queryByText('mensaje crudo')).not.toBeInTheDocument();
  });

  it('con publicación activa muestra su estado, Renovar, Editar y Retirar', async () => {
    mockedRenew.mockResolvedValue({ ...activeListing, renewedAt: '2026-10-19T14:00:00.000Z' });
    const user = await renderTab(activeListing);

    expect(await screen.findByText(/Publicación activa hasta el/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar publicación' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Renovar 30 días' }));

    expect(mockedRenew).toHaveBeenCalledWith(group.id);
    expect(await screen.findByText('Publicación renovada por 30 días')).toBeInTheDocument();
  });

  it('editar envía solo lo cambiado con la versión que tiene en pantalla', async () => {
    mockedUpdate.mockResolvedValue({ ...activeListing, description: 'Nuevo texto', version: 5 });
    const user = await renderTab(activeListing);

    await user.click(await screen.findByRole('button', { name: 'Editar publicación' }));
    const description = screen.getByLabelText('Descripción');
    expect(description).toHaveValue('Buscamos dos personas');
    await user.clear(description);
    await user.type(description, 'Nuevo texto');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(group.id, {
        slotsOffered: 2,
        description: 'Nuevo texto',
        conditions: 'Pago por QR',
        version: 4,
      }),
    );
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('retirar pide confirmación y deja el grupo sin publicación', async () => {
    mockedRetire.mockResolvedValue(undefined);
    mockedGet.mockResolvedValueOnce(activeListing).mockResolvedValue(null);
    const user = userEvent.setup();
    render(<GroupListingTab group={group} />);

    await user.click(await screen.findByRole('button', { name: 'Retirar' }));
    const dialog = screen.getByRole('dialog', { name: '¿Retirar la publicación?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sí, retirar' }));

    await waitFor(() => expect(mockedRetire).toHaveBeenCalledWith(group.id));
    expect(await screen.findByRole('button', { name: 'Publicar cupos' })).toBeInTheDocument();
  });

  it('una publicación oculta no ofrece Renovar, pero sí Editar y Retirar', async () => {
    await renderTab({ ...activeListing, status: 'oculta', hiddenAt: '2026-10-19T10:00:00.000Z' });

    expect(await screen.findByText('Publicación oculta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renovar 30 días' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar publicación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeInTheDocument();
  });

  it('T023 CA-008-17: el titular ve que su publicación oculta por reportes no aparece en la búsqueda', async () => {
    await renderTab({
      ...activeListing,
      status: 'oculta',
      reportCount: 3,
      hiddenAt: '2026-10-19T10:00:00.000Z',
    });

    expect(await screen.findByText('Tu publicación está oculta')).toBeInTheDocument();
    expect(screen.getByText(/Recibió 3 reportes de otros usuarios/)).toBeInTheDocument();
    expect(screen.getByText(/no aparece en la búsqueda/)).toBeInTheDocument();
  });

  it('una publicación activa no muestra el aviso de oculta', async () => {
    await renderTab(activeListing);

    expect(await screen.findByText(/Publicación activa hasta el/)).toBeInTheDocument();
    expect(screen.queryByText('Tu publicación está oculta')).not.toBeInTheDocument();
  });

  it('una publicación expirada se puede renovar y no se edita', async () => {
    await renderTab({ ...activeListing, status: 'expirada', preview: null });

    expect(await screen.findByText(/Publicación expirada el/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renovar 30 días' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar publicación' })).not.toBeInTheDocument();
  });
});

describe('GroupListingBadge: insignia para miembros (T011)', () => {
  it('muestra «El grupo publicó cupos» si hay publicación activa', async () => {
    mockedSummary.mockResolvedValue({
      active: true,
      slotsOffered: 2,
      expiresAt: '2026-11-17T14:00:00.000Z',
    });
    render(<GroupListingBadge groupId={group.id} />);

    expect(await screen.findByText('El grupo publicó cupos')).toBeInTheDocument();
  });

  it('no muestra nada si el grupo no tiene publicación activa', async () => {
    mockedSummary.mockResolvedValue({ active: false, slotsOffered: null, expiresAt: null });
    render(<GroupListingBadge groupId={group.id} />);

    await waitFor(() => expect(mockedSummary).toHaveBeenCalled());
    expect(screen.queryByText('El grupo publicó cupos')).not.toBeInTheDocument();
  });
});
