/**
 * Pasa el enlace de verificación de `/registro` a `/registro/verificar` (T024).
 *
 * El secreto de registro ya está en la cookie httpOnly `vq_reg` (lo guardó el proxy), así que
 * aquí solo se guarda lo que el navegador puede ver: `telegramUrl` y `expiresAt`. Va en
 * `sessionStorage` (se borra al cerrar la pestaña) y no en la URL, para que el token del bot
 * no quede en el historial. T024 lo lee con `readRegisterVerification()` y, si falta,
 * reconsulta `GET /auth/register/status` o pide un enlace nuevo.
 */
import type { RegisterVerification } from '@/services/auth';

export const REGISTER_VERIFICATION_KEY = 'vaquita.register.verification';

/** Guarda la verificación; si el almacenamiento no está disponible, no hace nada. */
export function saveRegisterVerification(verification: RegisterVerification): void {
  try {
    window.sessionStorage.setItem(REGISTER_VERIFICATION_KEY, JSON.stringify(verification));
  } catch {
    // Modo privado o almacenamiento lleno: /registro/verificar reconsulta el estado.
  }
}

/** Lee la verificación guardada, o `null` si no hay o no tiene la forma esperada. */
export function readRegisterVerification(): RegisterVerification | null {
  try {
    const raw = window.sessionStorage.getItem(REGISTER_VERIFICATION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as RegisterVerification).telegramUrl === 'string' &&
      typeof (value as RegisterVerification).expiresAt === 'string'
    ) {
      const { telegramUrl, expiresAt } = value as RegisterVerification;
      return { telegramUrl, expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}
