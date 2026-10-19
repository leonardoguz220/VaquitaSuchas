import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { requestListingSeat, type ListingView } from '@/services/listings';
import { ListingRequestPanel } from './listing-request';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/cupos/l1',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  requestListingSeat: jest.fn(),
}));

const mockedRequest = jest.mocked(requestListingSeat);

function listing(overrides: Partial<ListingView> = {}): ListingView {
  return {
    id: 'l1',
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#0F5E8C',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: { fullName: 'Valeria Choque', level: 'Excelente' },
    description: null,
    conditions: null,
    publishedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: '2026-10-29T14:00:00.000Z',
    entryWindow: { isOpen: true, opensAt: null, closesAt: '2026-10-21T03:59:00.000Z' },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
    ...overrides,
  };
}

beforeEach(() => mockedRequest.mockReset());

/** Abre el formulario con el botón Solicitar. */
async function openForm(actor: ReturnType<typeof userEvent.setup>) {
  await actor.click(screen.getByRole('button', { name: 'Solicitar' }));
  return screen.getByRole('textbox', { name: 'Mensaje para el titular (opcional)' });
}

describe('Pedir un cupo desde /cupos/[id] (spec 008 T019)', () => {
  it('CA-008-08: el mensaje admite 200 caracteres y el contador muestra X/200', async () => {
    const actor = userEvent.setup();
    render(<ListingRequestPanel listing={listing()} />);
    const textbox = await openForm(actor);
    expect(screen.getByText('0/200')).toBeVisible();
    await actor.type(textbox, 'a'.repeat(210));
    expect(textbox).toHaveValue('a'.repeat(200));
    expect(screen.getByText('200/200')).toBeVisible();
  });

  it('RF-008-10: envía el mensaje sin espacios sobrantes y, mientras envía, el botón queda desactivado', async () => {
    const actor = userEvent.setup();
    mockedRequest.mockReturnValue(new Promise(() => {}));
    render(<ListingRequestPanel listing={listing()} />);
    const textbox = await openForm(actor);
    await actor.type(textbox, '  Hola, quiero entrar.  ');
    await actor.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(mockedRequest).toHaveBeenCalledWith('l1', { message: 'Hola, quiero entrar.' });
    expect(screen.getByRole('button', { name: /Enviando la solicitud/ })).toBeDisabled();
    expect(textbox).toBeDisabled();
  });

  it('RF-008-10: sin mensaje envía solo la solicitud y, al abrirse, muestra enlace a /solicitudes/[id]', async () => {
    const actor = userEvent.setup();
    mockedRequest.mockResolvedValue({ id: 'req-9' });
    render(<ListingRequestPanel listing={listing()} />);
    await openForm(actor);
    await actor.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByText('Solicitud enviada')).toBeVisible();
    expect(mockedRequest).toHaveBeenCalledWith('l1', {});
    expect(screen.getByRole('link', { name: 'Ver mi solicitud' })).toHaveAttribute(
      'href',
      '/solicitudes/req-9',
    );
  });

  it('CA-008-09: con el límite de solicitudes activas muestra el aviso y conserva el mensaje escrito', async () => {
    const actor = userEvent.setup();
    mockedRequest.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { code: 'TOO_MANY_ACTIVE_REQUESTS' }),
    );
    render(<ListingRequestPanel listing={listing()} />);
    const textbox = await openForm(actor);
    await actor.type(textbox, 'Hola');
    await actor.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(
      await screen.findByText(
        'Ya tienes 5 solicitudes activas. Espera a que alguna termine para abrir otra.',
      ),
    ).toBeVisible();
    expect(textbox).toHaveValue('Hola');
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeEnabled();
  });

  it('CA-008-23: con la ventana cerrada, Solicitar va deshabilitado y la causa da la fecha de apertura', () => {
    render(
      <ListingRequestPanel
        listing={listing({
          canRequest: false,
          cannotRequestReason: 'VENTANA_CERRADA',
          entryWindow: { isOpen: false, opensAt: '2026-11-01T04:00:00.000Z', closesAt: null },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Solicitar' })).toBeDisabled();
    expect(screen.getByText('La ventana de ingreso se abre el 1 nov 2026.')).toBeVisible();
  });

  it('CA-008-23: con solicitud activa, la causa enlaza a /solicitudes/[id]', () => {
    render(
      <ListingRequestPanel
        listing={listing({
          canRequest: false,
          cannotRequestReason: 'SOLICITUD_ACTIVA',
          myRequest: { id: 'req-7', status: 'abierta' },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Solicitar' })).toBeDisabled();
    expect(screen.getByText('Ya tienes una solicitud en esta publicación.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver mi solicitud' })).toHaveAttribute(
      'href',
      '/solicitudes/req-7',
    );
  });
});
