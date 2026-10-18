# Investigación — Spec 000: Setup del proyecto

- **Fecha:** 2026-10-18
- **Para:** `plan.md` de la spec 000
- **Fuentes consultadas** (ver al final). Los datos de planes gratuitos cambian; cada decisión que depende de uno lleva la marca **[verificar]** y se confirma al crear la cuenta correspondiente.

Esta investigación resuelve los puntos que la spec 000 dejó para el plan (sección 10) y los que aparecieron al revisar los límites vigentes de cada proveedor.

---

## R1. Cómo se cubre el plan gratuito de Render (servicio web y base de datos)

**Hechos** (documentación de Render, "Deploy for Free", consultada el 2026-10-18):

| Recurso | Límite gratuito |
|---|---|
| Servicio web | Se duerme tras 15 minutos sin tráfico entrante; despertarlo tarda cerca de 1 minuto. |
| Horas de instancia | 750 por mes y por espacio de trabajo. Un mes de 31 días tiene 744 horas, así que **un solo servicio siempre despierto cabe**. |
| Sistema de archivos | Se pierde en cada reinicio o redeploy; no hay discos persistentes. |
| Puertos de salida | Bloqueados 25, 465 y 587 (no sirve SMTP desde el backend). |
| PostgreSQL | Una base gratuita por espacio; 1 GB; **caduca a los 30 días** y tiene 14 días de gracia antes de borrarse; sin copias de seguridad; sin pool de conexiones gestionado. |
| Reinicios | Render puede reiniciar servicio y base en cualquier momento. |

**Decisión.**

1. **Un disparador externo gratuito** llama cada 5 minutos a `POST /internal/jobs/tick` (con un token en el encabezado). Eso cumple dos funciones: mantiene despierto el servicio (nunca pasan 15 minutos sin tráfico) y ejecuta las tareas de las specs 002, 005 y 010 aunque el reloj interno falle. Opción principal: cron-job.org (gratis, mínimo 1 minuto). Respaldo: un workflow programado de GitHub Actions cada 10 minutos (GitHub puede retrasar o saltarse ejecuciones programadas, por eso no es el principal).
2. El reloj interno (`@nestjs/schedule`) queda como segunda vía mientras el proceso está despierto. Ambos caminos son seguros al mismo tiempo porque cada tarea es idempotente y se serializa con un bloqueo asesor de PostgreSQL (`pg_try_advisory_lock`).
3. Todo plazo (spec 010) y todo atraso (spec 002) se **evalúa también al consultar o actuar** (RNF-010-03, RNF-002-05). La tarea solo limpia y notifica; si el servicio estuvo dormido o caído, el resultado sigue siendo correcto.
4. **Base de datos:** se crea la base de Render **como máximo 25 días antes de la demo** (hay un recordatorio en el calendario del equipo) y se aplican `db:migrate` y `db:seed`. Si la fecha de la demo cae más de 30 días después de la creación, se recrea con `db:reset`. `npm run db:dump` y `npm run db:restore` (envoltorios de `pg_dump` y `psql`) permiten conservar los datos al recrearla.
5. **Plan B sin cambios de código:** la conexión es solo `DATABASE_URL`. Si Render dejara de servir, se apunta a otro PostgreSQL gratuito (por ejemplo Neon o Supabase) y se restaura el volcado.
6. No se contrata una instancia de pago. Si el equipo decide pagar, cambia solo la configuración, no el código.

**Alternativas descartadas.** Instancia de pago (costo; la demo es de menos de 100 usuarios, RNF-000-05). Solo `@nestjs/schedule` sin disparador externo (el servicio dormido no ejecuta nada). Un segundo proveedor de cron dentro de Render (los cron jobs de Render son de pago).

**Riesgo residual.** cron-job.org o GitHub pueden fallar: el efecto es solo una demora, por la evaluación perezosa de los plazos. Una política de uso aceptable del proveedor podría objetar los pings de mantenimiento **[verificar]**; el respaldo es dejar que el servicio duerma, con la primera petición lenta.

---

## R2. Cómo recibe el backend los mensajes del bot de Telegram

**Hechos** (Telegram Bot API, `setWebhook`): la URL debe ser HTTPS; puertos admitidos 443, 80, 88 y 8443; `secret_token` de 1 a 256 caracteres (A-Z, a-z, 0-9, `_`, `-`) que Telegram devuelve en el encabezado `X-Telegram-Bot-Api-Secret-Token`; si el servidor responde fuera de 2xx, Telegram reintenta y después se rinde.

**Decisión: webhook.**

- `POST /telegram/webhook` valida el encabezado secreto (comparación en tiempo constante) y responde `200` de inmediato después de registrar la actualización.
- Cada actualización se deduplica por `update_id` (tabla `telegram_updates`, con limpieza a los 7 días), porque Telegram puede repetirla.
- El webhook se registra con un comando (`npm run telegram:set-webhook`) al desplegar; no al arrancar.
- Con el disparador de R1 el servicio casi nunca duerme. Si llegara un mensaje con el servicio dormido, Telegram lo reintenta mientras el servicio despierta.
- **Modo `dev`:** un simulador local sin red. El backend expone, solo cuando `TELEGRAM_MODE=dev`, `POST /dev/telegram/simulate` (inyecta un `/start <token>` o un contacto compartido con la forma real de una actualización de Telegram) y `GET /dev/telegram/outbox` (los mensajes que el bot "envió"). Los tests de integración usan el mismo simulador (CA-000-17).
- **Modo `prod`:** bot real creado con BotFather; el token va en `TELEGRAM_BOT_TOKEN`, nunca en el repositorio.

**Alternativa descartada: consulta periódica (`getUpdates`).** Funciona sin URL pública, pero exige un proceso despierto permanentemente y no despierta al servicio. Sirve solo como herramienta local si alguien prefiere no exponer un túnel; no se implementa en el MVP.

---

## R3. Dónde se guardan los comprobantes y los QR

**Hechos.**

- La pila elegida decía Firebase Storage con URLs firmadas. Una fuente secundaria (agentdeals.dev, sobre los cambios anunciados por Google) indica que desde 2026-02-03 **Cloud Storage para Firebase exige el plan Blaze** (con tarjeta) incluso para el bucket por defecto **[verificar en firebase.google.com/pricing]**. La documentación oficial de Firebase no pudo leerse completa desde este entorno.
- Supabase Storage (plan gratuito): límite de archivo de 50 MB (nuestro máximo es 5 MB), buckets privados con URLs firmadas. Los proyectos gratuitos se pausan tras un período de inactividad **[verificar]**.

**Decisión (confirmada por el equipo el 2026-10-18: no se paga ningún servicio).** Se usa **Supabase Storage** en su plan gratuito. El backend define una interfaz `FileStorage` (`put`, `signedUrl`, `delete`, `exists`) con tres implementaciones:

| Modo | Uso |
|---|---|
| `local` | Desarrollo y tests: carpeta `.storage/` ignorada por git; la "URL firmada" es una ruta del backend con firma HMAC y vencimiento. |
| `supabase` | **Elegido para staging/demo** (plan gratuito, sin tarjeta). |
| `firebase` | Queda disponible solo si algún día el equipo tiene un plan Blaze; no se implementa en el MVP (la interfaz lo permite). |

El proveedor se elige con `STORAGE_DRIVER`. La subida pasa **siempre por el backend** (valida el tipo real con la firma binaria del archivo, el tamaño y la referencia antes de guardar), y el cliente nunca recibe credenciales del almacén. Se agrega una llamada barata al almacén en cada tick diario para que el proyecto de Supabase no se pause por inactividad.

**Esto cambia `context/stack.md`** (fila "Comprobantes y QR"): Supabase Storage pasa a ser la decisión y Firebase queda descartado por requerir tarjeta. El cambio se aprueba en el PR de este plan.

**Alternativa descartada.** Guardar comprobantes en la base de datos (`bytea`): rompe el límite de 1 GB y el volcado de respaldo. Disco de Render: no persiste.

---

## R4. Correo de producción (Resend)

**Hechos.** Render bloquea SMTP, así que se usa la **API HTTPS de Resend**, no SMTP. En el plan gratuito de Resend, sin un dominio verificado solo se puede enviar desde `onboarding@resend.dev` y únicamente a la dirección del dueño de la cuenta **[verificar]**.

**Decisión.** `MailService` con modos `dev` (SMTP a Mailpit, solo local) y `prod` (HTTP a un proveedor). El equipo decidió **no pagar nada**, así que no se compra un dominio. Consecuencias:

1. **Resend** (decisión del 2026-10-17) sin dominio verificado solo entrega a la dirección del dueño de la cuenta. Sirve para la demo si los correos de prueba son de los integrantes.
2. Si la recuperación de contraseña debe llegar a cualquier persona, la alternativa gratuita a evaluar es **Brevo**, que permite verificar una dirección de remitente única (sin dominio propio) y enviar por API HTTPS **[verificar límites diarios y la entrega desde un remitente Gmail]**. Cambiarlo toca solo la implementación `prod` de `MailService`.
3. Hasta que el equipo confirme cuál usar, el plan deja el proveedor `prod` configurable por `MAIL_PROVIDER` (`resend` | `brevo`). Está registrado como riesgo R-02.

**Alternativa descartada.** Gmail por SMTP (puertos bloqueados) y SendGrid/Brevo (no se evaluaron a fondo; el modo `prod` queda detrás de la interfaz, así que cambiar de proveedor toca un solo archivo).

---

## R5. Hash de contraseñas: argon2id

La spec admite `argon2id` o `bcrypt` con costo ≥ 12 (RNF-003-01). El servicio gratuito de Render tiene una fracción de CPU; bcrypt con costo 12 puede tardar varios segundos y rompería RNF-003-06 (menos de 1 s). Se usa **argon2id** (paquete `argon2`, parámetros mínimos recomendados por OWASP: 19 MiB, 2 iteraciones, 1 hilo). Se mide en el servicio desplegado; si tarda más de 800 ms se ajusta el costo. `context/stack.md` menciona bcrypt: se actualiza en el mismo PR.

---

## R6. Migraciones: ejecutor propio mínimo

**Decisión.** Un ejecutor de ~150 líneas en `database/src/migrate.ts` con `pg`:

- Lee `database/migrations/NNNN_nombre.sql` en orden numérico.
- Guarda `version`, `name`, `checksum` (SHA-256 del contenido) y `applied_at` en `schema_migrations`.
- Cada archivo corre en **una transacción** (`BEGIN … COMMIT`); si falla, `ROLLBACK`, se muestra el archivo y no se sigue (RF-000-05, CA-000-04).
- Toma un bloqueo asesor para que dos ejecuciones no choquen.
- Si el checksum de una migración ya aplicada cambió, aborta (RN-000-02).
- Una migración que necesite `CREATE INDEX CONCURRENTLY` u otra orden fuera de transacción se marca con el comentario `-- no-transaction` (no se usa en el MVP).

**Numeración reservada por spec** (evita conflictos entre integrantes, CA de la sección 8):

| Rango | Spec |
|---|---|
| 0001–0009 | 000 (base: extensiones, funciones, tablas técnicas) |
| 0010–0019 | 003 (usuarios) |
| 0020–0029 | 004 (catálogo) |
| 0030–0039 | 001 (grupos) |
| 0040–0049 | 002 (cobros) |
| 0050–0059 | 010 (solicitudes) |
| 0060–0069 | 007 (reputación) |
| 0070–0079 | 005 (notificaciones) |
| 0080–0089 | 008 (cupos libres) |
| 0090–0099 | 009 (administración) |
| 0100–0109 | 006 (vistas de reportes) |

Un cambio posterior a una migración ya fusionada usa el siguiente número libre **del rango de su spec**. El script `db:check` valida: prefijos únicos y de 4 dígitos, nombres en minúsculas con guion bajo, y que ningún archivo existente en `main` haya cambiado (CI lo ejecuta contra la rama base).

**Alternativas descartadas.** `node-pg-migrate` y Prisma Migrate: añaden dependencias y reglas propias; la spec pide SQL numerado y un control idempotente. Un ORM completo queda fuera (el equipo usa `pg` y repositorios, ver `context/arquitectura.md`).

---

## R7. Estrategia de pruebas de integración

- Las pruebas de integración usan **PostgreSQL real** (servicio `db-test` en `docker-compose.yml`, servicio de contenedor en GitHub Actions), no mocks.
- Antes de cada archivo de pruebas se aplica `db:migrate` sobre una base limpia y entre pruebas se hace `TRUNCATE … RESTART IDENTITY CASCADE` de las tablas de datos (no de `schema_migrations`).
- El **reloj** es una dependencia inyectable (`Clock`); las pruebas de plazos lo adelantan sin esperas reales.
- Las pruebas de integridad de la base viven en `database/tests/` y se ejecutan con `node:test` + `pg` (sin depender del backend).
- E2E con Playwright contra el backend y el frontend levantados con `docker compose` + `npm run dev`, con el bot, el correo y el almacén en modo `dev`.

---

## R8. Registro de eventos y configuración

- **Logs:** `nestjs-pino` con `x-request-id` (se genera si no llega), y redacción de `authorization`, `cookie`, `password`, `token`, `ci`, `phone`, `reference` y cuerpos de archivos (RF-000-13).
- **Configuración:** `@nestjs/config` con una función de validación con `class-validator` (patrón de `BackendProyecto1`); reúne todos los faltantes en un solo mensaje (RF-000-08).
- **Errores:** filtro global; el cuerpo es `{ statusCode, code, message, details? }`. Los errores de dominio llevan un `code` estable en inglés (por ejemplo `INVALID_TRANSITION`); el `message` va en español (Bolivia).

---

## R9. Frontend: proxy `/api` y sesión

- Ruta `src/app/api/[...path]/route.ts`: reenvía método, cuerpo (incluidas subidas `multipart`) y encabezados permitidos a `BACKEND_URL`, agrega `Authorization: Bearer` desde la cookie `vq_session` y **nunca** devuelve el token al navegador.
- Mapa de rutas: `/api/health` → `GET {BACKEND_URL}/health`; `/api/<ruta>` → `{BACKEND_URL}/<ruta>`.
- Cookie: `httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7 días`. Cuando el backend devuelve el encabezado `X-Session-Token` (renovación deslizante) el proxy reemplaza la cookie.
- `src/proxy.ts` (antes "middleware" en versiones anteriores de Next.js) redirige a `/ingresar` si falta la cookie en rutas protegidas; la validez real la decide siempre el backend.
- Tiempo de espera del proxy 30 s (Vercel) para tolerar un arranque en frío de Render.

---

## Fuentes

- Render, "Deploy for Free": https://render.com/docs/free
- Telegram Bot API, `setWebhook`: https://core.telegram.org/bots/api#setwebhook
- Supabase, límites de archivo: https://supabase.com/docs/guides/storage/uploads/file-limits
- Firebase, cambios de Cloud Storage tras septiembre de 2024: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 (no se pudo leer completa) y resumen de terceros https://agentdeals.dev/vendor/firebase
