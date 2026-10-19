import { render, screen } from '@testing-library/react';
import { getJoinRequestsSummary } from '@/services/join-requests';
import { RequestsNavLink } from './requests-nav-link';

jest.mock('@/services/join-requests', () => ({
  ...jest.requireActual('@/services/join-requests'),
  getJoinRequestsSummary: jest.fn(),
}));

const mockedSummary = jest.mocked(getJoinRequestsSummary);

beforeEach(() => mockedSummary.mockReset());

describe('enlace Solicitudes de la barra (spec 010 T018, RF-010-26)', () => {
  it('RF-010-26: suma los mensajes no leídos y las solicitudes por atender', async () => {
    mockedSummary.mockResolvedValue({
      unreadMessages: 2,
      actionableAsHost: 1,
      activeAsApplicant: 0,
    });
    render(<RequestsNavLink />);

    const link = await screen.findByRole('link', { name: 'Solicitudes, 3 avisos' });
    expect(link).toHaveAttribute('href', '/solicitudes');
  });

  it('RF-010-26: sin avisos muestra solo el nombre', async () => {
    mockedSummary.mockResolvedValue({
      unreadMessages: 0,
      actionableAsHost: 0,
      activeAsApplicant: 1,
    });
    render(<RequestsNavLink />);

    expect(await screen.findByRole('link', { name: 'Solicitudes' })).toBeVisible();
  });

  it('RF-010-26: si la consulta falla el enlace sigue visible', async () => {
    mockedSummary.mockRejectedValue(new Error('sin red'));
    render(<RequestsNavLink />);

    expect(screen.getByRole('link', { name: 'Solicitudes' })).toBeVisible();
  });
});
