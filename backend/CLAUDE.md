# Backend

Responsable: Leonardo Guzman. La carpeta se llena al implementar la spec 000; hasta entonces solo existe esta guía.

El backend es una API NestJS en TypeScript organizada por módulos y, dentro de cada módulo, en cuatro capas: `controllers`, `services`, `domain` y `repositories`. La descripción completa está en [`../context/arquitectura.md`](../context/arquitectura.md) y las reglas de negocio en [`../context/dominio.md`](../context/dominio.md).

Reglas de esta parte del código:

- Los controladores solo traducen HTTP y validan la entrada con DTO. No contienen reglas de negocio.
- Los servicios comprueban permisos y pertenencia al grupo, abren las transacciones y llaman al dominio y a los repositorios.
- El dominio son funciones puras sin dependencias de NestJS ni de `pg`.
- Los repositorios son los únicos que escriben SQL o hablan con Firebase Storage y el servicio de correo.
- El contrato de la API se documenta con Swagger y se congela al aprobar el plan.
- Un recurso de un grupo ajeno responde `404`; un miembro sin el rol necesario recibe `403`.

Skills relacionadas: `vaquita-nestjs-conventions`, `vaquita-money-and-billing`.
