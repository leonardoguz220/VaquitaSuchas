import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOGIN_PATH } from '@/lib/routes';
import { SESSION_COOKIE } from '@/lib/session-cookies';

/** Pantalla de inicio de quien tiene sesión: Mis suscripciones (spec 001). */
const HOME_PATH = '/grupos';

/**
 * Raíz de la aplicación (plan 000 §6, RF-000-16): redirige a `/grupos` si hay cookie de
 * sesión y a `/ingresar` si no. Solo mira si la cookie existe; si el token no es válido,
 * el backend responde 401 y la sesión se cierra desde allí.
 */
export default async function HomePage(): Promise<never> {
  const cookieStore = await cookies();
  redirect(cookieStore.has(SESSION_COOKIE) ? HOME_PATH : LOGIN_PATH);
}
