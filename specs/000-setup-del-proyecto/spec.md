# Spec 000 — Setup del proyecto

- **Estado:** aprobada
- **Líder de la spec:** Todos (cada capa define su parte)
- **Revisión por capa:** Camila (BD): aprobada · Leonardo (Backend): aprobada · Adrian (Frontend): aprobada
- **Prioridad:** P0 (base de todo)
- **Depende de:** —
- **Última actualización:** 2026-10-18

## 1. Contexto y problema

Antes de construir features, el equipo necesita una base común: un repositorio ordenado, entornos que cualquiera pueda levantar en su computadora, una base de datos con migraciones, integración continua y un despliegue mínimo que demuestre que las tres capas se hablan entre sí. Sin esto, cada persona trabaja "en su máquina" y la integración falla al final.

Esta spec es **técnica** (no tiene usuarios finales), pero se redacta igual con criterios verificables.

## 2. Objetivos

- Que cualquier integrante clone el repo y levante todo el sistema con pocos comandos.
- Tener la estructura de carpetas, scripts y convenciones acordadas en `CLAUDE.md`.
- Tener CI que ejecute lint y tests en cada PR.
- Tener un despliegue "hola mundo" de punta a punta: frontend → backend → base de datos.
- Dejar listo el envío de correos (necesario para recuperar contraseña, spec 003) y el bot de Telegram que verifica el celular (spec 003, RF-003-21), ambos con un modo de desarrollo local.

## 3. Fuera de alcance

- Funcionalidades de negocio (grupos, cobros, etc.).
- Monitoreo avanzado, métricas y alertas.
- Despliegue de producción con dominio propio y certificados personalizados.

## 4. Actores

| Actor | Necesita |
|---|---|
| Camila (BD) | Base local reproducible, migraciones, seed |
| Leonardo (Backend) | Proyecto NestJS con configuración validada, Swagger, tests |
| Adrian (Frontend) | Proyecto Next.js con proxy `/api`, componentes base y E2E |
| Equipo | CI, ramas protegidas, plantillas de PR, entorno desplegado |

## 5. Requisitos funcionales

### Estructura y repositorio
- **RF-000-01:** El repositorio contiene las carpetas `database/`, `backend/`, `frontend/`, `specs/`, `context/`, `ia/` y `.claude/`, y los archivos `CLAUDE.md`, `CONTRIBUTING.md` y `.github/`. El código de `backend/`, `frontend/` y `database/` sigue la estructura por capas de `context/arquitectura.md`.
- **RF-000-02:** `main`, `qa` y `dev` están protegidas: no se permite push directo y los merges pasan por PR con el check `flow` y la CI en verde. No se exige aprobación humana (decisión del 2026-10-18). El flujo es de trabajo a `dev`, de `dev` a `qa` y de `qa` a `main`, y nada llega a `main` si no viene de `qa`.
- **RF-000-03:** Existe `.env.example` en `backend/` y `frontend/` con todas las variables necesarias, sin valores reales. Los archivos `.env` están en `.gitignore`.

### Base de datos (Camila)
- **RF-000-04:** Un `docker-compose.yml` levanta PostgreSQL local (y una bandeja de correo de desarrollo, ver RF-000-12) con un solo comando.
- **RF-000-05:** Las migraciones son archivos SQL numerados en `database/migrations/` (ej. `0001_init.sql`) y se aplican en orden con `npm run db:migrate`. El comando es **idempotente**: no vuelve a aplicar migraciones ya aplicadas (tabla de control `schema_migrations`).
- **RF-000-06:** `npm run db:seed` carga datos de ejemplo (catálogo de servicios y un usuario administrador de desarrollo). `npm run db:reset` recrea todo desde cero.
- **RF-000-07:** Convenciones del esquema: claves primarias `uuid`; fechas en `timestamptz` (UTC); dinero en `bigint` de centavos; nombres de tablas y columnas en `snake_case` en inglés; todas las tablas con `created_at` y `updated_at`.

### Backend (Leonardo)
- **RF-000-08:** El backend arranca con las variables validadas al inicio: si falta una variable obligatoria, el proceso falla con un mensaje claro.
- **RF-000-09:** `GET /health` responde el estado del servicio y de la conexión a la base de datos (sin exponer credenciales).
- **RF-000-10:** Swagger/OpenAPI se publica en `/api/docs` en entornos de desarrollo y pruebas.
- **RF-000-11:** El backend usa un filtro global de errores que devuelve un formato uniforme (`statusCode`, `code`, `message`, y `details` opcional) sin revelar detalles internos.
- **RF-000-12:** Existe una abstracción de **servicio de correo** con dos modos: `dev` (los correos llegan a la bandeja local, por ejemplo Mailpit) y `prod` (Resend, ver la sección 10).
- **RF-000-22 (Bot de Telegram):** existe una abstracción del bot de Telegram con dos modos: `dev` (un simulador local, sin red, que permite probar el flujo de compartir un contacto y recibir mensajes) y `prod` (el bot real creado con BotFather, con su token en una variable de entorno). Recibe los mensajes por un webhook de Telegram hacia el backend y envía los mensajes de la spec 005. La verificación del celular de la spec 003 depende solo de esta abstracción. No tiene costo por mensaje. _(Decidido 2026-10-18; reemplaza al envío de códigos por SMS)_
- **RF-000-13:** El backend registra logs estructurados con un identificador de petición, sin incluir contraseñas, tokens ni comprobantes.
- **RF-000-14:** Existe el módulo de tareas programadas (`@nestjs/schedule`) con un ejemplo de tarea idempotente, base para los procesos de las specs 002, 005 y 010.

### Frontend (Adrian)
- **RF-000-15:** El frontend tiene la ruta proxy `/api/[...path]` que reenvía al backend y gestiona la cookie httpOnly (patrón de `proyectoFrontend1`).
- **RF-000-16:** Existe un layout base responsive (mobile primero) con la paleta, la tipografía y los componentes `ui/` mínimos (botón, tarjeta, campo, modal, selector, insignia, aviso).
- **RF-000-17:** Existe una utilidad única para formatear dinero (`Bs 25,50`) y fechas en la zona America/La_Paz.
- **RF-000-18:** Una página de estado muestra el resultado de `GET /health` a través del proxy.

### CI/CD y despliegue
- **RF-000-19:** GitHub Actions ejecuta en cada PR: instalación, lint, build y tests de backend y frontend.
- **RF-000-20:** Existe un entorno desplegado (staging) con frontend, backend y base de datos conectados, accesible para el profesor.
- **RF-000-21:** Las migraciones se aplican en el entorno desplegado mediante un comando documentado (no automáticamente en cada arranque).

## 6. Requisitos no funcionales

- **RNF-000-01 (Reproducibilidad):** un integrante nuevo levanta el sistema completo en menos de 15 minutos siguiendo el `README`.
- **RNF-000-02 (Seguridad):** no hay secretos en el repositorio ni en el historial. Se usa **gitleaks** en CI.
- **RNF-000-03 (Calidad):** CI falla si hay errores de lint o tests rotos.
- **RNF-000-04 (Documentación):** el `README.md` raíz explica cómo levantar cada capa, correr tests, migrar y sembrar la base.
- **RNF-000-05 (Carga esperada):** la demo se diseña para menos de 100 usuarios; no se exigen pruebas de carga ni escalado más allá de lo que da el plan gratuito.

## 7. Reglas de negocio / técnicas

- **RN-000-01:** Todo el sistema trabaja en UTC internamente; la conversión a America/La_Paz ocurre solo al mostrar (`context/dominio.md`).
- **RN-000-02:** Ninguna migración ya aplicada en `main` se edita; los cambios se hacen con una migración nueva.
- **RN-000-03:** Las migraciones deben poder aplicarse sobre una base vacía y sobre la base de staging sin perder datos.

## 8. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Falta una variable de entorno obligatoria | El backend no arranca y lista las variables faltantes |
| La base de datos no está disponible | `/health` responde estado degradado (no cae el proceso) y el frontend muestra aviso |
| Se ejecuta `db:migrate` dos veces | La segunda vez no hace cambios |
| Una migración falla a la mitad | Se revierte toda la migración (transacción) y se informa cuál falló |
| Dos integrantes crean migraciones con el mismo número | CI detecta el conflicto de numeración |
| Se intenta hacer push directo a `main` | El repositorio lo rechaza |

## 9. Criterios de aceptación

- **CA-000-01:** Dado un clon limpio del repo, cuando se ejecutan los comandos del README, entonces PostgreSQL, backend y frontend corren localmente.
- **CA-000-02:** Dada una base vacía, cuando se ejecuta `db:migrate`, entonces se aplican todas las migraciones y se registran en `schema_migrations`.
- **CA-000-03:** Dada una base ya migrada, cuando se ejecuta `db:migrate` otra vez, entonces no hay cambios ni errores.
- **CA-000-04:** Dada una migración con un error, cuando se ejecuta, entonces no queda ningún cambio parcial aplicado.
- **CA-000-05:** Dado que falta `DATABASE_URL`, cuando arranca el backend, entonces falla indicando la variable faltante.
- **CA-000-06:** Dado el backend corriendo, cuando se consulta `GET /health`, entonces responde `200` con el estado de la base de datos y sin datos sensibles.
- **CA-000-07:** Dado el backend corriendo, cuando se visita `/api/docs`, entonces se muestra la documentación Swagger.
- **CA-000-08:** Dado un error no controlado en un endpoint, cuando ocurre, entonces la respuesta tiene el formato uniforme y no contiene la traza interna.
- **CA-000-09:** Dado el modo `dev` del servicio de correo, cuando el backend envía un correo, entonces aparece en la bandeja local y no sale a internet.
- **CA-000-10:** Dada la página de estado del frontend, cuando se abre, entonces muestra el estado del backend obtenido a través del proxy.
- **CA-000-11:** Dado un valor de `250050` centavos, cuando se formatea, entonces se muestra `Bs 2.500,50`.
- **CA-000-12:** Dada una fecha en UTC de las 02:00 del día 1, cuando se muestra en La Paz, entonces corresponde a las 22:00 del día anterior.
- **CA-000-13:** Dado un PR con un test fallido o un error de lint, cuando corre CI, entonces el PR no se puede fusionar.
- **CA-000-14:** Dado el entorno de staging, cuando se abre la página de estado, entonces las tres capas responden.
- **CA-000-15:** Dado un push directo a `main`, cuando se intenta, entonces es rechazado.
- **CA-000-16:** Dado un `.env` con valores reales, cuando se intenta hacer commit, entonces no se incluye (está ignorado).
- **CA-000-17:** Dado el modo `dev` del bot de Telegram, cuando se simula que una persona comparte su contacto con un token válido, entonces el backend lo recibe, verifica el celular y no sale a internet.
- **CA-000-18:** Dado un secreto de prueba incluido en un commit, cuando corre CI, entonces gitleaks falla y el PR no se puede fusionar.

## 10. Preguntas abiertas

- [RESUELTO 2026-10-17] **Proveedor de PostgreSQL gestionado:** Render, el mismo proveedor del backend. Riesgos por verificar antes de cerrar el plan (según la documentación de Render al 2026-10-17): la base gratuita caduca a los 30 días de crearse, con 14 días de gracia antes de borrarse; tiene 1 GB de almacenamiento, sin copias de seguridad y sin pool de conexiones. El servicio web gratuito se duerme tras 15 minutos sin tráfico, lo que afecta a las tareas programadas de las specs 002 y 005. El plan debe definir cómo se cubre esto (instancia de pago, recrear la base con `db:reset` y el seed cerca de la fecha de la demo, o un disparador externo para las tareas).
- [RESUELTO 2026-10-17] **Proveedor de correo en `prod`:** Resend, con plan gratuito para la demo.
- [RESUELTO 2026-10-18] **Mensajería al celular:** se usa Telegram y no SMS ni WhatsApp, por costo cero (RF-000-22). Queda para el plan de esta spec cómo recibe el backend los mensajes del bot (webhook o consulta periódica) con el servicio gratuito de Render que se duerme.
- [RESUELTO 2026-10-17] **Escaneo de secretos:** gitleaks en CI (RNF-000-02).
- [RESUELTO 2026-10-17] Los hooks de Claude Code para proteger specs y tests son una mejora opcional posterior al setup.
- [RESUELTO 2026-10-17] La carga esperada de la demo es de menos de 100 usuarios (RNF-000-05).

## 11. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | RF-000-01 incorpora `context/`, `ia/` y la estructura por capas | Equipo |
| 2026-10-17 | Se decide Render como proveedor de PostgreSQL y se registran sus límites del plan gratuito | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: servicio de mensajería al celular (RF-000-22), Resend, gitleaks, hooks opcionales y carga esperada; RF-000-14 menciona la spec 010 | Equipo |
| 2026-10-18 | La mensajería al celular pasa a ser un bot de Telegram sin costo (RF-000-22, CA-000-17) | Equipo |
| 2026-10-18 | Spec aprobada por las tres capas (BD, Backend y Frontend) | Equipo |
