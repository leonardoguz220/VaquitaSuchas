# Guía de validación — Spec 010: Solicitudes de ingreso y chat

Prerrequisito: specs 000, 001, 002 y 003 en local. Un grupo con titular habilitado, con cupo y con la ventana de ingreso abierta (recién creado, o con corte hoy). Dos cuentas: **titular** y **solicitante**. Las pruebas de plazos usan `FakeClock`.

## 1. Flujo feliz (CA-010-01, 04, 07, 11, 12, 36)

1. Solicitante: `POST /join-requests` con el código → `abierta`; el número de miembros no cambia.
2. Titular: `POST /join-requests/<id>/payment-data` → `esperando_pago`; `quote.amountCents` = `floor(total / (miembros + 1))` (Bs 90,00 con 2 miembros → Bs 30,00) y el plazo es de 15 minutos.
3. Solicitante: `POST /join-requests/<id>/proof` con JPG, `method=qr`, `reference=TX-77` → `pago_informado` (60 min para decidir).
4. Titular: `POST /join-requests/<id>/confirm` → `aceptada`; el solicitante figura en `GET /groups/<id>` y `GET /groups/<id>/charges` muestra su cobro de ingreso `pagado` con origen `ingreso`.
5. `POST /internal/jobs/tick?job=billing.generate`: no se crea un segundo cobro para ese período; en el siguiente corte llega su cobro regular.

```bash
npm run test -w backend -- join-requests.flow
```

## 2. Plazos (CA-010-09, 10, 14, 15, 38, 39, 42)

- Solicitud `esperando_pago` sin comprobante: a los 15 min `GET` la muestra `expirada` aunque la tarea no haya corrido, y el cupo vuelve a estar libre.
- Comprobante a los 16 min → `422 PAYMENT_DEADLINE_PASSED`.
- Prórroga: `POST …/extend` suma 15 min; la segunda → `422 ALREADY_EXTENDED`.
- `pago_informado` sin decisión: recordatorio a los 30 min, `expirada` con `titular_sin_respuesta` a los 60.
- Solicitud `abierta` el día 3 a las 23:50: pasada la medianoche puede completarse, pero el titular no puede enviar datos de pago a otras `abiertas`.

## 3. Cupos y concurrencia (CA-010-06)

Con un solo cupo y dos solicitudes `abiertas`, dos `payment-data` simultáneos: uno responde `200`, el otro `422 NO_SLOTS_AVAILABLE`.

## 4. Chat (CA-010-19 a 24)

- Intercambiar texto e imagen JPG de 3 MB; el otro lado los ve con `GET …/messages?afterSeq=` en el siguiente sondeo.
- 1.001 caracteres o un PDF → rechazados. `<script>` se devuelve tal cual, como texto.
- `PATCH`/`DELETE` sobre un mensaje → `404`. En estado final, enviar → `422 CHAT_READ_ONLY`.
- Tercera persona: miembro del grupo → `403`; ajena → `404`.

## 5. Reclamos (CA-010-27 a 31, 43, 46)

1. Titular rechaza un `pago_informado` marcando el comprobante como falso → `rechazada`.
2. Titular: `POST …/disputes` (tipo `comprobante_falso`); el solicitante responde.
3. Administrador (spec 009): abre la evidencia (queda en el log de auditoría) y resuelve `estafa_confirmada` → el solicitante queda baneado y sus datos bloqueados.

## 6. Retención (CA-010-44)

```bash
npm run test -w backend -- join-requests.retention
```
**Esperado:** a los 2 meses del estado final se borran chat, imágenes y comprobante y se conserva la línea de tiempo; con un reclamo abierto no se borra nada.
