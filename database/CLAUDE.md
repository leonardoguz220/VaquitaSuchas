# Base de datos

Responsable: Camila Fuentes. La carpeta se llena al implementar la spec 000; hasta entonces solo existe esta guía.

La base de datos es PostgreSQL. Se organiza en `migrations/` (archivos SQL numerados, uno por cambio), `seeds/` (catálogo inicial y datos de prueba) y `tests/` (pruebas de integridad). La descripción completa está en [`../context/arquitectura.md`](../context/arquitectura.md).

Reglas de esta parte del código:

- Una migración aprobada no se edita; los cambios van en una migración nueva.
- Los montos son enteros en centavos, las fechas son `timestamptz` en UTC y los estados tienen restricciones con los valores exactos de la spec.
- Las reglas de integridad de las specs se expresan como restricciones: un titular por grupo, un cobro por grupo, miembro y período, y límites de cupos y de precio.
- Cada restricción tiene una prueba que intenta violarla.
- El seed contiene solo datos de prueba y el catálogo; los precios del catálogo se verifican con fuentes oficiales.
- El modelo se congela al aprobar el plan, y los cambios se avisan a backend y frontend.

Skills relacionadas: `vaquita-postgres-migrations` (y, archivada, `ia/skills-archivadas/performance-optimization/`).
