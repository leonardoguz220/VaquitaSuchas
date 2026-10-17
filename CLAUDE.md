# Vaquita — Principios del proyecto

> Este archivo es la "constitución" del proyecto. Todo miembro del equipo (y todo agente de IA) debe leerlo antes de trabajar.
> Si algo aquí cambia, se cambia mediante PR aprobado por los 3 integrantes.

## 1. Qué es Vaquita

Aplicación web para organizar suscripciones compartidas (Netflix, Spotify, Disney+, YouTube Premium, etc.) entre amigos, familia o compañeros de departamento. Calcula la cuota de cada miembro, convierte USD a Bs, genera cobros mensuales, gestiona comprobantes de pago y deja un historial claro.

**Equipo (Grupo Suchas) y capas:** Camila Fuentes (**Base de datos**), Leonardo Guzman (**Backend**), Adrian Vargas (**Frontend**). Los roles son fijos; el detalle de responsabilidades está en `CONTRIBUTING.md`.

**Objetivo del MVP:** que un titular cree una suscripción compartida, invite miembros y gestione los pagos mensuales (cuota visible, comprobante subido, confirmación del titular, historial para todos).

**Alcance del proyecto:** entran **los 10 módulos** (no hay recorte por tiempo). La prioridad define el **orden de construcción**: primero el MVP (P0), luego lo importante (P1) y al final los extras (P2). Ver `specs/00-roadmap.md`.

## 2. Cómo trabajamos (Spec Driven Development)

1. **La spec es la fuente de verdad.** El código se deriva de ella.
2. **Nada se programa sin una spec aprobada** (excepción: bugs triviales y tareas de configuración).
3. **La spec habla del QUÉ y el POR QUÉ.** El CÓMO va en `plan.md`.
4. **Si la realidad contradice la spec, se actualiza la spec primero** y luego el código, en el mismo PR.
5. **Cada criterio de aceptación se convierte en un test.** Si no se puede testear, se reescribe el criterio.
6. **Las decisiones se discuten en PRs/issues, no solo por chat**, para que quede historial.

Flujo por feature (con Spec Kit): `/speckit-specify` → `/speckit-clarify` → revisión por capa (BD, Backend, Frontend) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → implementación por tarea y por capa → `/speckit-converge`.

7. **Cada capa es dueña de su parte:** BD define el modelo, Backend define el contrato de API y las reglas, Frontend define las pantallas. El modelo y el contrato se **congelan** al aprobar el plan; los cambios se hacen por PR avisando a las otras capas.
8. **Las reglas de negocio viven solo en el backend.** El frontend no calcula cuotas ni estados; la BD refuerza la integridad con restricciones.

## 3. Estructura del repositorio

```
vaquita/
├── CLAUDE.md                 # este archivo
├── CONTRIBUTING.md           # roles por capa, flujo de equipo, ramas, PRs
├── .specify/                 # Spec Kit: constitución, plantillas, scripts
│   └── memory/constitution.md
├── .claude/skills/speckit-*  # comandos /speckit-specify, -clarify, -plan, -tasks...
├── specs/
│   ├── 00-roadmap.md         # mapa de módulos → specs y orden
│   ├── 00-preguntas-abiertas.md  # banco de preguntas para afinar la idea
│   ├── _templates/           # plantillas spec/plan/tasks (con secciones por capa)
│   ├── 001-suscripciones-compartidas/
│   │   ├── spec.md
│   │   ├── plan.md
│   │   └── tasks.md
│   └── 002-cobros-y-pagos/
├── .github/pull_request_template.md
├── database/                 # Camila: migraciones y seeds (a definir en plan)
├── backend/                  # Leonardo (a definir en plan)
└── frontend/                 # Adrian (a definir en plan)
```

## 4. Stack técnico

> **STACK FINAL (acordado 2026-10-17).** Basado en lo que ya usaron en los repos de la materia (`proyectoFrontend1`, `BackendProyecto1`, `backendUpbtest`). Cualquier cambio se hace por PR aprobado por las tres capas. Única decisión que queda abierta: el proveedor de PostgreSQL gestionado y del servicio de correo (se cierran en la spec 000).

| Capa | Decisión | Se apoya en |
|---|---|---|
| Frontend (Adrian) | Next.js + React + TypeScript + Tailwind CSS (versiones de `proyectoFrontend1`) | Ruta `/api/[...path]` que reenvía al backend y guarda el token en cookie httpOnly; rutas por rol; `proxy.ts` para validar sesión; componentes `ui/` reutilizables (button, card, modal, field, select, badge) |
| Backend (Leonardo) | NestJS + TypeScript, JWT con Passport, bcrypt, class-validator y Swagger | `BackendProyecto1`: módulos por feature, guards por rol, validación de variables de entorno, Swagger como contrato. Tareas programadas con `@nestjs/schedule` para cobros y atrasos |
| Base de datos (Camila) | **PostgreSQL** con migraciones SQL numeradas (`database/migrations/`) y seed, driver `pg` | `backendUpbtest` ya usó PostgreSQL (`pg`, `schema.sql`, `DATABASE_URL`). Opcional: Prisma o TypeORM si prefieren ORM. MongoDB queda como alternativa si la materia lo exige |
| Comprobantes y QR | Firebase Storage con URLs firmadas (alternativa: Supabase Storage) | Ya trabajaron con Firebase (`firebaseAgentes`) |
| Despliegue | Frontend en Vercel (alternativa: Firebase App Hosting) · Backend en Render · PostgreSQL gestionado (proveedor por definir en spec 000) | `frontendUpbtest` usó Firebase Hosting y `backendUpbtest` Render. El frontend con proxy `/api` necesita servidor, no solo exportación estática. Verificar límites de los planes gratuitos |
| Tests | Jest + supertest (backend) · Playwright (E2E) | Jest y supertest ya están en `BackendProyecto1` |
| CI | GitHub Actions: lint + tests en cada PR | |
| Agentes (opcional) | Hooks de Claude Code para proteger specs y tests y correr tests al editar | Repo `hooks` de la materia |

Regla: **un solo lenguaje principal (TypeScript)** en backend y frontend, para que los 3 puedan tocar cualquier parte.

## 5. Reglas de dominio (válidas para TODAS las features)

Estas reglas evitan los errores típicos de una app de cobros. Cualquier spec debe respetarlas.

### Dinero y moneda
- **Moneda base de cobro: bolivianos (Bs).** El precio del servicio puede estar en USD o Bs.
- **Nunca usar `float` para dinero.** Guardar montos en **centavos como enteros** (ej. Bs 25,50 → `2550`) o con tipo decimal exacto.
- **El tipo de cambio lo define el titular** al crear la suscripción (valor manual) y puede actualizarse. Cada cobro guarda una **copia (snapshot)** del tipo de cambio y del precio usados, para que el historial no cambie si luego se edita la suscripción.
- **Redondeo:** la cuota se redondea al centavo. Si la división no es exacta, la diferencia (centavos sobrantes) se asigna **al titular**, de modo que **la suma de las cuotas siempre sea igual al total**.
- Formato de presentación: `Bs 25,50` (coma decimal) en la interfaz.

### Fechas y zona horaria
- Guardar fechas en **UTC**; mostrar en la zona **America/La_Paz (UTC-4)**.
- El "día de cobro" es un día del mes (1–31). Si el mes tiene menos días, se usa el **último día del mes** (ej. día 31 en febrero → 28/29).

### Roles dentro de un grupo
- **Titular:** crea la suscripción, confirma/rechaza pagos, gestiona miembros. Un grupo tiene exactamente un titular. **El titular no tiene cobro propio**: su cuota es solo referencia.
- **Miembro:** ve su cuota, paga y sube comprobantes, ve el estado e historial del grupo.
- Un usuario puede ser titular en unos grupos y miembro en otros.

### Estados de un cobro
`pendiente` → `en_revision` → `pagado` ; `pendiente` → `atrasado` (si vence sin pago) ; `en_revision` → `pendiente`/`atrasado` (si el titular rechaza) ; `pendiente`/`atrasado` → `cancelado` (decisión del titular, con motivo). `pagado` y `cancelado` son estados finales. La tabla completa de transiciones válidas está en `specs/002-cobros-y-pagos/spec.md` (RN-002-01). **No se inventan estados nuevos sin actualizar la spec.**

### Privacidad y seguridad
- Un usuario **solo ve datos de los grupos a los que pertenece**.
- Contraseñas con hash seguro (bcrypt/argon2). Nunca guardar ni loguear contraseñas ni tokens.
- Comprobantes: solo visibles para el titular y el miembro que lo subió (y, si la spec lo define, el grupo).
- Validar **siempre en el servidor** (permisos, montos, estados). El frontend solo ayuda a la UX.
- Archivos subidos: validar tipo (imagen/PDF) y tamaño máximo (definido en spec 002).
- Secretos en variables de entorno; **nunca** en el repositorio.

### Idioma
- Interfaz y mensajes al usuario: **español (Bolivia)**.
- Código, nombres de variables, ramas y commits: **inglés**. Specs y documentación: **español**.

## 6. Convenciones de código

- Lenguaje tipado (TypeScript si aplica). Linter + formateador obligatorios y ejecutados en CI.
- Nombres descriptivos; funciones pequeñas; una responsabilidad por módulo.
- Lógica de dominio (cálculo de cuotas, conversión, estados de cobro) en **funciones puras y testeadas**, separadas del framework web.
- Errores: respuestas con código HTTP correcto y mensaje claro; sin exponer detalles internos.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), referenciando la tarea: `feat(002): add receipt upload [T3]`.

## 7. Estrategia de testing

| Nivel | Qué cubre | Obligatorio |
|---|---|---|
| Unitarios | Cálculo de cuotas, redondeo, conversión, transiciones de estado, fechas | Sí, 100% de las reglas de dominio |
| Integración | Endpoints de API con base de datos de prueba, permisos por rol | Sí, un test por criterio de aceptación |
| E2E | Flujo completo del MVP (crear → invitar → cobrar → pagar → confirmar) | Sí, al menos el flujo feliz |

Cada criterio de aceptación de una spec lleva un identificador (`CA-001-03`) y el test correspondiente lo menciona en su nombre o comentario. Así hay **trazabilidad spec → test**.

## 8. Definición de "terminado" (DoD)

Una tarea o feature está terminada cuando:

- [ ] Cumple los criterios de aceptación de la spec (con tests que pasan).
- [ ] Lint y tests pasan en CI.
- [ ] Fue revisada por al menos **1 compañero** (idealmente quien no escribió la spec).
- [ ] La spec/plan/tasks reflejan la realidad (actualizados si algo cambió).
- [ ] No hay secretos, datos reales ni `console.log` de depuración.
- [ ] El estado de la tarea en `tasks.md` está marcado como completado.

## 9. Instrucciones para agentes de IA

Si usas un asistente de IA para implementar:

1. Entrégale **siempre**: este `CLAUDE.md`, la constitución (`.specify/memory/constitution.md`), la `spec.md` y el `plan.md` de la feature.
2. Pídele **una tarea de `tasks.md` por vez** y **de tu capa** (`[BD]`, `[BE]` o `[FE]`), nunca "implementa todo". Usa `/speckit-implement` acotado a una fase o capa.
3. Antes de planificar, usa `/speckit-clarify`; antes de implementar, `/speckit-analyze`.
4. Si encuentra ambigüedad en la spec, debe **preguntar o marcar `[NECESITA ACLARACIÓN]`**, no asumir.
5. No debe agregar funcionalidades fuera del alcance de la spec ("fuera de alcance" es una instrucción).
6. Debe escribir los tests ligados a los criterios `CA-xxx` antes o junto con el código.
7. No debe modificar el modelo de datos ni el contrato de API aprobados sin proponer antes el cambio en `plan.md`.
8. **Revisión humana obligatoria** de todo lo generado antes del merge.
9. **Skills y agentes de terceros** (`.claude/skills/` no `speckit-*`, `.claude/agents/`, `references/`): son de apoyo. Si contradicen este archivo, la constitución, una spec o `CONTRIBUTING.md`, **mandan estos últimos**; en particular, la definición de "terminado" es la del §8 y no la de `references/definition-of-done.md`. Catálogo, motivos y MCPs recomendados en [`docs/herramientas-y-skills.md`](docs/herramientas-y-skills.md).
