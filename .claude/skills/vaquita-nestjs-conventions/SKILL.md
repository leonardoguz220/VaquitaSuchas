---
name: vaquita-nestjs-conventions
description: Convenciones de Vaquita para el backend NestJS: estructura de módulos, DTO con class-validator, guards por rol y pertenencia al grupo, errores, Swagger, subida de comprobantes, tareas programadas y tests de integración con supertest. Úsalo al crear o cambiar módulos, endpoints, guards, procesos programados o subida de archivos (capa Backend).
---

# Vaquita — NestJS (Backend)

Esta skill es **de apoyo**. Si contradice `CLAUDE.md`, la constitución o una spec, mandan ellos.
Stack acordado: NestJS + TypeScript, JWT con Passport, bcrypt, class-validator, Swagger, `@nestjs/schedule`, Jest + supertest (`CLAUDE.md` §4).

## Cuándo usarla

- Crear un módulo, endpoint, guard, DTO o proceso programado.
- Implementar subida de comprobantes o QR.
- Escribir tests de integración de la API.

## Reglas

1. **Un módulo por feature** (`auth`, `users`, `catalog`, `subscriptions`, `billing`, `notifications`...). Una responsabilidad por módulo.
2. **Lógica de dominio fuera del framework:** cálculo de cuotas, conversión y transiciones viven en funciones puras (ver `vaquita-money-and-billing`). Los servicios las llaman; los controladores no tienen reglas.
3. **Validación en el servidor, siempre** (`CLAUDE.md` §5): permisos, montos, estados. Cada entrada pasa por un DTO con `class-validator` y `ValidationPipe` con `whitelist: true` y `forbidNonWhitelisted: true`.
4. **Permisos en dos niveles:**
   - Rol global (`admin` / usuario) con guard.
   - **Pertenencia y rol dentro del grupo** (titular / miembro) comprobados en el servicio para cada recurso. Un usuario **solo ve datos de grupos a los que pertenece**. Responder `403` si el recurso existe pero no es suyo, o `404` si conviene no revelar su existencia (decídelo en el plan y sé consistente).
5. **Contraseñas** con bcrypt; nunca se guardan ni se registran en logs, tokens incluidos.
6. **Errores:** código HTTP correcto (`400` validación, `401` sin sesión, `403` sin permiso, `404`, `409` conflicto o estado inválido) y mensaje claro en español (Bolivia), sin detalles internos ni trazas.
7. **Contrato = Swagger.** Cada endpoint documenta ruta, DTO, respuestas y errores. El contrato se congela al aprobar el plan; cambiarlo requiere PR que avise a Frontend (`CLAUDE.md` §2.7).
8. **Configuración:** variables de entorno validadas al arrancar; secretos nunca en el repositorio. Mantén un `.env.example`.
9. **Fechas:** UTC en la base de datos y en las respuestas (ISO 8601). La conversión a La Paz la hace el frontend solo para mostrar.
10. **Idioma:** código, ramas y commits en inglés; mensajes al usuario en español.

## Tareas programadas (`@nestjs/schedule`)

- Procesos: generar cobros en la fecha de corte, marcar `atrasado` al pasar el vencimiento, enviar recordatorios (specs 002 y 005).
- Deben ser **idempotentes** y soportar ejecutarse dos veces o con retraso (por ejemplo si el servidor estuvo apagado): calculan "qué falta" según los datos, no según "qué hora es".
- La lógica es un servicio que se puede invocar directamente en los tests; el decorador `@Cron` solo la dispara.
- La zona de referencia de las fechas de corte es America/La_Paz.
- Plan gratuito de Render: puede dormir el servicio. Prevé cómo se garantiza que el proceso corra (decisión de la spec 000).

## Subida de comprobantes y QR (spec 002, RF-002-06)

- Aceptar solo JPG, PNG o PDF, máximo **5 MB**. Validar tipo real por contenido (no solo por extensión) y tamaño **en el servidor**.
- Guardar en el almacenamiento privado (Firebase Storage) con nombre generado por el sistema, nunca el nombre original.
- Entregar **URL firmada de corta duración**, y solo al titular y al miembro que lo subió.
- Conservar versiones anteriores del comprobante en el historial del cobro (RF-002-08).

## Estructura de un endpoint, paso a paso

1. Lee los criterios `CA-xxx` de la spec y la tabla de permisos.
2. DTO de entrada y de salida, con decoradores de validación y de Swagger.
3. Guard de autenticación y de rol; comprobación de pertenencia al grupo en el servicio.
4. Llamar a la función pura de dominio; persistir en una **transacción** si cambia más de una tabla.
5. Respuesta con los códigos y mensajes definidos.
6. Test de integración con supertest y base de datos de prueba.

## Tests

- **Un test de integración por criterio de aceptación**, con el ID (`CA-002-05`) en el nombre.
- Para cada endpoint prueba: caso feliz, sin sesión (`401`), rol incorrecto (`403`), grupo ajeno, entrada inválida (`400`) y estado inválido (`409`).
- Datos de prueba creados por el test; no dependen del orden de ejecución.
- Unitarios: 100 % de las reglas de dominio.

## Errores comunes (rechazar en la revisión)

- Endpoint sin comprobar que el usuario pertenece al grupo.
- Reglas de negocio dentro del controlador.
- DTO sin `whitelist`, o campos que el cliente puede enviar y no deberían (por ejemplo `estado`, `monto`).
- Devolver el objeto de base de datos completo (con hash de contraseña u otros campos internos).
- Mensajes de error con detalles de SQL o trazas.
- Procesos programados que asumen "corren exactamente a las 00:00".
- `console.log` de depuración o tokens en los logs.

## Antes de terminar

- [ ] Swagger actualizado y coherente con el plan.
- [ ] Un test por cada `CA-xxx` tocado, con permisos por rol.
- [ ] Sin secretos ni `console.log`; `.env.example` al día.
