# Guía de validación — Spec 000: Setup del proyecto

Pasos para comprobar que la base del proyecto funciona de punta a punta. No contiene código de implementación; los comandos son los que el `README` documentará.

## Requisitos previos

- Node.js 22 LTS (archivo `.nvmrc` en la raíz) y npm. En Windows, `nvm-windows` permite tener la 22 junto a otras versiones.
- En Windows, Git Bash: los scripts de Spec Kit (`.specify/scripts/bash/`) y los hooks de Claude Code se ejecutan con bash.
- Docker con Compose.
- Git. Opcional: `gh` para ver el estado de CI.

## 1. Levantar todo en local (CA-000-01, RNF-000-01)

```bash
git clone https://github.com/leonardoguz220/VaquitaSuchas.git && cd VaquitaSuchas
cp backend/.env.example backend/.env       # completar solo las variables marcadas con TODO
cp frontend/.env.example frontend/.env.local # completar BACKEND_URL=http://localhost:3001
npm install                                # instala los tres paquetes (workspaces)
npm run db:up                              # PostgreSQL (y Mailpit) con docker compose
npm run db:migrate && npm run db:seed
npm run dev                                # backend en :3001 y frontend en :3000
```

**Orden del seed (spec 009):** el seed `database/seeds/0090_admin_dev.sql` (habilitación de `titular@dev.vaquita` y `miembro1@dev.vaquita`, reclamos y auditoría de ejemplo) toma al administrador activo más antiguo. El administrador debe existir **antes** de `npm run db:seed`: se crea con `npm run build -w backend && SEED_ADMIN_EMAIL=… SEED_ADMIN_NAME=… SEED_ADMIN_PASSWORD=… npm run seed:admin -w backend`. Sin administrador esa parte del seed no hace nada (no falla) y el titular de desarrollo queda sin habilitar; si se creó después, basta repetir `npm run db:seed` (es idempotente). El baneo revertido de ejemplo solo se siembra con dos administradores.

Si el puerto 5432 ya lo usa otro PostgreSQL, levantar la base con otro puerto del host (`DB_PORT=5435 npm run db:up`) y usar ese mismo puerto en `DATABASE_URL`.

Para usar `/speckit-implement` sobre esta spec, definir antes la feature activa: `export SPECIFY_FEATURE_DIRECTORY=specs/000-setup-del-proyecto`.

**Esperado:** `http://localhost:3000/estado` muestra el estado del backend y de la base (CA-000-10); `http://localhost:3001/api/docs` muestra Swagger (CA-000-07); Mailpit en `http://localhost:8025`.

## 2. Migraciones (CA-000-02, CA-000-03, CA-000-04)

```bash
npm run db:reset                           # recrea la base desde cero
npm run db:migrate                         # segunda vez: "0 migraciones nuevas"
npm run test -w database                   # pruebas de integridad, incluida la migración que falla a la mitad
```

**Esperado:** `schema_migrations` lista todas las migraciones; la segunda ejecución no cambia nada; la migración defectuosa no deja tablas a medias.

## 3. Variables de entorno (CA-000-05)

```bash
DATABASE_URL= npm run start -w backend
```

**Esperado:** el proceso termina con un mensaje que nombra `DATABASE_URL` (y todas las demás variables que falten).

## 4. Salud, errores y formato (CA-000-06, CA-000-08)

```bash
curl -s localhost:3001/health
npm run test -w backend -- error-filter    # controlador de prueba que lanza un error no controlado
```

**Esperado:** `/health` responde `200` con `database.status: "up"` y sin datos sensibles; la prueba comprueba que el error no controlado responde con `statusCode`, `code`, `message` y sin traza.

## 5. Correo, bot y almacén en modo `dev` (CA-000-09, CA-000-17)

- Correo: ejecutar la prueba de integración `mail.dev` o enviar el de recuperación de la spec 003; el mensaje aparece en Mailpit y no sale a internet.
- Bot: `POST localhost:3001/dev/telegram/simulate` con `{ "kind": "start", "telegramUserId": 1, "token": "..." }` y luego un `contact`; el backend lo procesa y `GET /dev/telegram/outbox?telegramUserId=1` muestra la respuesta del bot.

## 6. Utilidades del frontend (CA-000-11, CA-000-12)

```bash
npm run test -w frontend -- format
```

**Esperado:** `formatBs(250050)` devuelve `Bs 2.500,50`; `2026-03-01T02:00:00Z` se muestra como `28 feb 2026, 22:00` en La Paz.

## 7. Integración continua (CA-000-13, CA-000-15, CA-000-16, CA-000-18)

1. Abrir un PR de prueba con un test roto: el workflow falla y GitHub bloquea la fusión.
2. Intentar `git push origin main` (y lo mismo con `dev` y `qa`): GitHub lo rechaza (rama protegida).
3. Crear un `.env` con valores reales y ejecutar `git status`: el archivo no aparece (ignorado).
4. Agregar en un PR de prueba una clave falsa con formato de secreto: el paso `gitleaks` falla.

## 8. Entorno desplegado (CA-000-14, RF-000-20, RF-000-21)

1. Backend y base en Render, frontend en Vercel, con las variables del `README`.
2. Aplicar migraciones: ejecutar el workflow manual `Migrate staging` (o `DATABASE_URL=<externa> npm run db:migrate`).
3. Abrir `https://<frontend>/estado`: las tres capas responden.
4. Comprobar el disparador: `curl -X POST -H "X-Jobs-Token: …" https://<backend>/internal/jobs/tick` devuelve `ran: [...]` y la tarea de cron-job.org figura como exitosa.
5. Registrar el webhook: `npm run telegram:set-webhook` y verificar con `getWebhookInfo` que no hay errores pendientes.
