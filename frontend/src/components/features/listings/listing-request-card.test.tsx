import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listingView } from '@/services/__fixtures__/listings';
import { openRequest } from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import { requestListingSeat, type ListingView } from '@/services/listings';
import { ListingRequestCard } from './listing-request-card';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  requestListingSeat: jest.fn(),
}));

const mocked = jest.mocked(requestListingSeat);

function renderCard(listing: ListingView = listingView()) {
  const user = userEvent.setup();
  render(<ListingRequestCard listing={listing} />);
  return user;
}

beforeEach(() => {
  push.mockReset();
  mocked.mockReset();
});

describe('Solicitar un cupo en /cupos/[id] (spec 008 T019)', () => {
  it('RF-008-10: envía el mensaje recortado, desactiva el botón y lleva a la solicitud', async () => {
    let resolve: (value: typeof openRequest) => void = () => {};
    mocked.mockReturnValue(new Promise((done) => (resolve = done)));
    const user = renderCard();
    const field = screen.getByLabelText('Mensaje para Valeria (opcional)');
    await user.type(field, '  Hola Valeria, me interesa un cupo.  ');
    expect(screen.getByText('38 / 200')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Solicitar cupo' }));
    expect(mocked).toHaveBeenCalledWith('l1', { message: 'Hola Valeria, me interesa un cupo.' });
    expect(screen.getByRole('button', { name: /Solicitar cupo/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Solicitar cupo/ }));
    expect(mocked).toHaveBeenCalledTimes(1);
    resolve({ ...openRequest, source: 'publicacion' });
    expect(await screen.findByText('Abrimos tu solicitud. Te llevamos a ella…')).toBeVisible();
    expect(push).toHaveBeenCalledWith('/solicitudes/jr1');
    expect(screen.getByRole('button', { name: 'Solicitar cupo' })).toBeDisabled();
  });

  it('RF-008-10: sin mensaje no manda el campo', async () => {
    mocked.mockResolvedValue(openRequest);
    const user = renderCard();
    await user.click(screen.getByRole('button', { name: 'Solicitar cupo' }));
    expect(mocked).toHaveBeenCalledWith('l1', {});
  });

  it('CA-008-08: el mensaje no pasa de 200 caracteres; un 400 lo marca junto al campo', async () => {
    mocked.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const user = renderCard();
    const field = screen.getByLabelText('Mensaje para Valeria (opcional)');
    expect(field).toHaveAttribute('maxLength', '200');
    await user.type(field, 'Hola');
    await user.click(screen.getByRole('button', { name: 'Solicitar cupo' }));
    expect(await screen.findByText('Escribe hasta 200 caracteres.')).toBeVisible();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-008-09: con 5 solicitudes activas muestra el error de la API', async () => {
    mocked.mockRejectedValue(new ApiError(422, 'TOO_MANY_ACTIVE_REQUESTS', 'x'));
    const user = renderCard();
    await user.click(screen.getByRole('button', { name: 'Solicitar cupo' }));
    expect(
      await screen.findByText(
        'Ya tienes 5 solicitudes activas. Espera a que alguna termine para abrir otra.',
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Solicitar cupo' })).toBeEnabled();
  });

  it('CA-008-23: con la ventana cerrada el botón está deshabilitado con «se abre el [fecha]»', () => {
    renderCard(
      listingView({
        entryWindow: { isOpen: false, opensAt: '2026-11-18T04:00:00.000Z', closesAt: null },
        canRequest: false,
        cannotRequestReason: 'VENTANA_CERRADA',
      }),
    );
    const button = screen.getByRole('button', { name: 'Solicitar cupo' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'La ventana de ingreso está cerrada. Se abre el 18 nov 2026.',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('RF-008-10: con una solicitud activa enlaza a ella', () => {
    renderCard(
      listingView({
        canRequest: false,
        cannotRequestReason: 'SOLICITUD_ACTIVA',
        myRequest: { id: 'jr7', status: 'abierta' },
      }),
    );
    expect(screen.getByText('Ya tienes una solicitud en este grupo.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver mi solicitud' })).toHaveAttribute(
      'href',
      '/solicitudes/jr7',
    );
    expect(screen.getByRole('button', { name: 'Solicitar cupo' })).toBeDisabled();
  });

  it.each([
    ['DEMASIADAS_SOLICITUDES', 'Ya tienes 5 solicitudes activas'],
    ['COBROS_ABIERTOS', 'Tienes cobros sin saldar en este grupo'],
    ['SIN_CUPOS', 'En este momento no quedan cupos disponibles.'],
    ['CUENTA_RESTRINGIDA', 'Tu cuenta está restringida: no puedes solicitar cupos.'],
  ] as const)('RF-008-10: con %s explica la causa', (reason, text) => {
    renderCard(listingView({ canRequest: false, cannotRequestReason: reason }));
    const card = screen.getByRole('region', { name: 'Solicitar un cupo' });
    expect(within(card).getByText(new RegExp(text))).toBeVisible();
  });

  it('RN-008-06: el nivel «En riesgo» del titular no impide solicitar si la API lo permite', () => {
    renderCard(listingView({ owner: { fullName: 'Iván Céspedes', level: 'En riesgo' } }));
    expect(screen.getByRole('button', { name: 'Solicitar cupo' })).toBeEnabled();
    expect(screen.getByLabelText('Mensaje para Iván (opcional)')).toBeVisible();
  });
});
