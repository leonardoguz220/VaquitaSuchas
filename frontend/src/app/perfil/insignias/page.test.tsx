import { render, screen } from '@testing-library/react';
import { BADGES_PATH, isPublicPath } from '@/lib/routes';
import { getMyBadges } from '@/services/reputation';
import { MOCK_BADGES } from '@/services/reputation.mock';
import BadgesPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/perfil/insignias',
}));
jest.mock('@/services/reputation', () => ({ getMyBadges: jest.fn() }));

describe('/perfil/insignias (T021): ruta', () => {
  it('RF-007-07: el título es "Mis insignias", la ruta es protegida y apunta a /perfil/insignias', async () => {
    expect(metadata.title).toBe('Mis insignias');
    expect(BADGES_PATH).toBe('/perfil/insignias');
    expect(isPublicPath(BADGES_PATH)).toBe(false);
    jest.mocked(getMyBadges).mockResolvedValue(MOCK_BADGES.withBadges);
    render(<BadgesPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis insignias' }),
    ).toBeInTheDocument();
  });
});
