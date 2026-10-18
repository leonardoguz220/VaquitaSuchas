# 0005. Identidad con cédula y celular verificado por Telegram

- **Fecha:** 2026-10-17, actualizada el 2026-10-18
- **Estado:** aceptada (decisión del equipo); falta la revisión por capa de las specs
- **Capas:** base de datos, backend y frontend

## Contexto

La sanción para quien estafe es el baneo de la cuenta, y de nada sirve si la persona puede abrir otra con un correo nuevo. El diseño anterior bloqueaba solo el correo y el celular, y el celular era opcional y no estaba verificado, así que cualquiera podía registrarse otra vez con datos nuevos.

La primera propuesta verificaba el celular con un código por SMS. Cuesta por mensaje (un proveedor consultado cobra entre USD 0,19 y USD 0,26 por SMS a Bolivia) y el proyecto es una demo sin ingresos, así que el equipo prefirió un camino sin costo.

## Decisión

- El registro pide nombre, correo, **cédula de identidad (CI)** y contraseña, y el celular se obtiene al verificarlo. La CI y el celular son **obligatorios** y **únicos**.
- El celular se verifica con el **bot de Telegram de Vaquita**. La app muestra un enlace con un token de un solo uso que vence a los 10 minutos; la persona lo abre, pulsa "Iniciar" y comparte su contacto con el botón de Telegram. El bot acepta el contacto solo si pertenece a la misma cuenta de Telegram que escribe y si es un número boliviano. No hay SMS ni costo por mensaje.
- La cuenta de Telegram queda vinculada al usuario, es única y sirve después para los avisos de la spec 005. El correo no se verifica en esta etapa.
- Un **baneo bloquea cuatro datos**: correo (normalizado sin puntos ni alias en Gmail), celular, CI y cuenta de Telegram. Solo se guardan huellas irreversibles (hash con una clave del servidor), que se conservan de forma permanente. Rige igual para un titular que para un solicitante.
- La CI es solo el número, sin foto. Se guarda **cifrada**, para que un administrador la vea enmascarada, y con una huella para garantizar la unicidad y el bloqueo. Nunca se muestra a otros usuarios.
- El registro muestra una **política de datos corta** que explica qué se pide, para qué y cuánto se conserva, y se debe aceptar.
- El bot va detrás de una abstracción (spec 000, RF-000-22), con un modo `dev` que simula la conversación sin red y un modo `prod` con el bot real.
- El celular de un miembro es visible para el titular y los demás miembros, pero el de un solicitante solo se muestra al titular después de ser aceptado.

## Alternativas consideradas

- **Código por SMS.** Es el método más conocido y no exige otra aplicación, pero cuesta por mensaje y depende de un proveedor. Se descartó por costo.
- **Código por WhatsApp.** En Bolivia está más extendido que Telegram, pero su API de empresas exige configurar una cuenta de empresa y puede cobrar por mensaje. No se evaluó a fondo.
- **Firebase Authentication por teléfono.** En el plan gratuito el SMS figura como no disponible y en el plan de pago se cobra por SMS enviado.
- **Pedir la CI solo a quienes quieran ser titulares.** Menos datos sensibles, pero un solicitante estafador (comprobante falso) quedaría fuera del bloqueo. El equipo decidió pedirla a todos.
- **Pedir una foto de la CI y que un administrador la revise.** Verifica mejor la identidad, pero obliga a guardar una imagen sensible y a revisarla a mano. Queda como opción futura.
- **No verificar el celular.** Es gratis y simple, pero el bloqueo del baneo se evade con un número ajeno.

## Consecuencias

- **Quien no tenga Telegram no puede registrarse.** El equipo aceptó esta limitación. Si más adelante resulta un problema, se puede sumar el SMS como respaldo de pago.
- Cambian las specs 003 (registro, verificación, CI, bloqueo, versión de sesión), 005 (la cuenta de Telegram ya está vinculada), 009 (el baneo recae en cualquiera y la ficha muestra la CI enmascarada) y 000 (bot de Telegram).
- El bot pasa a ser parte del MVP (P0), porque el registro depende de él, aunque los avisos por Telegram sigan siendo P1.
- El servicio gratuito de Render se duerme tras 15 minutos sin tráfico. Un mensaje de Telegram recibido por un webhook lo despierta, pero la primera respuesta puede demorar. El plan de la spec 000 debe resolverlo.
- La CI es un dato personal sensible: se necesita la política de datos, cifrado en reposo y que nunca aparezca en logs ni en respuestas a otros usuarios.
- La CI funciona como identificador único y no como prueba de identidad: Vaquita no puede comprobar que el número sea real. Una persona con otro número boliviano, otra CI y otra cuenta de Telegram todavía puede abrir una cuenta nueva.
