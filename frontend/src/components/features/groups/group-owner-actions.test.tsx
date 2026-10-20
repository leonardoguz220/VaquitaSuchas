import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeGroup, transferOwnership, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import { ownerGroup } from './__fixtures__/groups';
import { GroupOwnerActions } from './group-owner-actions';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/abc',
}));

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  transferOwnership: jest.fn(),
  closeGroup: jest.fn(),
}));

const mockedTransfer = jest.mocked(transferOwnership);
const mockedClose = jest.mocked(closeGroup);
const ANA = ownerGroup.members[1];

function renderActions(group: GroupDetail = ownerGroup) {
  const onGroupChange = jest.fn();
  render(<GroupOwnerActions group={group} onGroupChange={onGroupChange} />);
  return { onGroupChange };
}

async function pickAna() {
  await userEvent.selectOptions(screen.getByLabelText('Nuevo titular'), ANA.userId);
}

describe('GroupOwnerActions: transferir y cerrar (T037, RF-001-17, RF-001-18)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('el botón de transferir se activa solo al elegir a un miembro', async () => {
    renderActions();
    const button = screen.getByRole('button', { name: 'Transferir titularidad' });
    expect(button).toBeDisabled();
    await pickAna();
    expect(button).toBeEnabled();
  });

  it('CA-001-13: la confirmación explica el efecto y transfiere al miembro elegido', async () => {
    const transferred = {
      ...ownerGroup,
      myRole: 'miembro' as const,
      version: ownerGroup.version + 1,
    };
    mockedTransfer.mockResolvedValueOnce(transferred);
    const { onGroupChange } = renderActions();

    await pickAna();
    await userEvent.click(screen.getByRole('button', { name: 'Transferir titularidad' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(`¿Transferir la titularidad a ${ANA.fullName}?`);
    expect(dialog).toHaveTextContent('Tú pasarás a ser miembro');
    await userEvent.click(screen.getByRole('button', { name: 'Sí, transferir' }));

    expect(mockedTransfer).toHaveBeenCalledWith(ownerGroup.id, ANA.userId);
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(transferred));
  });

  it('un miembro no activo o no habilitado muestra el error por code, sin cerrar el modal', async () => {
    mockedTransfer.mockRejectedValueOnce(
      new ApiError(422, 'NOT_HOST_ELIGIBLE', 'No habilitada.', { rule: 'RF-001-21' }),
    );
    renderActions();
    await pickAna();
    await userEvent.click(screen.getByRole('button', { name: 'Transferir titularidad' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, transferir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La persona elegida todavía no puede ser titular.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('RN-010-09: transferir con solicitudes en pago lo dice', async () => {
    mockedTransfer.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'En pago.', { rule: 'RN-010-09', blockers: [] }),
    );
    renderActions();
    await pickAna();
    await userEvent.click(screen.getByRole('button', { name: 'Transferir titularidad' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, transferir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hay solicitudes de ingreso en pago.',
    );
  });

  it('muestra un aviso cuando no hay otro miembro a quien transferir', () => {
    renderActions({ ...ownerGroup, members: [ownerGroup.members[0]] });
    expect(screen.getByText('No hay a quién transferir')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nuevo titular')).not.toBeInTheDocument();
  });

  it('cerrar pide confirmación y luego llama a POST …/close', async () => {
    const closed = { ...ownerGroup, status: 'cerrado' as const, version: ownerGroup.version + 1 };
    mockedClose.mockResolvedValueOnce(closed);
    const { onGroupChange } = renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar grupo' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('no genera más cobros ni recibe miembros');
    expect(mockedClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sí, cerrar grupo' }));
    expect(mockedClose).toHaveBeenCalledWith(ownerGroup.id);
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(closed));
  });

  it('RN-010-09: cerrar con solicitudes en pago lo dice y no cierra', async () => {
    mockedClose.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'En pago.', { rule: 'RN-010-09', blockers: [] }),
    );
    const { onGroupChange } = renderActions();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar grupo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, cerrar grupo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hay solicitudes de ingreso en pago.',
    );
    expect(onGroupChange).not.toHaveBeenCalled();
  });

  it('con el grupo cerrado no se puede transferir ni cerrar', () => {
    renderActions({ ...ownerGroup, status: 'cerrado' });
    expect(screen.getByRole('button', { name: 'Cerrar grupo' })).toBeDisabled();
    expect(screen.getByLabelText('Nuevo titular')).toBeDisabled();
  });
});
