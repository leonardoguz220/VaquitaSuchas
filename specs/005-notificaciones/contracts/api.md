# Contrato de API — Spec 005: Notificaciones

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. Nadie ve las notificaciones de otra persona (CA-005-21): todos los endpoints trabajan sobre el usuario de la sesión.
- Marcado **[MVP]** lo que se construye con las specs 002 y 010 (avisos en la app); el resto es P1.

## Objetos

```ts
Notification {
  id; type: string; category: "recordatorios" | "resoluciones" | "titular" | "grupo";
  title: string; body: string;           // texto plano
  link: string | null;                   // ruta interna, p. ej. "/cobros/…"
  readAt: string | null; createdAt: string;
}

NotificationPreferences {
  email:    { recordatorios: boolean; resoluciones: boolean; titular: boolean; grupo: boolean };
  telegram: { recordatorios: boolean; resoluciones: boolean; titular: boolean; grupo: boolean;
              blocked: boolean };          // true si el usuario bloqueó el bot (RF-005-28)
  emailProblem: boolean;                   // rebote permanente
  securityEmailsAlwaysOn: true;            // informativo (RF-005-17)
}
```

## Endpoints: centro de notificaciones [MVP]

### `GET /notifications` (RF-005-01, RF-005-02; CA-005-21)
- **Query:** `unread` (boolean), `limit`, `cursor`. **Response 200:** `{ items: Notification[], nextCursor, unreadCount }`. Ordenadas de la más reciente a la más antigua. Responde en < 300 ms con 1.000 registros.

### `GET /notifications/unread-count`
- **Response 200:** `{ unreadCount }`. El cliente lo consulta cada 30 s.

### `POST /notifications/:id/read` y `POST /notifications/read-all` (CA-005-22)
- **Response 204.** Una notificación de otra persona responde `404`.

## Endpoints: preferencias y desactivación [P1]

### `GET /notification-preferences` y `PUT /notification-preferences` (RF-005-17; CA-005-11, 32)
- **Request (PUT):** `{ email: {…}, telegram: {…} }`. Las notificaciones dentro de la app no se pueden desactivar (RF-005-03): no existe un campo para ello. Los correos de seguridad no aparecen.

### `POST /notification-preferences/telegram/reactivate` (RF-005-28; CA-005-33)
- Quita `telegram_blocked_at` si el usuario vuelve a iniciar el bot. **Response 200:** preferencias.

### `POST /notifications/unsubscribe` (RF-005-18; CA-005-13)
- **Auth:** pública con token firmado. **Request:** `{ token }`; el token es un HMAC del usuario, la categoría y el canal (`email`), sin vencimiento. **Response 200:** `{ category }` y desactiva ese tipo de correo. El enlace del correo abre la página `/avisos/desactivar?token=…`, que confirma con este `POST` (el `GET` no cambia nada, para que los lectores de correo no lo activen por accidente). **Errores:** `400` token inválido.

## Endpoints: invitaciones y WhatsApp [P1]

### `POST /groups/:groupId/invitations` (RF-005-14; CA-005-14, 16)
- **Auth:** titular del grupo (`403` miembro, `404` ajeno). **Request:** `{ email }`. **Response 202:** `{ status: "pendiente" }`. El correo lleva el enlace `{APP_URL}/unirse?codigo=XXXXXXXX` y el código; **la respuesta no revela** si el correo pertenece al grupo (caso borde).
- **Errores:** `400 VALIDATION_ERROR` (correo inválido), `429 RATE_LIMITED` (10 por hora por titular, `details.retryAfterSeconds`), `422 GROUP_CLOSED`, `422 GROUP_FROZEN`.

### `GET /groups/:groupId/invitation-share` (RF-005-15; CA-005-17)
- **Auth:** titular. **Response 200:** `{ inviteUrl, text }` — el texto prellenado para que el cliente arme `https://wa.me/?text=…`. **El servidor no envía nada.**

### `GET /charges/:chargeId/reminder-share` (RF-005-16; CA-005-18)
- **Auth:** titular del grupo del cobro. **Response 200:** `{ phone: "+59171234567", text }` con el monto, el período y el vencimiento; el cliente arma `https://wa.me/<número sin +>?text=…`. Solo para cobros `pendiente` o `atrasado` de miembros activos. **Errores:** `422 BUSINESS_RULE` (`CHARGE_NOT_COLLECTABLE`).

## Tareas programadas

| Tarea | Frecuencia | Efecto | Entrega |
|---|---|---|---|
| `notifications.schedule` | cada tick (5 min); actúa una vez al día a partir de las 08:00 de La Paz | Genera el aviso previo (2 días antes del corte), el recordatorio de vencimiento (1 día antes) y el recordatorio de 48 h al titular; recupera lo que falte si el servicio estuvo caído (CA-005-02, 03, 04, 06, 08, 10) | P1 |
| `notifications.deliver` | cada tick | Envía correos y mensajes de Telegram pendientes con reintentos y ventana horaria | P1 |
| `notifications.purge` | diaria | Elimina notificaciones de más de 90 días y direcciones de invitaciones de más de 30 días (CA-005-23) | P1 |

## Servicios internos

| Servicio | Lo usan | Qué hace |
|---|---|---|
| `NotificationService.notify(tx, input)` [MVP] | Manejadores de eventos de 001, 002, 009, 010 | Crea la notificación con su `dedupe_key` y, según las preferencias, los envíos por canal (en una sola transacción con el hecho que la origina). |
| `NotificationService.cancelForEntity(tx, entityType, entityId, types)` | Spec 002 (RN-005-02) | Marca como `skipped` (`aviso_cancelado`) los envíos pendientes y no crea más. |
| `TelegramGateway.sendMessage` / `MailService.send` | `notifications.deliver` | Puertos de la spec 000. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
