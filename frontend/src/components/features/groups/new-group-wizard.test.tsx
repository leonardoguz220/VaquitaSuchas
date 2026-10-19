import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { catalogServices, netflixDetail } from '@/components/features/catalog/__fixtures__/catalog';
import { getService, listServices } from '@/services/catalog';
import { createGroup, getHostEligibility, quoteGroup } from '@/services/groups';
import { ApiError } from '@/services/http';
import {
  createdGroup,
  eligibleHost,
  fullHost,
  notEligibleHost,
  quote,
} from './__fixtures__/groups';
import { NewGroupWizard } from './new-group-wizard';

jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listServices: jest.fn(),
  getService: jest.fn(),
}));

jest.mock('@/services/groups', () => ({
  getHostEligibility: jest.fn(),
  quoteGroup: jest.fn(),
  createGroup: jest.fn(),
  updatePaymentInfo: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedEligibility = jest.mocked(getHostEligibility);
const mockedCreate = jest.mocked(createGroup);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listServices).mockResolvedValue({ items: catalogServices, nextCursor: null });
  jest.mocked(getService).mockResolvedValue(netflixDetail);
  jest.mocked(quoteGroup).mockResolvedValue(quote);
  mockedEligibility.mockResolvedValue(eligibleHost);
  mockedCreate.mockResolvedValue(createdGroup);
});

async function createEstandar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Netflix/ }));
  await user.click(await screen.findByRole('radio', { name: /Estándar/ }));
  await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
  await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
  await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
  await user.click(screen.getByRole('button', { name: 'Crear suscripción' }));
  return screen.findByRole('heading', { name: '¡Listo! Creaste «Netflix del depa»' });
}

describe('Asistente /grupos/nuevo con habilitación y código (T016)', () => {
  it('CA-001-01 y CA-001-25: un titular habilitado crea en 3 pasos y ve el código de 8 caracteres', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    expect(await createEstandar(user)).toBeVisible();

    const code = screen.getByTestId('invite-code');
    expect(code).toHaveTextContent(/^[A-Z0-9]{8}$/);
    expect(code).toHaveTextContent('K7M2QX9P');
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver el grupo' })).toHaveAttribute(
      'href',
      `/grupos/${createdGroup.id}`,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-001-01: «Copiar» copia el código y lo confirma', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await createEstandar(user);
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');

    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith('K7M2QX9P');
    expect(await screen.findByText('Código copiado.')).toBeVisible();
  });

  it('CA-001-01: «Compartir» usa navigator.share con el código', async () => {
    const user = userEvent.setup();
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      render(<NewGroupWizard />);
      await createEstandar(user);
      await user.click(screen.getByRole('button', { name: 'Compartir' }));
      expect(share).toHaveBeenCalledWith({
        title: 'Vaquita',
        text: expect.stringContaining('K7M2QX9P'),
      });
    } finally {
      Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('CA-001-01: sin navigator.share, «Compartir» cae a copiar el código', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await createEstandar(user);
    expect(navigator.share).toBeUndefined();
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');

    await user.click(screen.getByRole('button', { name: 'Compartir' }));
    expect(writeText).toHaveBeenCalledWith('K7M2QX9P');
    expect(await screen.findByText('Código copiado.')).toBeVisible();
  });

  it('CA-001-24: quien no está habilitado ve sus estrellas y cobros frente a lo que se pide, o la habilitación de un administrador', async () => {
    mockedEligibility.mockResolvedValue(notEligibleHost);
    const user = userEvent.setup();
    render(<NewGroupWizard />);

    const dialog = await screen.findByRole('dialog', {
      name: 'Todavía no puedes crear suscripciones',
    });
    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Estrellas de puntualidad');
    expect(items[0]).toHaveTextContent('Tienes: 4,0 (Bueno)');
    expect(items[0]).toHaveTextContent('Se pide: 4,5 o más');
    expect(items[1]).toHaveTextContent('últimos 12 meses');
    expect(items[1]).toHaveTextContent('Tienes: 3');
    expect(items[1]).toHaveTextContent('Se pide: 6 o más');
    expect(dialog).toHaveTextContent('que un administrador te habilite como titular');

    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver qué me falta' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('CA-001-24: sin habilitación se puede recorrer el asistente pero no crear', async () => {
    mockedEligibility.mockResolvedValue(notEligibleHost);
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Entendido' }),
    );
    await user.click(
      screen.getByRole('button', { name: /¿No está tu servicio\? Crear uno personalizado/ }),
    );
    expect(screen.getByRole('button', { name: 'Crear suscripción' })).toBeDisabled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('CA-001-28: con 5 grupos activos (canCreateMore false) explica el límite', async () => {
    mockedEligibility.mockResolvedValue(fullHost);
    render(<NewGroupWizard />);
    const dialog = await screen.findByRole('dialog', { name: 'Llegaste al límite de grupos' });
    expect(dialog).toHaveTextContent('Ya eres titular de 5 grupos activos y el máximo es 5.');
    expect(dialog).toHaveTextContent('Como miembro puedes estar en todos los grupos que quieras.');
    expect(screen.getByText('Ya llegaste al límite de grupos activos como titular.')).toBeVisible();
  });

  it('CA-001-24: si al crear llega NOT_HOST_ELIGIBLE, vuelve a consultar y abre el panel', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(422, 'NOT_HOST_ELIGIBLE', 'x', { rule: 'RF-001-21' }),
    );
    mockedEligibility.mockResolvedValueOnce(eligibleHost).mockResolvedValue(notEligibleHost);
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await user.click(await screen.findByRole('button', { name: /Netflix/ }));
    await user.click(await screen.findByRole('radio', { name: /Estándar/ }));
    await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    await user.type(screen.getByLabelText('Nombre del grupo'), 'Netflix del depa');
    await user.type(screen.getByLabelText('Tipo de cambio (Bs por USD)'), '6,96');
    await user.click(screen.getByRole('button', { name: 'Crear suscripción' }));

    expect(
      await screen.findByRole('dialog', { name: 'Todavía no puedes crear suscripciones' }),
    ).toBeVisible();
    expect(mockedEligibility).toHaveBeenCalledTimes(2);
  });

  it('CA-001-24: si no se pudo consultar la habilitación, muestra el error con «Reintentar»', async () => {
    mockedEligibility.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos comprobar si puedes crear suscripciones.');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');

    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mockedEligibility).toHaveBeenCalledTimes(2);
  });
});

describe('Asistente /grupos/nuevo con el catálogo real (T012)', () => {
  it('RF-004-05: elegir un servicio pide su detalle con el slug y muestra sus planes tal como llegan', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard onComplete={jest.fn()} />);

    await user.click(await screen.findByRole('button', { name: /Netflix/ }));

    await waitFor(() =>
      expect(getService).toHaveBeenCalledWith('netflix', { signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByRole('radio', { name: /Estándar/ })).toBeVisible();
  });
});
