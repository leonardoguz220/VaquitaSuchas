# Guía de validación — Spec 005: Notificaciones

Prerrequisito: specs 000, 001, 002 y 003 en local; en desarrollo el correo sale al registro de consola (`MAIL_PROVIDER=console`) y el bot de Telegram es el simulado de la spec 000. Pruebas de tiempo con `FakeClock`.

## 1. Avisos en la app (parte A: CA-005-01, 05, 07, 09, 21, 22, 25)

1. Generar un cobro (`POST /internal/jobs/tick?job=billing.generate`): el miembro tiene una notificación con monto y vencimiento en `GET /notifications`.
2. El miembro sube un comprobante: el titular recibe «comprobante subido» al instante. El titular rechaza con motivo: el miembro ve el motivo en su aviso.
3. Una segunda cuenta no ve esos avisos. `POST /notifications/read-all` deja el contador en cero.

## 2. Avisos programados (parte B: CA-005-02 a 04, 06, 08, 10, 24)

```bash
npm run test -w backend -- notifications.schedule
```
**Esperado:** con corte el día 15, el día 13 a las 08:00 de La Paz cada miembro recibe el aviso previo («estimado»); el recordatorio de vencimiento llega el día anterior al último día de pago y no se genera si el cobro está pagado; ejecutar la tarea dos veces no duplica; un correo programado a las 21:00 espera a las 08:00.

## 3. Correo, preferencias y reintentos (CA-005-11 a 13, 19, 20)

- Desactivar `email.recordatorios` en `PUT /notification-preferences`: el recordatorio queda en la app y no genera correo.
- Con el proveedor de correo simulado caído, subir un comprobante funciona; el envío reintenta a los 5 min, 30 min y 2 h y luego queda `failed`.
- El enlace de desactivación del correo abre `/avisos/desactivar?token=…`; confirmar apaga ese tipo.

## 4. Invitaciones y WhatsApp (CA-005-14 a 18)

- Titular: `POST /groups/<id>/invitations` con un correo → el invitado recibe el enlace `/unirse?codigo=…`. El undécimo en una hora → `429`.
- `GET /groups/<id>/invitation-share` y `GET /charges/<id>/reminder-share` devuelven texto y número; el botón del frontend abre `wa.me`.

## 5. Solicitudes de ingreso (CA-005-25 a 29)

Con el flujo de la spec 010: el titular recibe aviso de la solicitud nueva y del comprobante (con plazo de 60 min), un único recordatorio a los 30 min; el solicitante, el aviso de datos de pago (15 min). Varios mensajes seguidos del chat generan un solo aviso por tanda sin leer.

## 6. Telegram (parte C: CA-005-30 a 34)

En `/dev/telegram`: tras verificar el celular el usuario ya recibe avisos por el bot simulado; el bot bloqueado (`my_chat_member`) desactiva solo ese canal y el aviso en la app sigue visible.
