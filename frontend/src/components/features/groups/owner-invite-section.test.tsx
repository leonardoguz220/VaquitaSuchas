import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { regenerateInviteCode, updateGroup, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import { OwnerInviteSection } from './owner-invite-section';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/g1',
}));
jest.mock('@/services/groups', () => ({
  regenerateInviteCode: jest.fn(),
  updateGroup: jest.fn(),
}));

const mockedRegenerate = jest.mocked(regenerateInviteCode);
const mockedUpdate = jest.mocked(updateGroup);

// GroupDetail del contrato 001 visto por el titular (con inviteCode).
const group = {
  id: 'g1',
  name: 'Netflix de la familia',
  status: 'activo',
  frozenReason: null,
  myRole: 'titular',
  inviteCode: 'K7M2Q9PX',
  entryWindow: { isOpen: false, opensAt: null, closesAt: null, acceptingMembers: true },
  version: 4,
} as unknown as GroupDetail;

function renderSection(value: GroupDetail = group) {
  const onGroupChange = jest.fn();
  const onRefresh = jest.fn().mockResolvedValue(undefined);
  const actor = userEvent.setup();
  render(<OwnerInviteSection group={value} onGroupChange={onGroupChange} onRefresh={onRefresh} />);
  return { actor, onGroupChange, onRefresh };
}

const toggle = () => screen.getByRole('switch', { name: 'Recibir solicitudes con el código' });

beforeEach(() => {
  mockedRegenerate.mockReset();
  mockedUpdate.mockReset();
});

describe('OwnerInviteSection (spec 001 T025)', () => {
  it('RF-001-06: muestra el código con Copiar y Compartir', () => {
    renderSection();
    expect(screen.getByRole('region', { name: 'Código de invitación' })).toBeInTheDocument();
    expect(screen.getByTestId('invite-code')).toHaveTextContent('K7M2Q9PX');
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument();
  });

  it('RF-001-06: Copiar copia el código', async () => {
    const { actor } = renderSection();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await actor.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith('K7M2Q9PX');
    expect(await screen.findByText('Copiamos el código.')).toBeInTheDocument();
  });

  it('RF-001-06: si no se puede copiar lo dice', async () => {
    const { actor } = renderSection();
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await actor.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(
      await screen.findByText('No pudimos copiar. Selecciona el código y cópialo a mano.'),
    ).toBeInTheDocument();
  });

  it('RF-001-08: Regenerar abre un modal que explica el efecto; Cancelar no llama a la API', async () => {
    const { actor } = renderSection();
    await actor.click(screen.getByRole('button', { name: 'Regenerar código' }));

    const dialog = screen.getByRole('dialog', { name: '¿Regenerar el código?' });
    expect(dialog).toHaveAccessibleDescription(
      'El código K7M2Q9PX dejará de funcionar al instante. Quien todavía no lo usó necesitará el nuevo.',
    );
    expect(dialog).toHaveTextContent(
      'Las solicitudes de ingreso que ya están abiertas siguen igual.',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await actor.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedRegenerate).not.toHaveBeenCalled();
  });

  it('RF-001-08: al confirmar muestra el código nuevo que devuelve la API', async () => {
    mockedRegenerate.mockResolvedValue({ inviteCode: 'Q4W8ZR2N' });
    const { actor, onGroupChange } = renderSection();
    await actor.click(screen.getByRole('button', { name: 'Regenerar código' }));
    await actor.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerar código' }),
    );

    expect(mockedRegenerate).toHaveBeenCalledWith('g1');
    expect(onGroupChange).toHaveBeenCalledWith({ ...group, inviteCode: 'Q4W8ZR2N' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('Generamos un código nuevo. El anterior ya no sirve.'),
    ).toBeInTheDocument();
  });

  it('RF-001-08: si falla deja el modal abierto con el error', async () => {
    mockedRegenerate.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const { actor } = renderSection();
    await actor.click(screen.getByRole('button', { name: 'Regenerar código' }));
    const dialog = screen.getByRole('dialog');
    await actor.click(within(dialog).getByRole('button', { name: 'Regenerar código' }));

    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos regenerar el código.');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
  });

  it('RF-001-09: el interruptor muestra el estado con texto y pausa la recepción con la versión', async () => {
    const paused = {
      ...group,
      entryWindow: { ...group.entryWindow, acceptingMembers: false },
      version: 5,
    };
    mockedUpdate.mockResolvedValue(paused);
    const { actor, onGroupChange } = renderSection();

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(toggle()).toHaveTextContent('Sí');
    expect(toggle()).toHaveAccessibleDescription(
      'Quien tenga el código puede pedir entrar durante la ventana de ingreso.',
    );
    await actor.click(toggle());
    expect(mockedUpdate).toHaveBeenCalledWith('g1', { acceptingMembers: false, version: 4 });
    expect(onGroupChange).toHaveBeenCalledWith(paused);
    expect(screen.getByText('Pausaste la recepción de nuevos miembros.')).toBeInTheDocument();
  });

  it('RF-001-09: con la recepción pausada el interruptor dice No y la reactiva', async () => {
    const paused = {
      ...group,
      entryWindow: { ...group.entryWindow, acceptingMembers: false },
    };
    mockedUpdate.mockResolvedValue(group);
    const { actor } = renderSection(paused);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(toggle()).toHaveTextContent('No');
    await actor.click(toggle());
    expect(mockedUpdate).toHaveBeenCalledWith('g1', { acceptingMembers: true, version: 4 });
    expect(
      screen.getByText('El grupo vuelve a recibir solicitudes con el código.'),
    ).toBeInTheDocument();
  });

  it('RF-001-09: con 409 STALE_STATE avisa y recarga el grupo', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    const { actor, onRefresh, onGroupChange } = renderSection();
    await actor.click(toggle());
    await act(async () => {});

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Otra persona modificó el grupo. Cargamos los datos actualizados.',
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onGroupChange).not.toHaveBeenCalled();
  });

  it('RF-001-09: un error de conexión al cambiar la recepción lo dice', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'));
    const { actor, onRefresh } = renderSection();
    await actor.click(toggle());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cambiar la recepción de nuevos miembros. No se pudo contactar con el servidor.',
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('RN-001-07: un grupo cerrado o con titular baneado no muestra las acciones', () => {
    const { unmount } = render(
      <OwnerInviteSection
        group={{ ...group, status: 'cerrado' }}
        onGroupChange={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Código de invitación' })).not.toBeInTheDocument();
    unmount();
    render(
      <OwnerInviteSection
        group={{ ...group, frozenReason: 'titular_baneado' }}
        onGroupChange={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
