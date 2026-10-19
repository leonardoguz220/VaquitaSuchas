import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGroup, regenerateInviteCode, updateGroup, type GroupDetail } from '@/services/groups';
import { ApiError, NETWORK_ERROR_CODE } from '@/services/http';
import { memberGroup, ownerGroup } from './__fixtures__/groups';
import { INVITE_PANEL_MESSAGES } from './group-invite-errors';
import { REGENERATE_EFFECT } from './group-invite-panel';
import { GroupPageView } from './group-page';

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  updateGroup: jest.fn(),
  regenerateInviteCode: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mockedGet = jest.mocked(getGroup);
const mockedUpdate = jest.mocked(updateGroup);
const mockedRegenerate = jest.mocked(regenerateInviteCode);

const OLD_CODE = 'R3T6YV8B';
const NEW_CODE = 'P4W8ZR2N';

function withAccepting(group: GroupDetail, acceptingMembers: boolean, version: number) {
  return { ...group, entryWindow: { ...group.entryWindow, acceptingMembers }, version };
}

beforeEach(() => {
  jest.resetAllMocks();
});

async function renderOwner(group: GroupDetail = ownerGroup) {
  mockedGet.mockResolvedValue(group);
  render(<GroupPageView groupId={group.id} />);
  return screen.findByRole('region', { name: 'Invitar al grupo' });
}

async function confirmRegenerate(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  await user.click(within(panel).getByRole('button', { name: 'Regenerar código' }));
  const dialog = screen.getByRole('dialog', { name: '¿Regenerar el código?' });
  await user.click(within(dialog).getByRole('button', { name: /Regenerar código/ }));
  return dialog;
}

describe('Panel del código de invitación en /grupos/[id] (T025)', () => {
  it('RF-001-06: el titular ve el código de 8 caracteres sin ambiguos con Copiar y Compartir', async () => {
    const user = userEvent.setup();
    const panel = await renderOwner();
    const code = within(panel).getByTestId('invite-code');
    expect(code).toHaveTextContent(OLD_CODE);
    expect(code.textContent).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(within(panel).getByRole('button', { name: 'Copiar' })).toBeVisible();

    const writeText = jest.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(panel).getByRole('button', { name: 'Compartir' }));
    expect(writeText).toHaveBeenCalledWith(OLD_CODE);
    expect(await within(panel).findByText('Código copiado.')).toBeVisible();
  });

  it('CA-001-09: regenerar pide confirmación, muestra el código nuevo y descarta el anterior', async () => {
    const user = userEvent.setup();
    let resolve: (value: { inviteCode: string }) => void = () => {};
    mockedRegenerate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const panel = await renderOwner();

    await user.click(within(panel).getByRole('button', { name: 'Regenerar código' }));
    const dialog = screen.getByRole('dialog', { name: '¿Regenerar el código?' });
    expect(dialog).toHaveAccessibleDescription(REGENERATE_EFFECT);
    expect(mockedRegenerate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /Regenerar código/ }));
    expect(mockedRegenerate).toHaveBeenCalledWith(ownerGroup.id);
    expect(within(dialog).getByRole('button', { name: /Regenerar código/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    resolve({ inviteCode: NEW_CODE });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(panel).getByTestId('invite-code')).toHaveTextContent(NEW_CODE);
    expect(panel).not.toHaveTextContent(OLD_CODE);
    expect(within(panel).getByText('Código regenerado. El anterior ya no funciona.')).toBeVisible();
  });

  it('CA-001-09: «Cancelar» cierra el modal sin regenerar', async () => {
    const user = userEvent.setup();
    const panel = await renderOwner();
    await user.click(within(panel).getByRole('button', { name: 'Regenerar código' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedRegenerate).not.toHaveBeenCalled();
    expect(within(panel).getByTestId('invite-code')).toHaveTextContent(OLD_CODE);
  });

  it('RF-001-09: el interruptor pausa y reactiva la recepción con la version vigente', async () => {
    const user = userEvent.setup();
    mockedUpdate
      .mockResolvedValueOnce(withAccepting(ownerGroup, false, ownerGroup.version + 1))
      .mockResolvedValueOnce(withAccepting(ownerGroup, true, ownerGroup.version + 2));
    const panel = await renderOwner();
    const toggle = within(panel).getByRole('switch', {
      name: 'Recibir solicitudes con el código',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription(/^Activado/);
    expect(toggle.className).toContain('min-h-11');

    await user.click(toggle);
    expect(mockedUpdate).toHaveBeenLastCalledWith(ownerGroup.id, {
      acceptingMembers: false,
      version: ownerGroup.version,
    });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(toggle).toHaveAccessibleDescription(/^Pausado/);
    expect(within(panel).getByText('Pausaste la recepción de miembros.')).toBeVisible();

    await user.click(toggle);
    expect(mockedUpdate).toHaveBeenLastCalledWith(ownerGroup.id, {
      acceptingMembers: true,
      version: ownerGroup.version + 1,
    });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('RF-001-09: 409 STALE_STATE recarga el grupo y avisa', async () => {
    const user = userEvent.setup();
    const fresh = withAccepting(ownerGroup, false, ownerGroup.version + 3);
    mockedUpdate.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const panel = await renderOwner();
    mockedGet.mockResolvedValue(fresh);

    await user.click(within(panel).getByRole('switch'));
    expect(await within(panel).findByText(INVITE_PANEL_MESSAGES.stale)).toBeVisible();
    expect(mockedGet).toHaveBeenLastCalledWith(ownerGroup.id);
    expect(within(panel).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('sin conexión lo dice y deja el interruptor como estaba', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(new ApiError(0, NETWORK_ERROR_CODE, 'x'));
    const panel = await renderOwner();
    await user.click(within(panel).getByRole('switch'));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      INVITE_PANEL_MESSAGES.connection,
    );
    expect(within(panel).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('CA-001-11: el miembro no ve el código ni los controles', async () => {
    mockedGet.mockResolvedValue(memberGroup);
    render(<GroupPageView groupId={memberGroup.id} />);
    expect(await screen.findByText('Eres miembro')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Invitar al grupo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerar código' })).not.toBeInTheDocument();
  });

  it('CA-001-11: un 403 de la API muestra que solo el titular puede hacerlo', async () => {
    const user = userEvent.setup();
    mockedRegenerate.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    const panel = await renderOwner();
    await confirmRegenerate(user, panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      INVITE_PANEL_MESSAGES.forbidden,
    );
    expect(within(panel).getByTestId('invite-code')).toHaveTextContent(OLD_CODE);
  });

  it('CA-001-16: con el grupo cerrado los controles quedan en solo lectura', async () => {
    const panel = await renderOwner({ ...ownerGroup, status: 'cerrado' });
    expect(within(panel).getByText(INVITE_PANEL_MESSAGES.closed)).toBeVisible();
    expect(within(panel).getByRole('switch')).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Regenerar código' })).toBeDisabled();
  });

  it('CA-001-16: con el grupo congelado (frozenReason) también quedan en solo lectura', async () => {
    const panel = await renderOwner({ ...ownerGroup, frozenReason: 'titular_baneado' });
    expect(within(panel).getByText(INVITE_PANEL_MESSAGES.frozen)).toBeVisible();
    expect(within(panel).getByRole('switch')).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Regenerar código' })).toBeDisabled();
  });

  it('CA-001-16: un 422 GROUP_CLOSED de la API muestra el mensaje del grupo cerrado', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(new ApiError(422, 'GROUP_CLOSED', 'x', { rule: 'RN-001-07' }));
    const panel = await renderOwner();
    await user.click(within(panel).getByRole('switch'));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(INVITE_PANEL_MESSAGES.closed);
  });
});
