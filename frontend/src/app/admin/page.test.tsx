import { redirect } from 'next/navigation';
import AdminHomePage from './page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

describe('/admin (plan 009 §6)', () => {
  it('RF-009-08: mientras no hay tablero, /admin lleva a Usuarios', () => {
    expect(() => AdminHomePage()).toThrow('NEXT_REDIRECT:/admin/usuarios');
    expect(jest.mocked(redirect)).toHaveBeenCalledWith('/admin/usuarios');
  });
});
