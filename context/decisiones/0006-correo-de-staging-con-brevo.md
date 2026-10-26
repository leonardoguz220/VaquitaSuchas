# 0006. Correo de staging con Brevo

- **Fecha:** 2026-10-26
- **Estado:** aceptada el 2026-10-26 (decisión de Leonardo al configurar staging, T050)
- **Capas:** BE

## Contexto

T050 pedía elegir el proveedor de correo de staging entre Resend y Brevo. El backend soporta ambos (`MAIL_PROVIDER=resend|brevo`).

## Decisión

Staging usa **Brevo** (plan gratuito, 300 correos al día) con un remitente individual verificado como `MAIL_FROM`. La clave de API (`BREVO_API_KEY`) vive solo en las variables de entorno de Render, con permiso solo para correo transaccional.

## Alternativas consideradas

- **Resend.** Sin dominio propio verificado solo envía al correo del dueño de la cuenta, lo que no sirve para probar con otros integrantes. Comprar un dominio solo para staging no se justifica.

## Consecuencias

- Producción puede cambiar de proveedor con solo variables de entorno.
- Si se compra un dominio, se puede verificar en Brevo o pasar a Resend sin tocar código.
