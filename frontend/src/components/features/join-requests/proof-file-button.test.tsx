import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { awaitingPaymentRequest } from '@/services/__fixtures__/join-requests';
import { ApiError } from '@/services/http';
import { getProofFile } from '@/services/join-requests';
import { PROOF_FILE_MESSAGES, ProofFileButton } from './proof-file-button';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/solicitudes/jr1',
}));
jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  getProofFile: jest.fn(),
}));

const mockedFile = jest.mocked(getProofFile);
const SIGNED_URL = 'https://storage.example.com/comprobante.jpg?sig=abc';

function fakeTab() {
  return { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
}

let tab: ReturnType<typeof fakeTab>;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  mockedFile.mockReset();
  tab = fakeTab();
  openSpy = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
});

afterEach(() => openSpy.mockRestore());

describe('«Ver comprobante» del titular (spec 010 T027, RF-010-13)', () => {
  it('RF-010-13: abre el comprobante con el enlace firmado y sin opener', async () => {
    mockedFile.mockResolvedValue({
      url: SIGNED_URL,
      expiresAt: '2026-10-18T18:51:00.000Z',
      mime: 'image/jpeg',
    });
    render(<ProofFileButton requestId={awaitingPaymentRequest.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));

    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockedFile).toHaveBeenCalledWith(awaitingPaymentRequest.id);
    expect(tab.location.href).toBe(SIGNED_URL);
    expect(tab.opener).toBeNull();
  });

  it('RF-010-13: si el comprobante ya no existe avisa y cierra la pestaña', async () => {
    mockedFile.mockRejectedValue(new ApiError(410, 'FILE_DELETED', 'Eliminado'));
    render(<ProofFileButton requestId={awaitingPaymentRequest.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROOF_FILE_MESSAGES.deleted);
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
  });

  it('RF-010-13: si el navegador bloquea la ventana avisa sin pedir el enlace', async () => {
    openSpy.mockReturnValue(null);
    render(<ProofFileButton requestId={awaitingPaymentRequest.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROOF_FILE_MESSAGES.popupBlocked);
    expect(mockedFile).not.toHaveBeenCalled();
  });
});
