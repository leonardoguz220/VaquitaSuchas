# Guía de validación — Spec 007: Reputación

Prerrequisito: specs 000, 001, 002 y 003 en local. Un usuario con cobros de prueba (el seed de desarrollo crea uno con 8 cobros, 7 puntuales).

## 1. Calificación (CA-007-01, 02, 16, 18, 19)

```bash
npm run test -w backend -- reputation
```
**Esperado:** 9 de 10 → 4,5 «Bueno»; 7 de 8 → exacta 4,375 y mostrada 4,5; 19/20 → 5, 15/20 → 4, 11/20 → 3; con 2 cobros considerados → «Nuevo» sin estrellas; con 0 no falla.

En vivo: `GET /users/me/reputation` del usuario de prueba devuelve `stars: 4.5`, `level: "Bueno"`, `consideredCount: 8`, `host.eligible: true` (con 6 o más cobros y 4,5 estrellas).

## 2. Puntualidad con fechas de La Paz (CA-007-03, 04, 05, 24, 25)

Las pruebas `punctuality.spec.ts` usan un cobro con vencimiento el día 18: subida a las 23:30 del 18 → puntual; a las 00:05 del 19 → no puntual; rechazado a tiempo y vuelto a subir tarde → puntual; rechazo «comprobante inválido» → se mide con la última subida; retirado por mora que paga después → sigue tardío.

## 3. Habilitación para ser titular (CA-007-20 a 23)

1. Usuario con 6 cobros considerados y 4,5 estrellas: `POST /groups` funciona. Con 5 cobros, `422 NOT_HOST_ELIGIBLE` y `GET /users/me/reputation` explica qué falta.
2. Un cobro de ingreso no suma.
3. Habilitación manual (spec 009) con calificación baja: puede crear.

## 4. Actualización inmediata y reconciliación (CA-007-14, 15)

Confirmar un cobro como titular y volver a pedir `GET /users/me/reputation`: ya cambió, sin esperar a la tarea. Luego `POST /internal/jobs/tick?job=reputation.reconcile` informa `drift: 0`.

## 5. P2: ranking, insignias y reportes

Se validan al construir esa entrega: ranking con desempate y «Nuevo» sin posición (CA-007-10), `404` para ajenos, insignia «Racha 3» al tercer pago puntual y su conservación (CA-007-08, 09), exclusión de un cobro reportado (CA-007-13).
