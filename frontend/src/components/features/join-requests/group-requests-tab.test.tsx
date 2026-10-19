import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hostAwaitingRequest, hostOpenRequest } from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import { listGroupJoinRequests, type GroupJoinRequestsPage } from '@/services/join-requests';
import { GROUP_REQUESTS_MESSAGES, GroupRequestsTab } from './group-requests-tab';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/g7',
}));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  listGroupJoinRequests: jest.fn(),
}));

const mockedList = jest.mocked(listGroupJoinRequests);
const GROUP_ID = 'g7';

const page: GroupJoinRequestsPage = {
  items: [hostOpenRequest, hostAwaitingRequest],
  nextCursor: null,
  slots: { total: 4, members: 2, reserved: 1, available: 1 },
};

beforeEach(() => mockedList.mockReset());

describe('pestaña Solicitudes del titular (spec 010 T018, RF-010-26)', () => {
  it('RF-010-26: muestra los cupos y la cola con estado, sin calcular nada en el cliente', async () => {
    mockedList.mockResolvedValue(page);
    render(<GroupRequestsTab groupId={GROUP_ID} />);

    const slots = await screen.findByText('Disponibles');
    expect(within(slots.parentElement as HTMLElement).getByText('1')).toBeVisible();
    expect(mockedList).toHaveBeenCalledWith(GROUP_ID, { limit: 20 });

    // Las dos solicitudes de la prueba son de la misma persona: se distinguen por su enlace.
    const [first, second] = screen.getAllByRole('link', {
      name: new RegExp(hostOpenRequest.applicant.fullName),
    });
    expect(first).toHaveAttribute('href', `/solicitudes/${hostOpenRequest.id}`);
    expect(within(first).getByText('Abierta')).toBeVisible();
    expect(second).toHaveAttribute('href', `/solicitudes/${hostAwaitingRequest.id}`);
  });

  it('RF-010-26: sin solicitudes muestra el texto vacío', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null, slots: page.slots });
    render(<GroupRequestsTab groupId={GROUP_ID} />);
    expect(await screen.findByText(GROUP_REQUESTS_MESSAGES.empty)).toBeVisible();
  });

  it('RF-010-26: un error muestra Reintentar y lo vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión'));
    mockedList.mockResolvedValueOnce(page);
    render(<GroupRequestsTab groupId={GROUP_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Disponibles')).toBeVisible();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('RF-010-04: si la ventana está cerrada muestra la fecha de apertura', async () => {
    const closed = {
      ...hostOpenRequest,
      entryWindow: { isOpen: false, opensAt: '2026-10-25T04:00:00.000Z', closesAt: null },
    };
    mockedList.mockResolvedValue({ items: [closed], nextCursor: null, slots: page.slots });
    render(<GroupRequestsTab groupId={GROUP_ID} />);
    expect(await screen.findByText(/El ingreso a este grupo se abre el/)).toBeVisible();
  });
});
