# Roadmap de specs — Vaquita

Mapa de los diez módulos del proyecto hacia specs concretas, en orden de implementación. Cada spec es una porción pequeña y entregable.

## Prioridades

| Prioridad | Significado | Regla |
|---|---|---|
| **P0 — MVP** | Sin esto no hay producto | Se termina completo antes de pasar a P1 |
| **P1 — Importante** | Mejora mucho la experiencia | Se construye cuando el MVP está completo y estable |
| **P2 — Extra** | Valor agregado | Se construye después de P1. **Entra en el alcance**: la prioridad define el orden, no si se hace |

## Specs y orden

| # | Spec | Módulos | Prioridad | Depende de | Líder de spec (capa) | Estado |
|---|---|---|---|---|---|---|
| 000 | [Setup del proyecto (repo, CI, base de datos, estructura)](000-setup-del-proyecto/spec.md) | — | P0 | — | Todos (BD, BE y FE montan su parte) | borrador |
| 003 | [Usuarios y autenticación](003-usuarios-y-autenticacion/spec.md) | 1 | P0 | 000 | Leonardo (BE) | borrador |
| 004 | [Catálogo de servicios (seed inicial de plataformas y planes)](004-catalogo-de-servicios/spec.md) | 2 | P0 | 000 | Camila (BD) | borrador |
| 001 | [Suscripciones compartidas (grupos, invitación, miembros, titular)](001-suscripciones-compartidas/spec.md) | 3, 4 | P0 | 003, 004 | Camila (BD) | borrador |
| 002 | [Cobros y pagos (generación mensual, comprobantes, confirmación, historial)](002-cobros-y-pagos/spec.md) | 5 | P0 | 001 | Leonardo (BE) | borrador |
| 010 | [Solicitudes de ingreso y chat (pago previo, chat por solicitud, reclamos)](010-solicitudes-de-ingreso/spec.md) | 3 (ingreso al grupo) | P0 | 001, 002, 003 | Leonardo (BE) | borrador |
| 005 | [Notificaciones (recordatorios, retiros por mora, invitaciones, Telegram opcional)](005-notificaciones/spec.md) | 6 | P1 | 002 | Leonardo (BE) | borrador |
| 006 | [Panel y reportes (gasto mensual, ahorro, calendario, deudas)](006-panel-y-reportes/spec.md) | 7 | P1 | 002 | Adrian (FE) | borrador |
| 007 | [Reputación (calificación en estrellas, insignias, ranking)](007-reputacion/spec.md) | 8 | P2 (la calificación básica va en P0) | 002 | Camila (BD) | borrador |
| 008 | [Cupos libres (publicar y buscar cupos)](008-cupos-libres/spec.md) | 9 | P2 | 001, 010 | Adrian (FE) | borrador |
| 009 | [Administración (usuarios, baneos y reclamos, catálogo, estadísticas)](009-administracion/spec.md) | 10 | P2 | 003, 004 | Adrian (FE) | borrador |

Todas las specs están en borrador y esperan la revisión por capa (base de datos, backend y frontend). La numeración identifica cada spec y no indica el orden de ejecución, que es el de la tabla de arriba hacia abajo.

El líder de cada spec es quien la redacta y coordina, según la capa que más pesa en esa feature. Toda spec la aprueban las tres capas (ver `CONTRIBUTING.md`) y las asignaciones son sugerencias.

## Nota sobre el ingreso al grupo

El ingreso se cobra antes de unir a la persona (decisión del 2026-10-17). La spec 001 define el grupo, el código y la cuota; la spec 010 define la solicitud de ingreso, el chat con el titular, los plazos de pago y confirmación, y el reclamo. Una persona solo es miembro cuando el titular confirma su pago, y esa confirmación crea su cobro de ingreso en la spec 002. El orden de construcción es 001, 002 y 010.

La spec 001 exige que el titular esté habilitado (RF-001-21): por calificación de puntualidad o por habilitación manual de un administrador. Por eso la calificación básica de la spec 007 (RF-007-01 a RF-007-05) se construye junto con el MVP, y las insignias y el ranking siguen en P2. Para que el sistema pueda arrancar sin titulares con historial, el administrador habilita a los primeros (spec 009, RF-009-21).

## Nota sobre el módulo 4 (División y moneda)

Se incluye dentro de la spec 001 porque el cálculo de cuotas y la conversión USD→Bs ocurren al crear el grupo y al unirse miembros. Si la lógica crece, se puede extraer a una spec propia.

## Hitos

1. **Hito 1 — Base lista:** setup + autenticación + catálogo.
2. **Hito 2 — Grupos funcionando:** crear suscripción (con titular habilitado), generar el código y ver la cuota estimada.
3. **Hito 3 — Cobros:** cobros mensuales, comprobantes, confirmación e historial.
4. **Hito 4 — MVP completo:** solicitud de ingreso con pago previo y chat, calificación básica de puntualidad y reclamos. **Flujo E2E funcionando de punta a punta.**
5. **Hito 5 — P1:** notificaciones y panel.
6. **Hito 6 — P2:** insignias y ranking de reputación, cupos libres y administración completa.
7. **Hito 7 — Cierre:** pulido, documentación y presentación al profesor.

## Qué NO entra en el MVP

- Pasarela de pago real (los pagos son por QR/transferencia externos; la app solo registra comprobantes).
- Obtención automática del tipo de cambio desde una API externa (el titular lo ingresa).
- Aplicación móvil nativa (es web responsive).
- Chat de grupo entre miembros. El chat por solicitud de ingreso sí entra (spec 010).
- Custodia o devolución de dinero por parte de la app.
