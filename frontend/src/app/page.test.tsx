import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import HomePage from './page';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const mockedCookies = jest.mocked(cookies);
const mockedRedirect = jest.mocked(redirect);

function withCookies(names: string[]) {
  mockedCookies.mockResolvedValue({
    has: (name: string) => names.includes(name),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe('HomePage (RF-000-16)', () => {
  beforeEach(() => mockedRedirect.mockClear());

  it('RF-000-16: con cookie de sesión redirige a /grupos', async () => {
    withCookies(['vq_session']);
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/grupos');
    expect(mockedRedirect).toHaveBeenCalledWith('/grupos');
  });

  it('RF-000-16: sin cookie de sesión redirige a /ingresar', async () => {
    withCookies([]);
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/ingresar');
    expect(mockedRedirect).toHaveBeenCalledWith('/ingresar');
  });

  it('RF-000-16: otra cookie distinta de la de sesión no cuenta como sesión', async () => {
    withCookies(['vq_reg']);
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/ingresar');
  });
});
