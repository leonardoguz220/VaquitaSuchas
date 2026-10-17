# 0002. Arquitectura por capas

- **Fecha:** 2026-10-17
- **Estado:** propuesta, pendiente de revisión por las tres capas
- **Capas:** base de datos, backend, frontend

## Contexto

El equipo decidió que el código del proyecto seguirá una arquitectura por capas. Las reglas de negocio de Vaquita (cuotas, conversión, estados de cobro) deben probarse de forma aislada y vivir solo en el backend, y el frontend no debe duplicarlas.

## Decisión

El backend se organiza en cuatro capas por módulo: controladores, servicios, dominio y repositorios. El frontend se organiza en páginas, componentes, hooks, servicios de API y utilidades. La base de datos se organiza en migraciones, seeds y pruebas de integridad. Cada capa solo depende de la inferior, y el dominio no depende del framework ni de la base de datos. El detalle está en [`../arquitectura.md`](../arquitectura.md).

## Consecuencias

- El dominio se prueba con tests unitarios sin levantar NestJS ni la base de datos.
- Un cambio de proveedor de almacenamiento o de correo afecta solo a los repositorios.
- Cada integrante trabaja en su capa con límites claros, y la revisión cruzada de PR se apoya en esos límites.
- Cada módulo lleva más archivos que en una estructura plana, a cambio de separar las responsabilidades.
