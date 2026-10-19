import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  catalogServices,
  netflixDetail,
  netflixPlans,
} from '@/components/features/catalog/__fixtures__/catalog';
import { NewGroupWizard } from '@/components/features/groups/new-group-wizard';
import { isPublicPath } from '@/lib/routes';
import { getService, listServices } from '@/services/catalog';
import { ApiError } from '@/services/http';
import NewGroupPage, { metadata } from './page';

jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listServices: jest.fn(),
  getService: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/nuevo',
}));

const mockedList = jest.mocked(listServices);
const mockedGet = jest.mocked(getService);

const CUSTOM = /¿No está tu servicio\? Crear uno personalizado/;

beforeEach(() => {
  mockedList.mockReset();
  mockedGet.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
  mockedList.mockResolvedValue({ items: catalogServices, nextCursor: null });
  mockedGet.mockResolvedValue(netflixDetail);
});

async function chooseNetflix(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Netflix/ }));
  await screen.findByRole('radiogroup', { name: 'Plan' });
}

describe('/grupos/nuevo, pasos 1 y 2 (T011, plan 001 §6 y plan 004 §6)', () => {
  it('RF-004-05: la pestaña se titula «Crear suscripción» y la ruta exige sesión', () => {
    expect(metadata.title).toBe('Crear suscripción');
    expect(isPublicPath('/grupos/nuevo')).toBe(false);
  });

  it('RF-004-02: la página arranca en «Paso 1 de 3: servicio» con el listado del catálogo', async () => {
    render(<NewGroupPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Crear suscripción' })).toBeVisible();
    expect(screen.getByText('Paso 1 de 3: servicio')).toBeVisible();
    expect(await screen.findByRole('button', { name: /Netflix/ })).toBeVisible();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('RF-004-05: elegir un servicio pasa a «Paso 2 de 3: plan» con sus planes', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await chooseNetflix(user);

    expect(screen.getByText('Paso 2 de 3: plan')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Elige el plan de Netflix' }),
    ).toHaveFocus();
    expect(mockedGet).toHaveBeenCalledWith('netflix', { signal: expect.any(AbortSignal) });
    expect(screen.getAllByRole('radio')).toHaveLength(netflixPlans.length);
  });

  it('RF-004-05: «Volver» del paso 2 regresa al paso 1 sin volver a pedir la lista', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await chooseNetflix(user);

    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Paso 1 de 3: servicio')).toBeVisible();
    expect(screen.getByRole('button', { name: /Spotify/ })).toBeVisible();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('CA-004-04: al elegir un plan llama a onComplete con el servicio y el plan de la API y muestra el resumen', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    render(<NewGroupWizard onComplete={onComplete} />);
    await chooseNetflix(user);

    await user.click(screen.getByRole('radio', { name: /Premium/ }));
    await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));

    expect(onComplete).toHaveBeenCalledWith({
      service: netflixDetail.service,
      plan: netflixPlans[2],
    });
    expect(screen.getByText('Paso 3 de 3: datos del grupo')).toBeVisible();
    const summary = screen.getByRole('list', { name: 'Lo que elegiste' });
    expect(within(summary).getByText('Netflix')).toBeVisible();
    expect(within(summary).getByText('Premium')).toBeVisible();
  });

  it('RF-004-09: «Crear uno personalizado» llama a onComplete({ custom: true }) sin pedir planes', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    render(<NewGroupWizard onComplete={onComplete} />);

    await user.click(await screen.findByRole('button', { name: CUSTOM }));

    expect(onComplete).toHaveBeenCalledWith({ custom: true });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.getByText('Paso 3 de 3: datos del grupo')).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Lo que elegiste' })).getByText('Personalizado'),
    ).toBeVisible();
  });

  it('RF-004-05: desde el paso 3, «Volver» regresa al paso que corresponde', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    await user.click(await screen.findByRole('button', { name: CUSTOM }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Paso 1 de 3: servicio')).toBeVisible();

    await chooseNetflix(user);
    await user.click(screen.getByRole('radio', { name: /Estándar/ }));
    await user.click(screen.getByRole('button', { name: 'Siguiente: datos del grupo' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Paso 2 de 3: plan')).toBeVisible();
  });

  it('RF-004-05: un 404 del servicio permite volver al paso 1 y recarga la lista', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No existe.'));
    render(<NewGroupWizard />);
    await user.click(await screen.findByRole('button', { name: /Netflix/ }));

    expect(await screen.findByText(/Este servicio ya no está disponible/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Elegir otro servicio' }));

    expect(screen.getByText('Paso 1 de 3: servicio')).toBeVisible();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('CA-004-09: un 401 al cargar el catálogo redirige a /ingresar?next=/grupos/nuevo', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.'));
    render(<NewGroupWizard />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('CA-004-09: un 401 al cargar los planes también redirige', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.'));
    render(<NewGroupWizard />);
    await user.click(await screen.findByRole('button', { name: /Netflix/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo'));
  });

  it('RF-004-02: el frontend no calcula nada: muestra los montos de la API tal cual en ambos pasos', async () => {
    const user = userEvent.setup();
    render(<NewGroupWizard />);
    expect(await screen.findByRole('button', { name: /Tigo Play/ })).toHaveTextContent(
      'desde Bs 25,51',
    );
    await chooseNetflix(user);
    expect(screen.getByRole('radio', { name: /Premium/ })).toHaveAccessibleName(
      /USD 22,99.*Hasta 4 cupos \(titular incluido\).*Precio individual: USD 11,99/,
    );
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cada miembro|ahorr|cuota/i)).not.toBeInTheDocument();
  });
});
