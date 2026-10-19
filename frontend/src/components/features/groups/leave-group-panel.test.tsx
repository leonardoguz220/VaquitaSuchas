import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { leaveGroup } from '@/services/groups';
import { ApiError } from '@/services/http';
import { memberGroup } from './__fixtures__/groups';
import { LeaveGroupPanel } from './leave-group-panel';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  usePathname: () => '/grupos/abc',
}));

jest.mock('@/services/groups', () => ({
  leaveGroup: jest.fn(),
}));

const mockedLeave = jest.mocked(leaveGroup);

function openConfirm() {
  return userEvent.click(screen.getByRole('button', { name: 'Abandonar grupo' }));
}

describe('LeaveGroupPanel: abandonar el grupo (T031, RF-001-16, CA-001-14)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('pide confirmación con el nombre del grupo y no llama a la API todavía', async () => {
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(`¿Abandonar «${memberGroup.name}»?`);
    expect(mockedLeave).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el modal sin abandonar', async () => {
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedLeave).not.toHaveBeenCalled();
  });

  it('confirmar llama a POST …/leave y vuelve a Mis suscripciones', async () => {
    mockedLeave.mockResolvedValueOnce(undefined);
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, abandonar' }));
    await waitFor(() => expect(mockedLeave).toHaveBeenCalledWith(memberGroup.id));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/grupos'));
  });

  it('CA-001-14: con cobros sin pagar la API lo impide y el modal dice cuántos son', async () => {
    mockedLeave.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'Tienes cobros sin pagar.', {
        rule: 'RF-001-16',
        openCharges: 2,
      }),
    );
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, abandonar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tienes 2 cobros sin pagar (pendientes, en revisión o atrasados).',
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('un código HAS_OPEN_CHARGES también muestra el aviso de cobros', async () => {
    mockedLeave.mockRejectedValueOnce(
      new ApiError(422, 'HAS_OPEN_CHARGES', 'Cobros.', { openCharges: 1 }),
    );
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, abandonar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes 1 cobro sin pagar');
  });

  it('RN-001-08: el titular que intenta abandonar recibe el aviso de transferir o cerrar', async () => {
    mockedLeave.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'Titular.', {
        rule: 'RN-001-08',
        hint: 'TRANSFER_OR_CLOSE',
      }),
    );
    render(<LeaveGroupPanel group={memberGroup} />);
    await openConfirm();
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, abandonar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Transfiere la titularidad o ciérralo.',
    );
  });
});
