import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGroupCharges } from '@/services/charges';
import { groupChargesPage, MOCK_BILLING_GROUP_IDS } from '@/services/group-billing.mock';
import { ApiError } from '@/services/http';
import { ReviewQueue } from './review-queue';

jest.mock('@/services/charges', () => ({ getGroupCharges: jest.fn() }));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getGroupCharges);
const OWNER = MOCK_BILLING_GROUP_IDS.owner;

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  mocked.mockImplementation(async (groupId, params) => groupChargesPage(groupId, params ?? {}));
});

describe('ReviewQueue: cola «Por revisar» del titular (T026)', () => {
  it('RF-002-10: lista los en_revision que filtra el servidor con monto, envío y enlace', async () => {
    render(<ReviewQueue groupId={OWNER} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    const list = await screen.findByRole('list', { name: 'Comprobantes por revisar' });
    expect(mocked).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ status: ['en_revision'] }),
      expect.anything(),
    );
    expect(list).toHaveTextContent('Diego Flores Paz');
    expect(list).toHaveTextContent('Bs 12,51 · Enviado el 18 oct 2026, 10:42');
    expect(
      screen.getByRole('link', { name: 'Revisar comprobante de Diego Flores Paz' }),
    ).toHaveAttribute('href', '/cobros/7a1c5e00-0000-4000-8000-000000001002');
  });

  it('sin cobros en revisión muestra el vacío', async () => {
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    render(<ReviewQueue groupId={OWNER} />);
    expect(await screen.findByText('No hay comprobantes por revisar')).toBeInTheDocument();
  });

  it('un error permite reintentar', async () => {
    mocked.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const user = userEvent.setup();
    render(<ReviewQueue groupId={OWNER} />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Diego Flores Paz')).toBeInTheDocument();
  });
});
