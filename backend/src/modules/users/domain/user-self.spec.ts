import { toUserSelf } from './user-self.js';

describe('toUserSelf', () => {
  const row = {
    id: 'u1',
    full_name: 'Ana Prueba',
    email: 'ana@example.com',
    phone_e164: '+59171234567',
    role: 'usuario' as const,
    last_login_at: null,
    created_at: new Date('2026-10-19T12:00:00Z'),
  };

  it('CA-003-31: la CI de la propia cuenta sale enmascarada', () => {
    const self = toUserSelf(row, '1234567');
    expect(self.ciMasked).toBe('*****567');
    expect(JSON.stringify(self)).not.toContain('1234567');
  });

  it('RF-003-09: lastLoginAt es null sin inicios de sesión y ISO con ellos', () => {
    expect(toUserSelf(row, '1234567').lastLoginAt).toBeNull();
    const logged = toUserSelf(
      { ...row, last_login_at: new Date('2026-10-19T13:00:00Z') },
      '1234567',
    );
    expect(logged.lastLoginAt).toBe('2026-10-19T13:00:00.000Z');
  });
});
