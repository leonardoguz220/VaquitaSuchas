export type PasswordRule = 'min_length' | 'letter' | 'number' | 'not_email';

export const PASSWORD_MIN_LENGTH = 10;

// Devuelve las reglas incumplidas (RF-003-03); lista vacía = válida.
export function validatePassword(password: string, email: string): PasswordRule[] {
  const broken: PasswordRule[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) broken.push('min_length');
  if (!/\p{L}/u.test(password)) broken.push('letter');
  if (!/\p{N}/u.test(password)) broken.push('number');
  if (password.toLowerCase() === email.trim().toLowerCase()) broken.push('not_email');
  return broken;
}
