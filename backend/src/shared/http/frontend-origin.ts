// Origen del frontend permitido por CORS (RF-000-10). Un único origen exacto, sin comodines.

const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
// 1–65535, sin ceros a la izquierda.
const PORT = '(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])';

/**
 * Forma canónica que envía el navegador en `Origin`: `http(s)://host[:puerto]` en minúsculas,
 * sin credenciales, ruta, barra final, query ni fragmento. Nada de `*`: el host solo admite
 * letras, dígitos, guiones y puntos. Los hosts con IPv6 (`[::1]`) no se admiten a propósito.
 */
export const FRONTEND_ORIGIN_PATTERN = new RegExp(
  `^https?://${HOST_LABEL}(?:\\.${HOST_LABEL})*(?::${PORT})?$`,
);

/** Mensaje de validación: nombra la variable y la forma esperada, nunca el valor recibido. */
export const FRONTEND_ORIGIN_MESSAGE =
  'debe ser un origen http(s) sin ruta, barra final ni comodines, por ejemplo https://vaquita.example';

export function isFrontendOrigin(value: string): boolean {
  return FRONTEND_ORIGIN_PATTERN.test(value);
}

/**
 * Devuelve el origen configurado o `undefined` si la variable falta o está en blanco (CORS cerrado).
 * `validateEnv` ya lo comprueba al arrancar; esta segunda comprobación evita que un valor dudoso
 * llegue a abrir CORS si alguien llama a `configureApp` sin pasar por esa validación.
 */
export function normalizeFrontendOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  if (!isFrontendOrigin(value)) {
    throw new Error(`FRONTEND_ORIGIN: ${FRONTEND_ORIGIN_MESSAGE}`);
  }
  return value;
}
