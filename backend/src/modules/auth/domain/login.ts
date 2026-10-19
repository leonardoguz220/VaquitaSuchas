// Puede iniciar sesión solo una cuenta activa y verificada (CA-003-18, 23; RF-003-05).
export function canLogin(account: {
  status: 'activo' | 'suspendido' | 'baneado';
  verified_at: Date | null;
}): boolean {
  return account.status === 'activo' && account.verified_at !== null;
}
