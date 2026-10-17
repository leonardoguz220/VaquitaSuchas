# Vaquita

**Grupo Suchas** · Camila Fuentes (Base de datos) · Leonardo Guzman (Backend) · Adrian Vargas (Frontend)

Vaquita es una aplicación web que ayuda a grupos de amigos, familias o compañeros de departamento a organizar las suscripciones que comparten (Netflix, Spotify, Disney+, YouTube Premium, etc.). Calcula cuánto le toca pagar a cada miembro, convierte los montos de dólares a bolivianos, genera los cobros de cada mes, envía recordatorios y deja un historial claro: cada miembro sube su comprobante y el titular lo confirma. Además ofrece un panel de gasto y ahorro, un sistema de reputación por puntualidad, cupos libres y administración.

> Este proyecto se desarrolla con **Spec Driven Development (SDD)**: primero se escribe y se revisa la especificación, y el código se deriva de ella.

## Estado

Todas las specs están en **borrador** y esperan la revisión por capa. Todavía no hay código.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend (Adrian) | Next.js, React, TypeScript, Tailwind CSS |
| Backend (Leonardo) | NestJS, TypeScript, JWT, Swagger, Jest |
| Base de datos (Camila) | PostgreSQL con migraciones SQL y seed |
| Comprobantes y QR | Firebase Storage con URLs firmadas |
| Despliegue | Vercel (frontend), Render (backend), PostgreSQL gestionado (por definir) |
| Calidad | GitHub Actions, Playwright (E2E) |

Detalle y justificación en [`CLAUDE.md`](CLAUDE.md) §4. Skills, agentes y MCPs recomendados: [`docs/herramientas-y-skills.md`](docs/herramientas-y-skills.md).

## Specs

El orden de construcción es P0 → P1 → P2. **Los 10 módulos entran en el alcance.**

| # | Spec | Prioridad | Líder |
|---|---|---|---|
| 000 | [Setup del proyecto](specs/000-setup-del-proyecto/spec.md) | P0 | Todos |
| 003 | [Usuarios y autenticación](specs/003-usuarios-y-autenticacion/spec.md) | P0 | Leonardo (BE) |
| 004 | [Catálogo de servicios](specs/004-catalogo-de-servicios/spec.md) | P0 | Camila (BD) |
| 001 | [Suscripciones compartidas](specs/001-suscripciones-compartidas/spec.md) | P0 | Camila (BD) |
| 002 | [Cobros y pagos](specs/002-cobros-y-pagos/spec.md) | P0 | Leonardo (BE) |
| 005 | [Notificaciones](specs/005-notificaciones/spec.md) | P1 | Leonardo (BE) |
| 006 | [Panel y reportes](specs/006-panel-y-reportes/spec.md) | P1 | Adrian (FE) |
| 007 | [Reputación](specs/007-reputacion/spec.md) | P2 | Camila (BD) |
| 008 | [Cupos libres](specs/008-cupos-libres/spec.md) | P2 | Adrian (FE) |
| 009 | [Administración](specs/009-administracion/spec.md) | P2 | Adrian (FE) |

- Mapa y orden: [`specs/00-roadmap.md`](specs/00-roadmap.md)
- Preguntas pendientes de decidir: [`specs/00-preguntas-abiertas.md`](specs/00-preguntas-abiertas.md)

## Cómo revisar una spec

Toda spec necesita el visto bueno de **las tres capas** antes de pasar al plan. Cada quien revisa lo suyo:

- **Base de datos (Camila):** ¿se puede garantizar la integridad (unicidades, estados finales, copias de datos históricos)? ¿hay consultas costosas?
- **Backend (Leonardo):** ¿las reglas de negocio están completas y sin contradicciones? ¿los permisos y la concurrencia están definidos? ¿cada criterio se puede probar?
- **Frontend (Adrian):** ¿se entiende qué ve y qué puede hacer cada rol? ¿están los estados vacíos, los errores y el uso en celular? ¿la API ofrece lo que la pantalla necesita?

Al terminar, se marca ✅ en la línea **Revisión por capa** de la spec, y las marcas `[NECESITA ACLARACIÓN]` se resuelven o se confirman.

## Flujo de trabajo

`/speckit-specify` → `/speckit-clarify` → revisión por capa → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → implementación por capa → `/speckit-converge`

Roles, ramas, PRs y reglas del equipo: [`CONTRIBUTING.md`](CONTRIBUTING.md). Principios y reglas de dominio (dinero, fechas, estados, seguridad): [`CLAUDE.md`](CLAUDE.md) y [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Estructura del repositorio

```
VaquitaSuchas/
├── README.md
├── CLAUDE.md                 # reglas del proyecto y stack
├── CONTRIBUTING.md           # roles por capa y flujo de equipo
├── .specify/                 # Spec Kit: constitución, plantillas, scripts
├── .claude/skills/           # /speckit-* y skills de apoyo (agent-skills, MIT)
├── .claude/agents/           # revisor de código, auditor de seguridad, ingeniero de pruebas
├── references/               # listas de verificación (seguridad, rendimiento, accesibilidad, pruebas)
├── docs/                     # herramientas, skills y MCPs; licencias de terceros
├── .github/                  # plantilla de PR
└── specs/
    ├── 00-roadmap.md
    ├── 00-preguntas-abiertas.md
    ├── _templates/           # plantillas de spec, plan y tareas
    └── NNN-nombre/spec.md    # una carpeta por feature
```

Las carpetas `database/`, `backend/` y `frontend/` se crean al implementar la spec 000.
