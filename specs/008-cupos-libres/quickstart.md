# Guía de validación — Spec 008: Cupos libres

Prerrequisito: specs 000, 001, 002, 003, 005-A, 007 (núcleo) y 010 en local. Un titular habilitado con un grupo de 4 cupos totales y 2 miembros.

## 1. Publicar (CA-008-01 a 05)

1. Titular: `POST /groups/<id>/listing` con `{ "slotsOffered": 2 }` → `201`, `expiresAt` a 30 días.
2. Segunda publicación del mismo grupo → `409 LISTING_ALREADY_ACTIVE`. En un grupo lleno → `422 NO_FREE_SLOTS`.
3. Otro usuario: `GET /listings` muestra la publicación con `estimatedShareCents` (total ÷ (miembros + cupos)); el JSON no trae nombres de miembros, datos de pago ni código.

## 2. Buscar (CA-008-06, 07, 23)

`GET /listings?q=netflix&sort=cuota`: solo Netflix, de menor a mayor cuota. Un miembro del grupo no ve las del suyo. Con la ventana cerrada, `entryWindow.opensAt` trae la fecha y `canRequest` es `false`.

## 3. Solicitar y aceptar (CA-008-08 a 13, 20, 21, 24)

1. `POST /listings/<id>/requests` con un mensaje de 250 caracteres → `400`; con 200 → `201` y la solicitud aparece en `/solicitudes` con la marca «Desde publicación».
2. El titular envía datos de pago, el solicitante sube el comprobante y el titular confirma (flujo de la spec 010). Con 1 cupo ofrecido y 3 solicitudes abiertas, al confirmar la primera las otras pasan a `rechazada` y la publicación a `cerrada`.

## 4. Vencimiento y eventos (CA-008-14, 16)

```bash
npm run test -w backend -- listings.expire listings.events
```
Con el reloj de pruebas a +31 días la publicación pasa a `expirada` y puede renovarse. Cerrar el grupo cierra la publicación y rechaza las solicitudes pendientes.

## 5. Reportes y texto plano (CA-008-17 a 19)

Tres usuarios distintos reportan: la publicación sale de la búsqueda y el titular recibe el aviso. Un segundo reporte del mismo usuario → `409`. Una descripción `<script>alert(1)</script>` se ve como texto en `/cupos/<id>`.
