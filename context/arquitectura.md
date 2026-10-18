# Arquitectura por capas

- **Estado:** propuesta, pendiente de revisión por capa (Camila, Leonardo y Adrian)
- **Decisión registrada en:** [`decisiones/0002-arquitectura-por-capas.md`](decisiones/0002-arquitectura-por-capas.md)

El código de Vaquita se organiza por capas. Cada capa tiene una responsabilidad y solo depende de la capa que tiene debajo. El sistema completo se reparte además entre tres partes (base de datos, backend y frontend), cada una con su propia estructura interna.

## Vista general

```
Frontend (Next.js)
   │  HTTP, solo a través del proxy /api
   ▼
Backend (NestJS)
   │  consultas SQL por medio de repositorios
   ▼
Base de datos (PostgreSQL)
```

El frontend nunca habla con la base de datos ni calcula reglas de negocio. El backend es el único que escribe en la base de datos. La base de datos refuerza la integridad con restricciones.

## Backend

Cada módulo del backend (`auth`, `users`, `catalog`, `subscriptions`, `billing`, `notifications`, `reports`, `reputation`, `listings`, `join-requests`, `admin`) se divide en cuatro capas.

```
backend/src/
├── modules/
│   └── billing/
│       ├── controllers/     capa de presentación: rutas, DTO, guards, documentación Swagger
│       ├── services/        capa de aplicación: casos de uso, permisos por grupo, transacciones
│       ├── domain/          capa de dominio: funciones puras (cuotas, conversión, estados, fechas)
│       └── repositories/    capa de acceso a datos: consultas SQL con `pg`, almacenamiento, correo
├── app-adapters/            adaptadores que implementan puertos de un módulo con datos de otro
├── shared/                  configuración, errores, guards comunes, utilidades
└── main.ts
```

| Capa | Contiene | Puede depender de | No puede |
|---|---|---|---|
| Presentación (`controllers`) | Rutas, DTO con class-validator, guards de rol, Swagger | `services` | Tener reglas de negocio ni consultar la base de datos |
| Aplicación (`services`) | Casos de uso, comprobación de pertenencia al grupo, transacciones | `domain`, `repositories` | Escribir SQL ni conocer detalles de HTTP |
| Dominio (`domain`) | Cálculo de cuotas, conversión USD a Bs, redondeo, fechas de cobro, transiciones de estado | Nada del framework ni de la base de datos | Importar NestJS, `pg` ni ningún servicio |
| Acceso a datos (`repositories`) | Consultas SQL, almacén de archivos (Supabase Storage), bot de Telegram, envío de correo | La base de datos y los servicios externos | Aplicar reglas de negocio |

Las tareas programadas (generación de cobros, marca de atrasos, recordatorios) viven en `services` y se disparan con `@nestjs/schedule`. La lógica que calculan sale de `domain`.

Un módulo puede usar los servicios de otro módulo, pero nunca sus repositorios. Los módulos no se importan entre sí de forma circular.

## Frontend

```
frontend/src/
├── app/            capa de presentación: páginas, layouts y rutas por rol (Next.js App Router)
│   └── api/[...path]/   proxy hacia el backend con la cookie httpOnly
├── components/
│   ├── ui/         componentes base reutilizables (button, card, modal, field, select, badge)
│   └── features/   componentes de cada módulo (cobros, grupos, panel)
├── hooks/          estado y carga de datos que usan los componentes
├── services/       cliente de la API: una función por endpoint, con los tipos del contrato
└── lib/            formato de Bs, fechas en America/La_Paz y utilidades
```

El orden de dependencia es `app` → `components` → `hooks` → `services` → `lib`. Los componentes no llaman a `fetch` directamente y ninguna capa calcula cuotas ni estados.

## Base de datos

```
database/
├── migrations/     archivos SQL numerados, uno por cambio (0001_init.sql, ...)
├── seeds/          catálogo inicial y datos de prueba
└── tests/          pruebas de integridad: cada restricción se verifica intentando violarla
```

El modelo de datos se define en el `plan.md` de cada feature y se congela al aprobarlo. Cambiarlo requiere un PR que avise a las otras capas.

## Relación con el flujo del proyecto

- Cada capa del código tiene su responsabilidad documentada en la spec y en el `plan.md`: el modelo en la sección de base de datos, el contrato y el dominio en la del backend, las pantallas en la del frontend.
- Los tests siguen la misma división: unitarios para `domain`, integración con supertest para `controllers` y `services`, pruebas de integridad en `database/tests` y E2E con Playwright para el flujo completo.
- Las reglas de negocio viven solo en `domain` y `services` del backend.
