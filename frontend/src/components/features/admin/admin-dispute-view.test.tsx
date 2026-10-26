import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getAdminDispute,
  getAdminDisputeEvidence,
  resolveAdminDispute,
  type AdminDispute,
} from '@/services/admin-disputes';
import { ApiError } from '@/services/http';
import { AdminDisputeView } from './admin-dispute-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/reclamos/rec-1',
}));

jest.mock('@/services/admin-disputes', () => ({
  getAdminDispute: jest.fn(),
  getAdminDisputeEvidence: jest.fn(),
  resolveAdminDispute: jest.fn(),
}));

const getDispute = getAdminDispute as jest.MockedFunction<typeof getAdminDispute>;
const getEvidence = getAdminDisputeEvidence as jest.MockedFunction<typeof getAdminDisputeEvidence>;

const open: AdminDispute = {
  id: 'rec-1',
  type: 'pago_sin_ingreso',
  status: 'abierto',
  result: null,
  requesterName: 'Ana Quispe',
  accusedName: 'Kevin Rojas',
  groupName: 'Crunchyroll anime',
  quoteCents: 1200,
  reference: 'TRF-554210',
  createdAt: '2026-10-17T09:12:00Z',
  resolvedAt: null,
  hasResponse: true,
};

describe('AdminDisputeView (spec 009 T024)', () => {
  beforeEach(() => {
    getDispute.mockReset();
    getEvidence.mockReset();
    getDispute.mockResolvedValue(open);
  });

  it('CA-009-27: no carga la evidencia hasta pulsar Ver evidencia, y avisa que queda registrada', async () => {
    render(<AdminDisputeView disputeId="rec-1" />);

    expect(await screen.findByText(/queda registrada en auditoría/)).toBeInTheDocument();
    expect(getEvidence).not.toHaveBeenCalled();
  });

  it('CA-009-27: al pedir la evidencia la consulta una vez y muestra la línea de tiempo', async () => {
    getEvidence.mockResolvedValue({
      timeline: [{ at: '2026-10-16T19:41:00Z', label: 'Ana pidió el cupo' }],
      chat: [],
      receipt: null,
      quoteCents: 1200,
      descriptions: [],
      responses: [],
      openedAt: '2026-10-19T10:04:00Z',
    });
    const user = userEvent.setup();
    render(<AdminDisputeView disputeId="rec-1" />);

    await user.click(await screen.findByRole('button', { name: 'Ver evidencia' }));

    expect(await screen.findByText(/Ana pidió el cupo/)).toBeInTheDocument();
    expect(getEvidence).toHaveBeenCalledTimes(1);
    expect(getEvidence).toHaveBeenCalledWith('rec-1');
  });

  it('CA-009-25: Resolver reclamo queda deshabilitado hasta elegir un resultado', async () => {
    const user = userEvent.setup();
    render(<AdminDisputeView disputeId="rec-1" />);

    const resolve = await screen.findByRole('button', { name: 'Resolver reclamo' });
    expect(resolve).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /Estafa confirmada/ }));
    expect(resolve).toBeEnabled();
  });

  it('CA-009-26: un reclamo resuelto no ofrece resolver de nuevo', async () => {
    getDispute.mockResolvedValue({
      ...open,
      status: 'resuelto',
      result: 'sin_falta',
      resolvedAt: '2026-10-19T10:00:00Z',
    });
    render(<AdminDisputeView disputeId="rec-1" />);

    expect(await screen.findByText(/ya está resuelto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver reclamo' })).not.toBeInTheDocument();
  });

  it('CA-009-25: si ya estaba resuelto (409 INVALID_TRANSITION) avisa y recarga la ficha', async () => {
    (resolveAdminDispute as jest.Mock).mockRejectedValue(
      new ApiError(409, 'INVALID_TRANSITION', 'ya'),
    );
    const user = userEvent.setup();
    render(<AdminDisputeView disputeId="rec-1" />);

    await user.click(await screen.findByRole('radio', { name: /Sin falta/ }));
    await user.click(screen.getByRole('button', { name: 'Resolver reclamo' }));
    await user.type(await screen.findByLabelText(/Motivo/), 'Motivo suficientemente largo.');
    await user.click(screen.getAllByRole('button', { name: 'Resolver reclamo' }).at(-1)!);

    expect(await screen.findByText(/ya fue resuelto/)).toBeInTheDocument();
    expect(getDispute).toHaveBeenCalledTimes(2);
  });
});
