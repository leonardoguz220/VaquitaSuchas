import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { getInvitationShare, sendInvitation } from '@/services/invitations';
import { InviteModal } from './invite-modal';

jest.mock('@/services/invitations', () => ({
  sendInvitation: jest.fn(),
  getInvitationShare: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/grupos/g1',
}));

const mockedSend = jest.mocked(sendInvitation);
const mockedShare = jest.mocked(getInvitationShare);
const SHARE = {
  inviteUrl: 'https://vaquita.example/unirse?codigo=K7M2Q9XA',
  text: 'Únete a mi grupo: https://vaquita.example/unirse?codigo=K7M2Q9XA',
};

beforeEach(() => {
  mockedSend.mockReset();
  mockedShare.mockReset();
  mockedShare.mockResolvedValue(SHARE);
});

function renderModal() {
  const user = userEvent.setup();
  render(<InviteModal groupId="g1" groupName="Spotify depa" open onClose={() => {}} />);
  return user;
}

describe('InviteModal en /grupos/[id] (spec 005 T028)', () => {
  it('CA-005-14: envía la invitación al correo y lo confirma sin decir si ya es miembro', async () => {
    mockedSend.mockResolvedValue({ status: 'pendiente' });
    const user = renderModal();
    expect(screen.getByText(/hasta 10 invitaciones por correo por hora/)).toBeVisible();
    await user.type(screen.getByLabelText(/Correo de la persona/), ' ana@example.com ');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(mockedSend).toHaveBeenCalledWith('g1', 'ana@example.com');
    expect(await screen.findByText(/Enviamos la invitación a ana@example.com/)).toBeVisible();
  });

  it('CA-005-16: el límite de 10 por hora muestra cuándo volver a intentar', async () => {
    mockedSend.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1500 }),
    );
    const user = renderModal();
    await user.type(screen.getByLabelText(/Correo de la persona/), 'once@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText(/Prueba de nuevo en 25 min/)).toBeVisible();
  });

  it('CA-005-14: un correo inválido marca el campo', async () => {
    mockedSend.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const user = renderModal();
    await user.type(screen.getByLabelText(/Correo de la persona/), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText(/Escribe un correo válido/)).toBeVisible();
    expect(screen.getByLabelText(/Correo de la persona/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-005-17: WhatsApp abre wa.me con el texto del servidor, sin enviar nada', async () => {
    renderModal();
    const link = await screen.findByRole('link', { name: 'Invitar por WhatsApp' });
    expect(link).toHaveAttribute(
      'href',
      `https://wa.me/?${new URLSearchParams({ text: SHARE.text }).toString()}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('RF-005-15: Copiar enlace copia la URL de invitación', async () => {
    const user = renderModal();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    expect(writeText).toHaveBeenCalledWith(SHARE.inviteUrl);
    expect(await screen.findByText('Enlace copiado.')).toBeVisible();
  });

  it('RF-005-15: si el grupo está cerrado no ofrece el enlace', async () => {
    mockedShare.mockRejectedValue(new ApiError(422, 'GROUP_CLOSED', 'x'));
    renderModal();
    expect(await screen.findByText(/El grupo está cerrado/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Invitar por WhatsApp' })).not.toBeInTheDocument();
  });
});
