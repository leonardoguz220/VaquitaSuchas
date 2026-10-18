/**
 * Protección de rutas (RF-000-15, plan 000 §6): sin la cookie `vq_session`, las rutas que no
 * son públicas redirigen a `/ingresar?next=<ruta original>`. Solo mira si la cookie existe; si
 * es válida lo decide el backend respondiendo 401 a través del proxy `/api`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { buildLoginRedirect, isPublicPath } from '@/lib/routes';
import { SESSION_COOKIE } from '@/lib/session-cookies';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(buildLoginRedirect(pathname, search), request.url));
}

export const config = {
  // Excluye el proxy /api, los recursos de Next y los archivos estáticos (con extensión).
  matcher: ['/((?!api(?:/|$)|_next/|favicon\\.ico$|.*\\.[A-Za-z0-9]+$).*)'],
};
