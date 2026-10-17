# 0001. PostgreSQL como base de datos

- **Fecha:** 2026-10-17
- **Estado:** aceptada
- **Capas:** base de datos, backend

## Contexto

El equipo tenía experiencia previa con MongoDB y con PostgreSQL. Vaquita maneja dinero y cobros mensuales, y sus specs exigen garantías de integridad: un solo titular por grupo, un cobro único por grupo, miembro y período, montos exactos y estados limitados a un conjunto fijo.

## Decisión

Se usa PostgreSQL, con migraciones SQL numeradas en `database/migrations/`, un seed para el catálogo inicial y el driver `pg`. MongoDB queda como alternativa solo si la materia lo exige.

## Consecuencias

- Las reglas de integridad de las specs se pueden expresar como restricciones (únicas, claves foráneas y checks) y no dependen solo del código del backend.
- Los reportes e historiales se resuelven con consultas SQL.
- Falta elegir el proveedor de PostgreSQL gestionado, decisión que se cierra en la spec 000.
