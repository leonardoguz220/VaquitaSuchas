import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGroup, updateGroup, type GroupDetail } from '@/services/groups';
import { ApiError } from '@/services/http';
import { ownerGroup } from './__fixtures__/groups';
import { GroupSettingsForm } from './group-settings-form';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  usePathname: () => '/grupos/abc',
}));

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  updateGroup: jest.fn(),
}));

const mockedUpdate = jest.mocked(updateGroup);
const mockedGet = jest.mocked(getGroup);

function renderForm(group: GroupDetail = ownerGroup, disabled = false) {
  const onGroupChange = jest.fn();
  render(<GroupSettingsForm group={group} onGroupChange={onGroupChange} disabled={disabled} />);
  return { onGroupChange };
}

function save() {
  return userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
}

describe('GroupSettingsForm: edición del titular (T034, RF-001-14)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('muestra los datos actuales del grupo', () => {
    renderForm();
    expect(screen.getByLabelText('Nombre del grupo')).toHaveValue(ownerGroup.name);
    expect(screen.getByLabelText('Día de cobro')).toHaveValue(String(ownerGroup.billingDay));
  });

  it('antes de guardar explica que el día de cobro nuevo rige desde el siguiente corte', async () => {
    renderForm();
    expect(screen.queryByText(/rige desde el siguiente corte/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Día de cobro'), '20');
    expect(screen.getByText(/El día 20 rige desde el siguiente corte/)).toBeInTheDocument();
    expect(screen.getByText(/conservan su fecha/)).toBeInTheDocument();
  });

  it('RF-001-14: guardar manda PATCH solo con lo que cambió y la versión que se vio', async () => {
    const saved = { ...ownerGroup, name: 'Canva del equipo 2', version: ownerGroup.version + 1 };
    mockedUpdate.mockResolvedValueOnce(saved);
    const { onGroupChange } = renderForm();

    await userEvent.clear(screen.getByLabelText('Nombre del grupo'));
    await userEvent.type(screen.getByLabelText('Nombre del grupo'), 'Canva del equipo 2');
    await save();

    expect(mockedUpdate).toHaveBeenCalledWith(ownerGroup.id, {
      name: 'Canva del equipo 2',
      version: ownerGroup.version,
    });
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(saved));
  });

  it('sin cambios no llama a la API', async () => {
    renderForm();
    await save();
    expect(await screen.findByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('un nombre vacío muestra el error en el campo y no llama a la API', async () => {
    renderForm();
    await userEvent.clear(screen.getByLabelText('Nombre del grupo'));
    await save();
    expect(await screen.findByText('Escribe un nombre para el grupo.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('409 STALE_STATE recarga el grupo y avisa que hay que revisar los cambios', async () => {
    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'STALE_STATE', 'El grupo cambió.'));
    mockedGet.mockResolvedValueOnce({ ...ownerGroup, version: 9 });
    const { onGroupChange } = renderForm();

    await userEvent.clear(screen.getByLabelText('Nombre del grupo'));
    await userEvent.type(screen.getByLabelText('Nombre del grupo'), 'Otro');
    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Otra persona modificó el grupo. Lo recargamos',
    );
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith({ ...ownerGroup, version: 9 }));
  });

  it('SLOTS_BELOW_MEMBERS marca los cupos con details.minSlots', async () => {
    mockedUpdate.mockRejectedValueOnce(
      new ApiError(422, 'SLOTS_BELOW_MEMBERS', 'Cupos bajo los miembros.', {
        rule: 'RF-001-14',
        minSlots: 3,
      }),
    );
    renderForm();
    await userEvent.clear(screen.getByLabelText('Cupos (contándote)'));
    await userEvent.type(screen.getByLabelText('Cupos (contándote)'), '2');
    await save();
    expect(
      await screen.findByText('Los cupos no pueden bajar de 3: ya hay 3 personas en el grupo.'),
    ).toBeInTheDocument();
  });

  it('acepta también 422 BUSINESS_RULE con rule RF-001-14 para los cupos bajo los miembros', async () => {
    mockedUpdate.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'Cupos bajo los miembros.', {
        rule: 'RF-001-14',
        minSlots: 4,
      }),
    );
    renderForm();
    await userEvent.clear(screen.getByLabelText('Cupos (contándote)'));
    await userEvent.type(screen.getByLabelText('Cupos (contándote)'), '3');
    await save();
    expect(await screen.findByText(/Los cupos no pueden bajar de 4/)).toBeInTheDocument();
  });

  it('con el grupo cerrado el formulario está en solo lectura', () => {
    renderForm({ ...ownerGroup, status: 'cerrado' }, true);
    expect(screen.getByLabelText('Nombre del grupo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
});
