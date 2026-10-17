# Constitución de Vaquita

Principios que Spec Kit usa para validar specs, planes y tareas. Las reglas de dominio detalladas (dinero, fechas, roles, estados y seguridad) están en `context/dominio.md` y forman parte de esta constitución; si hay una contradicción, se corrige en el mismo PR.

## Core Principles

### I. Spec primero (NON-NEGOTIABLE)
Nada se implementa sin una spec aprobada por las tres capas (BD, Backend y Frontend). La spec describe el *qué* y el *por qué*; el *cómo* vive en `plan.md`. Si la realidad contradice la spec, se actualiza la spec primero, en el mismo PR que el código.

### II. Dinero exacto y trazable
Los montos se guardan como enteros en centavos de Bs, nunca como `float`. Cada cobro guarda un snapshot del precio, la moneda, el tipo de cambio y el número de miembros usados. La suma de las cuotas siempre es igual al total; los centavos sobrantes los asume el titular.

### III. Criterios de aceptación verificables
Cada criterio de aceptación tiene un identificador (`CA-NNN-xx`) y al menos un test que lo cita. Las reglas de dominio (cuotas, conversión, redondeo, fechas, transiciones de estado) son funciones puras con cobertura completa.

### IV. Seguridad y privacidad por defecto
Un usuario solo ve los datos de los grupos a los que pertenece. Los permisos y las validaciones se aplican siempre en el servidor. Los comprobantes son privados y solo los ve el titular y quien los subió. Ningún secreto va al repositorio; las contraseñas se guardan con hash seguro.

### V. Contratos entre capas primero
El modelo de datos (BD) y el contrato de API (Backend) se definen y se congelan en el plan antes de construir. Los cambios se hacen por PR sobre el plan y avisando a las otras capas. El frontend nunca calcula reglas de negocio: las muestra.

### VI. Entrega por etapas y simplicidad
Todos los módulos del proyecto están dentro del alcance. Se construyen por etapas: primero el MVP completo y funcionando de punta a punta (P0), luego lo importante (P1) y al final los extras (P2). Se prefiere la solución más simple que cumpla la spec; no se agrega funcionalidad fuera de alcance.

### VII. Arquitectura por capas
El código se organiza por capas, y cada capa solo depende de la inferior. El backend se divide por módulo en controladores, servicios, dominio y repositorios; el frontend en páginas, componentes, hooks, servicios de API y utilidades; la base de datos en migraciones, seeds y pruebas de integridad. El dominio son funciones puras sin dependencias del framework ni de la base de datos. La estructura detallada está en `context/arquitectura.md`.

## Restricciones adicionales

- **Moneda y formato:** cobro en bolivianos (Bs); presentación `Bs 25,50`.
- **Fechas:** se guardan en UTC y se muestran en America/La_Paz (UTC-4); el día de cobro se ajusta al último día del mes cuando el mes es más corto.
- **Estados de un cobro:** `pendiente`, `en_revision`, `pagado`, `atrasado`, `cancelado`. Las transiciones válidas están en la spec 002 (RN-002-01); no se crean estados nuevos sin actualizar la spec.
- **Idioma:** interfaz y documentación en español (Bolivia); código, ramas y commits en inglés.
- **Stack:** definido en `context/stack.md` (Next.js, NestJS, PostgreSQL, todo en TypeScript).

## Flujo de desarrollo y calidad

- Flujo por feature: `specify → clarify → revisión por capa → plan → tasks → analyze → implement → converge`.
- Roles fijos por capa (ver `CONTRIBUTING.md`): Camila = BD, Leonardo = Backend, Adrian = Frontend. Los PRs se revisan entre capas distintas.
- Definición de terminado: criterios de aceptación cubiertos con tests, lint y tests en CI, revisión aprobada, spec/plan/tasks actualizados, sin secretos ni logs de depuración.

## Governance

Esta constitución prevalece sobre otras prácticas del proyecto. Enmendarla requiere un PR con aprobación de las tres personas del equipo y actualizar la versión. Todo PR debe verificar el cumplimiento de estos principios; la complejidad adicional debe justificarse en el plan. La guía operativa para trabajar con asistentes de IA está en `CLAUDE.md`.

**Version**: 1.1.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
