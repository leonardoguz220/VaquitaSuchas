/**
 * E2E del flujo feliz del MVP (spec 002 T043; CA-002-04, CA-002-06).
 *
 * Crear grupo → invitar (solicitud por código) → cobrar → pagar → confirmar. Usa los usuarios
 * del seed de desarrollo (`npm run seed:dev-users -w backend`). La contraseña sale de
 * `SEED_DEV_PASSWORD` del entorno y nunca se escribe aquí.
 */
import { test } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

test.describe('flujo feliz del MVP', () => {
  test.skip(!PASSWORD, 'Falta SEED_DEV_PASSWORD en el entorno');

  // Pendiente: el ciclo de pago del miembro (solicitud, datos de pago, confirmación del titular)
  // necesita el atajo de prueba que aún no existe en el backend (ver groups.spec.ts).
  test.fixme('CA-002-04/06: crear → invitar → cobrar → pagar → confirmar', async () => {});
});
