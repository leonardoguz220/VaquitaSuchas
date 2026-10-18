# Guía de validación — Spec 001: Suscripciones compartidas

Prerrequisito: specs 000, 003 y 004 en local; un usuario habilitado como titular (con el seed de desarrollo, o `npm run host:enable -w backend -- <correo>` de la spec 009).

## 1. Elegibilidad (CA-001-24, 25)

1. Con un usuario sin habilitar, entrar a `/grupos` y pulsar **Crear suscripción**: el panel explica qué falta (4,5 estrellas con 6 cobros, o habilitación de un administrador).
2. Con el titular habilitado, el asistente `/grupos/nuevo` se abre.

## 2. Crear y calcular (CA-001-01 a 05, 17, 21)

1. Crear una suscripción de Netflix: USD 10,00, tipo de cambio 6,96, día de cobro 31, 3 cupos.
2. **Esperado:** el resumen muestra total Bs 69,60; con 1 miembro (el titular) la cuota de referencia es Bs 69,60; el código tiene 8 caracteres sin `0 O 1 I L`.
3. Con `POST /groups/quote` para Bs 100,00 y 3 miembros: `baseShareCents: 3333`, `ownerShareCents: 3334`.
4. En la prueba `billing-calendar.spec.ts`, el día de cobro 31 de febrero resulta 28 (29 en bisiesto).

## 3. Ventana de ingreso (CA-001-26, 27)

```bash
npm run test -w backend -- entry-window
```
**Esperado:** con corte el día 10, el día 13 a las 23:59 de La Paz la ventana está abierta y el día 14 a las 00:00 cerrada, con `opensAt` = próximo día 10; un grupo recién creado está abierto sus primeros 3 días.

## 4. Permisos (CA-001-10, 11)

Con una segunda cuenta que no es miembro: `GET /groups/<id>` → `404`. Como miembro, `PATCH /groups/<id>` → `403`.

## 5. Gestión (CA-001-13 a 16, 28)

- Transferir la titularidad a un miembro habilitado: el anterior queda como miembro y hay un solo titular.
- Intentar transferir a un miembro no habilitado: `422 NOT_HOST_ELIGIBLE`.
- Crear grupos hasta el quinto; el sexto responde `422 TOO_MANY_ACTIVE_GROUPS`.
- Cerrar el grupo: editar o unirse responde `422 GROUP_CLOSED`.

## 6. Datos de pago (CA-001-23)

Subir un QR PNG de 1 MB y un texto: un miembro los ve en `GET /groups/<id>`; un PDF o un archivo de 3 MB se rechaza y se conserva el QR anterior.
