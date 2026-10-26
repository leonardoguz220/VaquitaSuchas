# Guía de validación — Spec 002: Cobros y pagos

Prerrequisito: specs 000, 001 y 003 en local, un grupo con un titular y dos miembros (seed de desarrollo) y el reloj de prueba (`FakeClock` de la spec 000, que usan las pruebas de integración para avanzar días sin esperar; las pruebas manuales en vivo solo cubren los pasos que no dependen de la fecha).

## 1. Generación idempotente (CA-002-01 a 03, 22)

```bash
npm run test -w backend -- billing.generate
```
**Esperado:** con 3 miembros (titular incluido) se generan exactamente 2 cobros `pendiente`; ejecutar el proceso otra vez no duplica; el día de cobro 31 en febrero resulta 28 (29 en 2028); tras simular una caída en la fecha de corte, el siguiente tick crea los cobros faltantes.

En vivo: `curl -X POST -H "X-Jobs-Token: $JOBS_TOKEN" "$API/internal/jobs/tick?job=billing.generate"` dos veces; `GET /groups/<id>/billing/summary` muestra un solo cobro por miembro.

Para generar el ciclo siguiente en local o en E2E (solo `NODE_ENV` `development`/`test`; en producción responde 400): `curl -X POST -H "X-Jobs-Token: $JOBS_TOKEN" "$API/internal/jobs/tick?job=billing.generate&now=2026-11-15"`. Después, confirmar, rechazar o registrar pago manual de ese cobro funciona igual (el servidor usa `issued_at` como hora mínima fuera de producción). Contrato: `specs/000-setup-del-proyecto/contracts/api.md`.

## 2. Pagar y confirmar (CA-002-04 a 08, 26, 27)

1. Miembro: `POST /charges/<id>/receipts` con un JPG de 2 MB, `method=qr`, `reference=TX-1001` → cobro `en_revision`.
2. Con un archivo de 6 MB o un `.exe` → `413` / `415`, el estado no cambia. Sin `reference` → `400`.
3. Otro cobro del mismo grupo con `reference=tx-1001` → `409 REFERENCE_ALREADY_USED`.
4. Titular: `POST /charges/<id>/reject` con motivo de 5–200 caracteres → vuelve a `pendiente`; el miembro ve `lastRejection`. Sin motivo → `400`. Con `TX-1001` ahora sí se puede reusar.
5. Titular: `POST /charges/<id>/confirm` → `pagado`.

## 3. Permisos (CA-002-12, 13, 23)

- Miembro llama `confirm` sobre su cobro → `403`. Miembro pide `GET /charges/<id>/receipts/<r>/file` de otro miembro → `403`. Usuario ajeno al grupo → `404`.

## 4. Atrasos y retiro (CA-002-09, 10, 28 a 32)

```bash
npm run test -w backend -- billing.overdue
```
**Esperado:** con corte el día 15, el cobro `pendiente` pasa a `atrasado` a las 00:00 del día 19 (La Paz) y el miembro deja de ser miembro; un cobro `en_revision` no cambia; un rechazo después del vencimiento deja `atrasado` sin retiro; el miembro retirado sube su comprobante, el titular confirma y el cobro queda `pagado` sin devolverlo al grupo; un retirado no ve nada más del grupo (`GET /groups/<id>` → `404`).

## 5. Resumen e historial (CA-002-17, 18, 20)

`GET /groups/<id>/billing/summary` como miembro: estado y monto de todos, sin comprobantes ni referencias. Como titular: `ownerTotals` con `expected = collected + pending + overdue`.

## 6. Retención (CA-002-33)

```bash
npm run test -w backend -- billing.retention
```
**Esperado:** a un grupo cerrado hace más de 2 meses se le eliminan los archivos; los cobros, montos y estados quedan y `GET …/file` responde `410`.
