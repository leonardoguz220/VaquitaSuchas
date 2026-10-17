# Stack técnico

Stack acordado el 2026-10-17, a partir de lo que el equipo ya usó en los repositorios de la materia (`proyectoFrontend1`, `BackendProyecto1`, `backendUpbtest`). Un cambio se hace por PR aprobado por las tres capas. Quedan abiertos el proveedor de PostgreSQL gestionado y el servicio de correo, que se cierran en la spec 000.

| Capa | Decisión | Se apoya en |
|---|---|---|
| Frontend (Adrian) | Next.js, React, TypeScript y Tailwind CSS | Ruta `/api/[...path]` que reenvía al backend y guarda el token en una cookie httpOnly; rutas por rol; `proxy.ts` para validar la sesión; componentes `ui/` reutilizables (button, card, modal, field, select, badge) |
| Backend (Leonardo) | NestJS y TypeScript, con JWT y Passport, bcrypt, class-validator y Swagger | `BackendProyecto1`: módulos por feature, guards por rol, validación de variables de entorno y Swagger como contrato. Tareas programadas con `@nestjs/schedule` para cobros y atrasos |
| Base de datos (Camila) | PostgreSQL con migraciones SQL numeradas en `database/migrations/`, seed y driver `pg` | `backendUpbtest` ya usó PostgreSQL (`pg`, `schema.sql`, `DATABASE_URL`). Prisma o TypeORM quedan como opción si se prefiere un ORM |
| Comprobantes y QR | Firebase Storage con URLs firmadas; Supabase Storage como alternativa | Experiencia previa con Firebase (`firebaseAgentes`) |
| Despliegue | Frontend en Vercel, backend en Render y PostgreSQL gestionado (proveedor por definir) | `frontendUpbtest` usó Firebase Hosting y `backendUpbtest` usó Render. El frontend con proxy `/api` necesita servidor, así que no sirve una exportación estática. Faltan verificar los límites de los planes gratuitos |
| Pruebas | Jest y supertest en el backend; Playwright para E2E | Jest y supertest ya están en `BackendProyecto1` |
| Integración continua | GitHub Actions con lint y tests en cada PR | |
| Agentes (opcional) | Hooks de Claude Code para proteger specs y tests y correr pruebas al editar | Repositorio `hooks` de la materia |

El lenguaje principal es TypeScript en backend y frontend, para que las tres personas puedan trabajar en cualquier parte del código.

La organización interna del código (capas de cada parte) está en [`arquitectura.md`](arquitectura.md). Las herramientas de apoyo con IA están en [`ia/herramientas-y-skills.md`](../ia/herramientas-y-skills.md).
