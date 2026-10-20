import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { updateGroup, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import { ownerGroup } from './__fixtures__/groups';
import { GroupSettingsTab } from './group-settings-tab';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/abc',
}));

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  updateGroup: jest.fn(),
}));

const mockedUpdate = jest.mocked(updateGroup);

function renderTab(group: GroupDetail = ownerGroup) {
  const onGroupChange = jest.fn();
  render(<GroupSettingsTab group={group} onGroupChange={onGroupChange} />);
  return {
    onGroupChange,
    toggle: () => screen.getByRole('switch', { name: 'Recibir miembros nuevos' }),
  };
}

describe('GroupSettingsTab: pausar la recepción (T029, RF-001-09)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('muestra el estado actual de la recepción', () => {
    const { toggle } = renderTab();
    expect(toggle()).toBeChecked();
    expect(screen.getByText('Recibiendo')).toBeInTheDocument();
  });

  it('pausar manda PATCH con acceptingMembers false y la versión del grupo', async () => {
    const paused = {
      ...ownerGroup,
      version: ownerGroup.version + 1,
      entryWindow: { ...ownerGroup.entryWindow, acceptingMembers: false },
    };
    mockedUpdate.mockResolvedValueOnce(paused);
    const { onGroupChange, toggle } = renderTab();

    await userEvent.click(toggle());

    expect(mockedUpdate).toHaveBeenCalledWith(ownerGroup.id, {
      acceptingMembers: false,
      version: ownerGroup.version,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pausaste la recepción de miembros.',
    );
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(paused));
  });

  it('un 409 STALE_STATE avisa que el grupo cambió', async () => {
    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'STALE_STATE', 'El grupo cambió.'));
    const { toggle } = renderTab();

    await userEvent.click(toggle());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Otra persona modificó el grupo; recargamos los datos.',
    );
  });

  it('con el grupo cerrado el interruptor queda deshabilitado', () => {
    const { toggle } = renderTab({ ...ownerGroup, status: 'cerrado' });
    expect(toggle()).toBeDisabled();
  });
});
