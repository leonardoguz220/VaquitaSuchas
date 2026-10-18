# Vaquita

Grupo Suchas: Camila Fuentes (base de datos), Leonardo Guzman (backend) y Adrian Vargas (frontend).

Vaquita es una aplicación web para organizar las suscripciones que comparten amigos, familias o compañeros de departamento (Netflix, Spotify, Disney+, YouTube Premium y similares). Calcula la cuota de cada miembro, convierte los montos de dólares a bolivianos, genera los cobros de cada mes, envía recordatorios y guarda un historial: cada miembro sube su comprobante y el titular lo confirma. Quien quiere entrar a un grupo abre una solicitud, conversa con el titular en un chat, paga y entra cuando el titular confirma su pago. Incluye además un panel de gasto y ahorro, reputación por puntualidad, cupos libres y administración.

El proyecto se desarrolla con Spec Driven Development: la especificación se escribe y se revisa primero, y el código se deriva de ella.

## Estado

Las once specs están en borrador y esperan la revisión por capa. Todavía no hay código; las carpetas `backend/`, `frontend/` y `database/` contienen solo su guía de capa.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend (Adrian) | Next.js, React, TypeScript, Tailwind CSS |
| Backend (Leonardo) | NestJS, TypeScript, JWT, Swagger, Jest |
| Base de datos (Camila) | PostgreSQL con migraciones SQL y seed |
| Comprobantes y QR | Supabase Storage con URLs firmadas |
| Despliegue | Vercel (frontend); Render (backend y PostgreSQL) |
| Calidad | GitHub Actions y Playwright |

El código se organiza por capas en las tres partes del sistema. El detalle está en [`context/stack.md`](context/stack.md) y [`context/arquitectura.md`](context/arquitectura.md).

## Estructura del repositorio

```
VaquitaSuchas/
├── CLAUDE.md             principios del proyecto y reglas para agentes de IA
├── CONTRIBUTING.md       roles por capa, ramas y PRs
├── .claude/              skills, agentes y listas de referencia para Claude Code
├── .specify/             Spec Kit y constitución
├── .github/              plantilla de PR
├── context/              proyecto, dominio, stack, arquitectura y decisiones
├── ia/                   herramientas, skills y MCPs, licencias de terceros
├── specs/                una carpeta por feature con spec, plan y tareas
├── database/             migraciones, seeds y pruebas de integridad
├── backend/              API NestJS por capas
└── frontend/             aplicación Next.js por capas
```

| Carpeta | Contenido |
|---|---|
| [`context/`](context/) | Qué es el proyecto ([`proyecto.md`](context/proyecto.md)), cómo funciona el sistema completo ([`funcionamiento-del-sistema.md`](context/funcionamiento-del-sistema.md)), reglas de dominio ([`dominio.md`](context/dominio.md)), stack ([`stack.md`](context/stack.md)), arquitectura por capas ([`arquitectura.md`](context/arquitectura.md)) y decisiones registradas ([`decisiones/`](context/decisiones/)) |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Constitución del proyecto, que Spec Kit usa para validar specs, planes y tareas |
| [`ia/`](ia/) | Skills, agentes y MCPs que usa el equipo, con su origen y licencia ([`herramientas-y-skills.md`](ia/herramientas-y-skills.md)) |
| [`specs/`](specs/) | Roadmap, banco de preguntas y las specs de cada módulo |

## Specs

El orden de construcción es P0, P1 y P2, y los diez módulos entran en el alcance.

| # | Spec | Prioridad | Líder |
|---|---|---|---|
| 000 | [Setup del proyecto](specs/000-setup-del-proyecto/spec.md) | P0 | Todos |
| 003 | [Usuarios y autenticación](specs/003-usuarios-y-autenticacion/spec.md) | P0 | Leonardo (BE) |
| 004 | [Catálogo de servicios](specs/004-catalogo-de-servicios/spec.md) | P0 | Camila (BD) |
| 001 | [Suscripciones compartidas](specs/001-suscripciones-compartidas/spec.md) | P0 | Camila (BD) |
| 002 | [Cobros y pagos](specs/002-cobros-y-pagos/spec.md) | P0 | Leonardo (BE) |
| 010 | [Solicitudes de ingreso y chat](specs/010-solicitudes-de-ingreso/spec.md) | P0 | Leonardo (BE) |
| 005 | [Notificaciones](specs/005-notificaciones/spec.md) | P1 | Leonardo (BE) |
| 006 | [Panel y reportes](specs/006-panel-y-reportes/spec.md) | P1 | Adrian (FE) |
| 007 | [Reputación](specs/007-reputacion/spec.md) | P2 | Camila (BD) |
| 008 | [Cupos libres](specs/008-cupos-libres/spec.md) | P2 | Adrian (FE) |
| 009 | [Administración](specs/009-administracion/spec.md) | P2 | Adrian (FE) |

El mapa de módulos está en [`specs/00-roadmap.md`](specs/00-roadmap.md) y las preguntas por decidir en [`specs/00-preguntas-abiertas.md`](specs/00-preguntas-abiertas.md).

## Revisión por capa

Cada spec necesita el visto bueno de las tres capas antes de pasar al plan:

- Base de datos (Camila) revisa la integridad (unicidades, estados finales, copias de datos históricos) y las consultas costosas.
- Backend (Leonardo) revisa que las reglas de negocio estén completas y sin contradicciones, y que los permisos, la concurrencia y los criterios de aceptación se puedan probar.
- Frontend (Adrian) revisa qué ve y qué puede hacer cada rol, los estados vacíos y de error, el uso en celular y que la API ofrezca lo que las pantallas necesitan.

La revisión se registra en la línea "Revisión por capa" de cada spec, y las marcas `[NECESITA ACLARACIÓN]` se resuelven o se confirman.

## Flujo de trabajo

`/speckit-specify`, `/speckit-clarify`, revisión por capa, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, implementación por capa y `/speckit-converge`.

Los roles, las ramas y los PRs están en [`CONTRIBUTING.md`](CONTRIBUTING.md). Los principios y las reglas de dominio están en [`CLAUDE.md`](CLAUDE.md) y en la [constitución](.specify/memory/constitution.md).
