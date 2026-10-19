import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGroup, removeMember, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import { memberGroup, ownerGroup } from './__fixtures__/groups';
import { GroupMembersTab } from './group-members-tab';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/abc',
}));

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  removeMember: jest.fn(),
}));

const mockedRemove = jest.mocked(removeMember);
const mockedGet = jest.mocked(getGroup);
const ANA = 'Ana Quispe Mamani';

function renderTab(group: GroupDetail) {
  const onGroupChange = jest.fn();
  render(<GroupMembersTab group={group} onGroupChange={onGroupChange} />);
  return { onGroupChange };
}

describe('GroupMembersTab: quitar miembros (T029, RF-001-15)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('CA-001-11: solo el titular ve «Quitar», y nunca junto al titular del grupo', () => {
    renderTab(ownerGroup);
    expect(screen.getByRole('button', { name: `Quitar a ${ANA}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar a Marco/ })).not.toBeInTheDocument();
  });

  it('un miembro no ve ningún botón para quitar', () => {
    renderTab(memberGroup);
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it('con el grupo cerrado no se puede quitar a nadie', () => {
    renderTab({ ...ownerGroup, status: 'cerrado' });
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it('el modal dice que se conservan sus cobros y avisa de los cobros abiertos', async () => {
    renderTab(ownerGroup);
    await userEvent.click(screen.getByRole('button', { name: `Quitar a ${ANA}` }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('¿Quitar a Ana Quispe Mamani del grupo?');
    expect(dialog).toHaveTextContent('Se conservarán sus cobros.');
    expect(dialog).toHaveTextContent('cobros sin pagar');
    expect(mockedRemove).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el modal sin llamar a la API', async () => {
    renderTab(ownerGroup);
    await userEvent.click(screen.getByRole('button', { name: `Quitar a ${ANA}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(mockedRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('CA-001-11: confirmar llama a DELETE del miembro y recarga el grupo', async () => {
    const reloaded = { ...ownerGroup, version: 2 };
    mockedRemove.mockResolvedValueOnce({
      removedUserId: ownerGroup.members[1].userId,
      openCharges: 0,
    });
    mockedGet.mockResolvedValueOnce(reloaded);
    const { onGroupChange } = renderTab(ownerGroup);

    await userEvent.click(screen.getByRole('button', { name: `Quitar a ${ANA}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar del grupo' }));

    expect(mockedRemove).toHaveBeenCalledWith(ownerGroup.id, ownerGroup.members[1].userId);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Quitaste a Ana Quispe Mamani del grupo.',
    );
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(reloaded));
  });

  it('avisa cuántos cobros sin pagar conserva el miembro quitado', async () => {
    mockedRemove.mockResolvedValueOnce({
      removedUserId: ownerGroup.members[1].userId,
      openCharges: 2,
    });
    renderTab(ownerGroup);

    await userEvent.click(screen.getByRole('button', { name: `Quitar a ${ANA}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar del grupo' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conserva 2 cobros sin pagar; puedes cancelarlos desde Cobros.',
    );
  });

  it('si la persona ya no es miembro (404) lo dice sin inventar datos', async () => {
    mockedRemove.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No encontrado.'));
    renderTab(ownerGroup);

    await userEvent.click(screen.getByRole('button', { name: `Quitar a ${ANA}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar del grupo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta persona ya no es miembro del grupo.',
    );
  });
});
