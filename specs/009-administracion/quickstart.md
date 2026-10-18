# Guía de validación — Spec 009: Administración

Prerrequisito: specs 000, 001, 003 y 010 en local. Un administrador creado con `npm run seed:admin -w backend`, dos usuarios normales (A titular, B solicitante) y un grupo de A.

## 1. Acceso (CA-009-01, 20)

- Sin token o con un usuario normal: `GET /admin/users` → `401` / `403`.
- Como administrador: `GET /admin/users?q=ana` encuentra a la persona por nombre o correo (sin tildes ni mayúsculas) y la ficha muestra la CI como `*****123`.

## 2. Habilitar a un titular (CA-009-28)

```bash
npm run host:enable -w backend -- ana@example.com "Habilitada por el equipo"
```
o `POST /admin/users/<id>/host-enablement` con motivo. Con la habilitación, esa persona puede crear un grupo (`POST /groups`) aunque no tenga cobros; sin ella recibe `422 NOT_HOST_ELIGIBLE`.

## 3. Suspender y reactivar (CA-009-09 a 11, 13)

`POST /admin/users/<id>/suspend` con motivo de 10–300 caracteres: el usuario ya no puede iniciar sesión y su sesión abierta responde `401`. `reactivate` lo devuelve a `activo`. Sin motivo → `400`. Sobre otro administrador → `422`.

## 4. Reclamo y baneo (CA-009-25 a 27, 30, 33, 34)

1. Completar el flujo de la spec 010 hasta que A rechace el pago informado de B marcando el comprobante como falso y abra un reclamo (o B reclame que pagó y no entró).
2. Administrador: `GET /admin/disputes` → el reclamo aparece primero; `GET …/evidence` devuelve línea de tiempo, chat y comprobante y deja `reclamo_abrir_evidencia` en `GET /admin/audit-log`.
3. `POST …/resolve` con `estafa_confirmada`: la persona acusada queda `baneada`; su correo, celular, CI y Telegram no sirven para registrarse de nuevo; sus sesiones se cierran.
4. Si el baneado era titular: el grupo muestra "titular baneado", queda en solo lectura y sus cobros abiertos no pasan a `atrasado`.
5. Otro administrador: `POST /admin/bans/<id>/revoke` libera los datos; el mismo administrador que baneó recibe `422 SAME_ADMIN`.

## 5. Auditoría (CA-009-18, 19)

`GET /admin/audit-log?action=usuario_banear` muestra autor, motivo y fecha; no existen `PUT` ni `DELETE`, y un `UPDATE` directo en la base falla.

## 6. P2: catálogo, moderación y estadísticas

Se validan cuando se construya esa entrega: importar un CSV con una fila inválida no aplica nada; `GET /admin/stats` responde agregados y en menos de 2 s con 10.000 usuarios de prueba.
