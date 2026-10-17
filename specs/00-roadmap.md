# Roadmap de specs — Vaquita

Mapa de los 10 módulos del proyecto hacia specs concretas, en orden de implementación. Cada spec es una porción **pequeña y entregable**.

## Prioridades

| Prioridad | Significado | Regla |
|---|---|---|
| **P0 — MVP** | Sin esto no hay producto | Se termina completo antes de pasar a P1 |
| **P1 — Importante** | Mejora mucho la experiencia | Se construye cuando el MVP está completo y estable |
| **P2 — Extra** | Valor agregado | Se construye después de P1. **Entra en el alcance**: la prioridad define el orden, no si se hace |

## Specs y orden

| # | Spec | Módulos | Prioridad | Depende de | Líder de spec (capa) | Estado |
|---|---|---|---|---|---|---|
| 000 | [Setup del proyecto (repo, CI, base de datos, estructura)](000-setup-del-proyecto/spec.md) | — | P0 | — | Todos (BD, BE y FE montan su parte) | 📝 borrador listo |
| 003 | [Usuarios y autenticación](003-usuarios-y-autenticacion/spec.md) | 1 | P0 | 000 | Leonardo (BE) | 📝 borrador listo |
| 004 | [Catálogo de servicios (seed inicial de plataformas y planes)](004-catalogo-de-servicios/spec.md) | 2 | P0 | 000 | Camila (BD) | 📝 borrador listo |
| 001 | [Suscripciones compartidas (grupos, invitación, miembros, titular)](001-suscripciones-compartidas/spec.md) | 3, 4 | P0 | 003, 004 | Camila (BD) | 📝 borrador listo |
| 002 | [Cobros y pagos (generación mensual, comprobantes, confirmación, historial)](002-cobros-y-pagos/spec.md) | 5 | P0 | 001 | Leonardo (BE) | 📝 borrador listo |
| 005 | [Notificaciones (recordatorios, atrasos, invitaciones)](005-notificaciones/spec.md) | 6 | P1 | 002 | Leonardo (BE) | 📝 borrador listo |
| 006 | [Panel y reportes (gasto mensual, ahorro, calendario, deudas)](006-panel-y-reportes/spec.md) | 7 | P1 | 002 | Adrian (FE) | 📝 borrador listo |
| 007 | [Reputación (puntaje, insignias, ranking)](007-reputacion/spec.md) | 8 | P2 | 002 | Camila (BD) | 📝 borrador listo |
| 008 | [Cupos libres (publicar y buscar cupos)](008-cupos-libres/spec.md) | 9 | P2 | 001 | Adrian (FE) | 📝 borrador listo |
| 009 | [Administración (usuarios, catálogo, estadísticas)](009-administracion/spec.md) | 10 | P2 | 003, 004 | Adrian (FE) | 📝 borrador listo |

> Todas las specs están en **borrador** y esperan la revisión por capa (BD, Backend, Frontend). La numeración es de identificación, no de orden de ejecución. El orden real es el de la tabla (de arriba hacia abajo).
>
> **Líder de spec** = quien redacta y coordina la spec (según qué capa pesa más en esa feature). **Toda spec la aprueban las tres capas** (ver `CONTRIBUTING.md`). Las asignaciones son sugerencias.

## Nota sobre el módulo 4 (División y moneda)

Se incluye dentro de la spec 001 porque el cálculo de cuotas y la conversión USD→Bs ocurren al crear el grupo y al unirse miembros. Si la lógica crece, se puede extraer a una spec propia.

## Hitos sugeridos

1. **Hito 1 — Base lista:** setup + autenticación + catálogo.
2. **Hito 2 — Grupos funcionando:** crear suscripción, invitar, unirse, ver cuota.
3. **Hito 3 — MVP completo:** cobros mensuales, comprobantes, confirmación e historial. **Flujo E2E funcionando de punta a punta.**
4. **Hito 4 — P1:** notificaciones y panel.
5. **Hito 5 — P2:** reputación, cupos libres y administración.
6. **Hito 6 — Cierre:** pulido, documentación y presentación al profesor.

## Qué NO entra en el MVP

- Pasarela de pago real (los pagos son por QR/transferencia externos; la app solo registra comprobantes).
- Obtención automática del tipo de cambio desde una API externa (el titular lo ingresa).
- Aplicación móvil nativa (es web responsive).
- Chat entre miembros.
