# Proyecto Vaquita

Vaquita es una aplicación web para organizar suscripciones compartidas (Netflix, Spotify, Disney+, YouTube Premium y similares) entre amigos, familia o compañeros de departamento. Calcula la cuota de cada miembro, convierte los precios de dólares a bolivianos, genera los cobros de cada mes, gestiona los comprobantes de pago y conserva un historial visible para todo el grupo.

## Equipo

Grupo Suchas. Los roles son fijos y corresponden a una capa del sistema. El detalle de responsabilidades está en [`CONTRIBUTING.md`](../CONTRIBUTING.md).

| Persona | Capa |
|---|---|
| Camila Fuentes | Base de datos |
| Leonardo Guzman | Backend |
| Adrian Vargas | Frontend |

## Objetivo del MVP

Un titular crea una suscripción compartida, invita a los miembros y gestiona los pagos mensuales. Cada miembro ve su cuota y sube su comprobante; el titular confirma o rechaza el pago; el historial queda disponible para todo el grupo.

## Alcance

Entran los diez módulos del proyecto. La prioridad define el orden de construcción y no si se hace: primero el MVP (P0), después lo importante (P1) y al final los extras (P2). El mapa de módulos y specs está en [`specs/00-roadmap.md`](../specs/00-roadmap.md).

| Módulo | Spec |
|---|---|
| Usuarios y autenticación | 003 |
| Catálogo de servicios | 004 |
| Suscripciones compartidas, división y moneda | 001 |
| Cobros y pagos | 002 |
| Notificaciones | 005 |
| Panel y reportes | 006 |
| Reputación | 007 |
| Cupos libres | 008 |
| Administración | 009 |

La spec 000 cubre la preparación del proyecto (repositorio, integración continua, base de datos y estructura).

## Fuera del alcance

- Pasarela de pago real: los pagos se hacen por QR o transferencia fuera de la app, y la app solo registra comprobantes.
- Obtención automática del tipo de cambio desde una API externa: lo ingresa el titular.
- Aplicación móvil nativa: la aplicación es web con diseño adaptable a celular.
- Chat entre miembros.

## Documentos relacionados

- Funcionamiento completo del sistema: [`funcionamiento-del-sistema.md`](funcionamiento-del-sistema.md)
- Reglas de dominio: [`dominio.md`](dominio.md)
- Stack técnico: [`stack.md`](stack.md)
- Arquitectura por capas: [`arquitectura.md`](arquitectura.md)
- Decisiones registradas: [`decisiones/`](decisiones/)
- Constitución: [`.specify/memory/constitution.md`](../.specify/memory/constitution.md)
