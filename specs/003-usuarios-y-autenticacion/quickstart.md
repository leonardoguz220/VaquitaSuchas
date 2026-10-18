# Guía de validación — Spec 003: Usuarios y autenticación

Prerrequisito: spec 000 funcionando en local (`npm run db:up`, `db:migrate`, `npm run dev`) con `TELEGRAM_MODE=dev` y `MAIL_MODE=dev`.

## 1. Registro completo con el bot simulado (CA-003-01, 25, 27)

1. Abrir `http://localhost:3000/registro`, completar nombre, correo, CI (`1234567`), contraseña (`claveSegura1`) y aceptar la política.
2. En `/registro/verificar` copiar el token del enlace (la pantalla de desarrollo `/dev/telegram` lo muestra).
3. En `/dev/telegram`: **Enviar /start** y luego **Compartir contacto** con el número `+59171234567` de la misma cuenta de Telegram simulada.
4. **Esperado:** la pantalla de verificación pasa a "verificado" y redirige al panel con la sesión iniciada; `GET /api/auth/me` devuelve `ciMasked: "****567"`.

## 2. Casos de rechazo del bot (CA-003-25, 26, 28, 29)

- Compartir un contacto de otra cuenta de Telegram → el bot rechaza y la cuenta sigue sin verificar.
- Compartir un número `+54911…` → rechazo por no ser boliviano.
- Reusar el token → "El enlace venció".
- Pedir seis enlaces en una hora → el sexto responde `429`.

## 3. Sesión y bloqueo (CA-003-04 a 08)

1. Iniciar sesión: la cookie `vq_session` aparece como `HttpOnly` y no está en `document.cookie`.
2. Fallar la contraseña cinco veces: la sexta (incluso correcta) muestra la espera de 15 minutos.
3. Cerrar sesión y repetir una petición con el token anterior (desde las pruebas): `401`.

## 4. Recuperación de contraseña (CA-003-09 a 13, 16)

1. En `/recuperar` pedir el enlace para un correo existente y otro inexistente: mismo mensaje.
2. Abrir Mailpit (`http://localhost:8025`), usar el enlace, definir la contraseña nueva: el enlace deja de servir y llega el aviso de cambio.

## 5. Baneo (CA-003-21, 22, 30, 35)

Con la prueba `auth.ban.e2e-spec.ts` (o `npm run test -w backend -- auth.ban`): se banea una cuenta con la función de bloqueo y se comprueba que un registro con el correo `n.o.m.b.r.e+1@gmail.com`, la misma CI o el mismo celular recibe el mensaje genérico.

## 6. Administrador de desarrollo (CA-009-20)

```bash
SEED_ADMIN_EMAIL=admin@example.test SEED_ADMIN_PASSWORD='cambia-esto-123' npm run seed:admin -w backend
```
**Esperado:** crea un administrador; ejecutarlo de nuevo no duplica; sin las variables falla indicando cuáles faltan.
