import { render, screen } from '@testing-library/react';
import { isPublicPath, REPUTATION_PATH } from '@/lib/routes';
import { getMyReputation } from '@/services/reputation';
import { MOCK_REPUTATION } from '@/services/reputation.mock';
import ReputationPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/perfil/reputacion',
}));
jest.mock('@/services/reputation', () => ({ getMyReputation: jest.fn() }));

describe('/perfil/reputacion (T015): ruta', () => {
  it('RF-007-04: el título es "Mi reputación", la ruta es protegida y apunta a /perfil/reputacion', async () => {
    expect(metadata.title).toBe('Mi reputación');
    expect(isPublicPath(REPUTATION_PATH)).toBe(false);
    jest.mocked(getMyReputation).mockResolvedValue(MOCK_REPUTATION.hostEligible);
    render(<ReputationPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi reputación' }),
    ).toBeInTheDocument();
  });
});
