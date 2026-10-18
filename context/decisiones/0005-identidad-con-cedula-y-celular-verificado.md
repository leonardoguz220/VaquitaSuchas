# 0005. Identidad con cédula y celular verificado

- **Fecha:** 2026-10-17
- **Estado:** aceptada (decisión del equipo); falta la revisión por capa de las specs
- **Capas:** base de datos, backend y frontend

## Contexto

La sanción para quien estafe es el baneo de la cuenta, y de nada sirve si la persona puede abrir otra con un correo nuevo. El diseño anterior bloqueaba solo el correo y el celular, y el celular era opcional y no estaba verificado, así que cualquiera podía registrarse otra vez con datos nuevos.

## Decisión

- El registro pide, además del nombre, el correo y la contraseña, un **celular boliviano** y una **cédula de identidad (CI)**. Ambos son obligatorios y únicos: no puede haber dos cuentas con el mismo celular ni la misma CI.
- El celular se **verifica con un código de 6 dígitos** que vence a los 10 minutos, con 5 intentos por código y 3 envíos por hora. La cuenta no queda activa hasta verificarlo.
- El correo no se verifica en esta etapa.
- Un **baneo bloquea los tres datos**: correo, celular y CI. Solo se guardan huellas irreversibles (hash con una clave del servidor), que se conservan de forma permanente. Rige igual para un titular que para un solicitante.
- La CI se guarda **cifrada**, para que un administrador la vea enmascarada, y con una huella para garantizar la unicidad y el bloqueo. Nunca se muestra a otros usuarios.
- El registro muestra una **política de datos corta** que explica qué se pide, para qué y cuánto se conserva, y se debe aceptar.
- El envío del código va detrás de una **abstracción de mensajería** (spec 000, RF-000-22), con modo `dev` (el código se escribe en el log) y `prod` (un proveedor por definir). Cambiar el canal no afecta a la spec 003.
- El celular de un miembro es visible para el titular y los demás miembros, pero el de un solicitante solo se muestra al titular después de ser aceptado.

## Alternativas consideradas

- **Pedir la CI solo a quienes quieran ser titulares.** Menos datos sensibles, pero un solicitante estafador (comprobante falso) quedaría fuera del bloqueo. El equipo decidió pedirla a todos.
- **Pedir una foto de la CI y que un administrador la revise.** Verifica mejor la identidad, pero obliga a guardar una imagen sensible y a revisarla a mano. Queda como opción si el equipo lo pide.
- **Solo bloquear correo y celular sin verificar.** Es lo más simple, pero el bloqueo se evade con un número prestado.

## Consecuencias

- Cambian las specs 003 (registro, verificación, CI, bloqueo, versión de sesión), 009 (el baneo recae en cualquiera y la ficha muestra la CI enmascarada) y 000 (mensajería).
- La CI es un dato personal sensible: se necesita la política de datos, cifrado en reposo y que nunca aparezca en logs ni en respuestas a otros usuarios.
- Verificar el celular tiene un costo por mensaje y depende de un proveedor. Se controla con un tope diario configurable.
- La CI funciona como identificador único y no como prueba de identidad: Vaquita no puede comprobar que el número sea real. El bloqueo sigue sin garantizar que una persona con otro celular y otra CI no abra una cuenta nueva.
- Quedan por confirmar el canal (SMS o WhatsApp), el formato exacto de la CI y el tratamiento de alias de correo, anotados en la sección 11 de la spec 003.
