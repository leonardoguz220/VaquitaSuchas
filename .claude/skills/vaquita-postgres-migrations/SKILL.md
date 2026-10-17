---
name: vaquita-postgres-migrations
description: Procedimiento de Vaquita para diseñar el modelo PostgreSQL, escribir migraciones SQL numeradas, restricciones de integridad, el seed y los tests de integridad. Úsalo al crear o cambiar tablas, índices, restricciones, migraciones o datos semilla (capa Base de datos).
---

# Vaquita — PostgreSQL, migraciones y seed (Base de datos)

Esta skill es **de apoyo**. Si contradice `CLAUDE.md`, la constitución o una spec, mandan ellos.
La base de datos **refuerza la integridad con restricciones**; las reglas de negocio viven en el backend (`CLAUDE.md` §2.8).

## Cuándo usarla

- Definir o cambiar tablas, columnas, claves, índices o restricciones.
- Escribir una migración o el seed.
- Revisar si una regla de la spec se puede garantizar en la base.

## Reglas

1. **Una migración = un cambio**, numerada y en orden, en `database/migrations/` (por ejemplo `0007_add_billing_cycles.sql`). Una migración ya aprobada **no se edita**: se agrega otra.
2. **El modelo se congela al aprobar el plan.** Cambiarlo requiere PR que avise a Backend y Frontend (`CLAUDE.md` §2.7).
3. **Tipos:**
   - Dinero: `integer` o `bigint` en centavos, con `CHECK (monto >= 0)`. Nunca `float`, `real` ni `double precision`.
   - Tipo de cambio: `numeric(10,4)` con `CHECK (> 0)`.
   - Fechas y horas: `timestamptz` guardado en UTC. El día de cobro es `smallint` con `CHECK (BETWEEN 1 AND 31)`.
   - Estados: `text` con `CHECK (estado IN (...))` o un tipo `ENUM`, con los valores exactos de la spec.
   - Identificadores: `uuid` o `bigint` identity, uno solo en todo el proyecto.
4. **Restricciones que la spec exige** (no dejarlas solo en código):
   - Un solo titular por grupo (RN-001-01).
   - Un usuario no pertenece dos veces al mismo grupo (RN-001-05): `UNIQUE (grupo_id, usuario_id)`.
   - A lo más un cobro por (grupo, miembro, período) (RF-002-04): `UNIQUE`.
   - Cupos entre 2 y 20 y precio total entre Bs 1,00 y Bs 5.000,00 (RN-001-09) con `CHECK`.
   - Estados válidos de un cobro (`pendiente`, `en_revision`, `pagado`, `atrasado`, `cancelado`).
   - Claves foráneas con la acción de borrado explícita (por defecto `RESTRICT`; el historial no se borra en cascada).
5. **Copias históricas:** cobros y ciclos guardan snapshot de precio, moneda, tipo de cambio y nº de miembros (RF-002-02, RN-002-09); la suscripción guarda copia del catálogo (RN-001-12). No dependen de joins hacia datos editables.
6. **Borrado:** no hay borrado físico del catálogo (RF-009-04); usar un indicador de activo. El log de auditoría es de solo anexado (RNF-009-05).
7. **Índices:** uno por cada consulta frecuente descrita en la spec (cobros de un grupo por período, cobros pendientes de un usuario, vencimientos). Justificar en el plan, no por intuición.
8. **Privacidad:** guardar solo hash de contraseña. Nada de contraseñas ni tokens en texto plano ni en el seed.

## Procedimiento para cada cambio

1. Lee la spec: ¿qué reglas debe garantizar la base?
2. Lista las restricciones necesarias y a qué `RN-xxx` corresponde cada una.
3. Escribe la migración. Debe poder correrse en una base vacía y sobre la versión anterior.
4. **Escribe el test de integridad:** un test por restricción que intente violarla y espere el error de la base (por ejemplo, insertar un segundo cobro del mismo período debe fallar). Nómbralo con el `CA-xxx` o `RN-xxx` que protege.
5. Revisa `EXPLAIN` de las consultas principales con datos de prueba abundantes antes de agregar índices.
6. Actualiza el modelo en `plan.md` y avisa a Backend y Frontend si cambia algo del contrato.

## Seed

- Solo **datos de prueba** y el catálogo inicial (spec 004). Nada de datos reales de personas.
- Camila verifica los precios y cupos del catálogo contra fuentes oficiales y anota la fecha y la fuente.
- El primer administrador **no** va con contraseña fija en el repositorio: se crea con un comando y variables de entorno (RF-009-02).
- El seed es repetible: correrlo dos veces no duplica filas.

## Errores comunes (rechazar en la revisión)

- Reglas de unicidad o estados solo validadas en el backend.
- `float` o `numeric` sin escala para dinero.
- Fechas locales en vez de UTC.
- Migraciones que editan una anterior ya aprobada.
- Borrado en cascada que destruye historial.
- Índices sin una consulta que los justifique.
- Secretos o credenciales en el seed o en el repositorio.

## Antes de terminar

- [ ] Cada restricción de la spec tiene su test de integridad.
- [ ] La migración corre en base vacía y sobre la versión anterior.
- [ ] El plan refleja el modelo y se avisó a las otras capas si cambió.
