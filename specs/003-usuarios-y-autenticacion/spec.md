# Spec 003 — Usuarios y autenticación

- **Estado:** borrador
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Adrian Vargas (Frontend): pendiente · Leonardo Guzman (Backend): pendiente
- **Prioridad:** P0 (MVP)
- **Depende de:** 000 (Setup del proyecto, incluido el servicio de correo)
- **Módulo cubierto:** 1 (Usuarios y autenticación)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Toda la app gira alrededor de personas que comparten dinero: hay que saber quién es cada una, protegerla de accesos ajenos y permitirle recuperar su cuenta. Esta spec define el registro, el inicio y cierre de sesión, la recuperación de contraseña y el perfil.

## 2. Objetivos

- Que una persona cree su cuenta y entre en menos de un minuto.
- Que sus datos y sus grupos solo sean accesibles con su sesión.
- Que pueda recuperar el acceso si olvida su contraseña, sin revelar a terceros quién tiene cuenta.
- Que mantenga su perfil (nombre y celular) para que los grupos la reconozcan.
- Que cada cuenta corresponda a una persona real e identificable: celular verificado y cédula de identidad únicos, de modo que quien estafe no pueda volver con otra cuenta.

## 3. Fuera de alcance

- Inicio de sesión con Google u otras redes sociales.
- Verificación obligatoria del correo antes de usar la app (ver pregunta abierta).
- Foto de perfil subida por el usuario (se muestran iniciales).
- Autenticación de dos factores.
- Eliminación definitiva de la cuenta (ver pregunta abierta).
- Administración de usuarios por un administrador (spec 009).

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Visitante | Registrarse, iniciar sesión, pedir recuperación de contraseña | Ver cualquier dato de la app |
| Usuario | Ver y editar su perfil, cambiar su contraseña, cerrar sesión | Ver o editar el perfil de otros; ver el correo de otros usuarios |
| Administrador | (spec 009) | — |

## 5. Historias de usuario

- **HU-003-01:** Como visitante, quiero registrarme con mi correo y una contraseña para usar Vaquita.
- **HU-003-02:** Como usuario, quiero iniciar y cerrar sesión de forma segura.
- **HU-003-03:** Como usuario, quiero recuperar mi contraseña desde mi correo si la olvido.
- **HU-003-04:** Como usuario, quiero editar mi nombre y mi celular para que mis compañeros me identifiquen.
- **HU-003-07:** Como visitante, quiero verificar mi celular con un código, para demostrar que el número es mío.
- **HU-003-05:** Como usuario, quiero cambiar mi contraseña estando dentro de la app.
- **HU-003-06:** Como usuario, quiero que, si me bloquean por intentos fallidos, el bloqueo sea temporal y claro.

## 6. Requisitos funcionales

### Registro
- **RF-003-01:** El registro pide: nombre completo (2 a 80 caracteres), correo electrónico, **celular**, **cédula de identidad (CI)**, contraseña y confirmación de contraseña. El celular y la CI son **obligatorios**. El usuario también acepta la política de datos (RF-003-23).
- **RF-003-02:** El correo es único sin distinguir mayúsculas y se guarda normalizado (minúsculas, sin espacios).
- **RF-003-03:** La contraseña cumple la política: mínimo 10 caracteres, al menos una letra y un número, y no puede ser igual al correo.
- **RF-003-04:** El registro se completa al verificar el celular (RF-003-21); recién entonces el usuario queda con sesión iniciada. Una cuenta sin verificar no puede iniciar sesión y se elimina a las 24 horas.
- **RF-003-05:** El celular se guarda como número boliviano (8 dígitos, empieza con 6 o 7) con prefijo `+591`. Es **único**: no puede haber dos cuentas con el mismo celular.
- **RF-003-21 (Verificación del celular):** el sistema envía al celular un código de 6 dígitos que vence a los 10 minutos. Se permiten 5 intentos por código y hasta 3 envíos por hora por celular. Con el código correcto el celular queda verificado. El envío se hace a través de la abstracción de mensajería de la spec 000 (RF-000-22). _(Decidido 2026-10-17)_
- **RF-003-22 (Cédula de identidad):** la CI es **única** por cuenta y no se puede editar. Se guarda **cifrada** (para mostrarla enmascarada a un administrador) y con una huella irreversible (para la unicidad y el bloqueo). Nunca se muestra a otros usuarios ni se devuelve en respuestas a quien no sea su dueño; el administrador la ve enmascarada (spec 009, RF-009-09).

### Sesión
- **RF-003-06:** El inicio de sesión usa correo y contraseña. Al ingresar, el backend emite un JWT que el frontend guarda en una **cookie httpOnly, `Secure` y `SameSite=Lax`**; el navegador nunca lee el token.
- **RF-003-07:** La sesión dura 7 días desde la última actividad (renovación deslizante). Cerrar sesión elimina la cookie e invalida el token en el servidor mediante una **versión de sesión por usuario** (`session_version`): cerrar sesión, cambiar la contraseña o ser baneado incrementa la versión y los tokens anteriores dejan de servir. _(Decidido 2026-10-17)_
- **RF-003-08:** Los endpoints protegidos rechazan peticiones sin sesión válida con `401`.
- **RF-003-09:** El usuario puede ver en su perfil la fecha del último inicio de sesión.

### Recuperación de contraseña
- **RF-003-10:** El usuario ingresa su correo y recibe un enlace de recuperación. La respuesta de la pantalla es **siempre la misma**, exista o no la cuenta.
- **RF-003-11:** El enlace contiene un token aleatorio de un solo uso que vence a los 30 minutos. En la base de datos solo se guarda su hash.
- **RF-003-12:** Al restablecer la contraseña con éxito, el token se invalida, se cierran todas las demás sesiones del usuario y se le avisa por correo que su contraseña cambió.
- **RF-003-13:** Si el usuario pide un nuevo enlace, los anteriores dejan de funcionar.

### Perfil
- **RF-003-14:** El usuario puede editar su nombre y su celular. Un celular nuevo debe verificarse con un código (RF-003-21) y ser único; mientras no se verifique se conserva el anterior. El correo y la CI no se pueden editar en esta etapa.
- **RF-003-15:** El usuario puede cambiar su contraseña ingresando la actual y la nueva; al hacerlo se cierran sus otras sesiones.
- **RF-003-16:** Las demás personas ven de un usuario únicamente lo que define la regla RN-003-03.

### Protección
- **RF-003-17:** Tras 5 intentos fallidos de inicio de sesión en 15 minutos para un mismo correo, se bloquea el inicio de sesión de ese correo por 15 minutos. También hay un límite por dirección IP.
- **RF-003-18:** Los pedidos de recuperación de contraseña tienen límite: máximo 3 por correo cada hora.

### Cuentas baneadas
- **RF-003-19:** Cuando se banea una cuenta (spec 009), el sistema guarda una huella irreversible (hash con una clave del servidor) de su correo normalizado, de su celular y de su CI. El registro rechaza cualquier correo, celular o CI cuya huella esté bloqueada, con el mensaje genérico "No es posible crear la cuenta con estos datos", sin indicar cuál dato fue el bloqueado. Las huellas se conservan de forma permanente, aunque se eliminen los demás datos de la cuenta. Aplica a un titular y a un solicitante baneados por igual.
- **RF-003-20:** Una cuenta baneada no puede iniciar sesión ni recuperar su contraseña, y sus sesiones activas se cierran. El mensaje es el mismo genérico de acceso no disponible.
- **RF-003-23 (Política de datos):** el registro muestra una política corta que explica qué datos se piden (nombre, correo, celular y CI), para qué se usan (identificar a las personas y bloquear a quien estafe) y cuánto se conservan, y exige aceptarla. Se guarda la fecha de aceptación. _(Decidido 2026-10-17)_

## 7. Requisitos no funcionales

- **RNF-003-01 (Seguridad):** contraseñas con hash `argon2id` (o `bcrypt` con costo mínimo 12), nunca registradas en logs ni devueltas en respuestas.
- **RNF-003-02 (Seguridad):** el mensaje de error de inicio de sesión es genérico ("Correo o contraseña incorrectos") sin revelar cuál falló.
- **RNF-003-03 (Seguridad):** el inicio de sesión tarda aproximadamente lo mismo exista o no el correo, para no filtrar cuentas por tiempo de respuesta.
- **RNF-003-04 (Usabilidad):** los formularios validan en vivo, funcionan bien en celular y muestran los mensajes en español (Bolivia).
- **RNF-003-05 (Privacidad):** el correo de un usuario nunca se muestra a otros usuarios.
- **RNF-003-06 (Rendimiento):** registro e inicio de sesión responden en menos de 1 segundo en condiciones normales.

## 8. Reglas de negocio

- **RN-003-01:** Cada usuario tiene un rol de sistema: `usuario` (por defecto) o `admin`. Nadie se registra como admin; los administradores se crean con el seed o por otro admin (spec 009).
- **RN-003-02:** Un usuario puede tener estado `activo`, `suspendido` o `baneado` (spec 009). Un usuario suspendido o baneado no puede iniciar sesión. La suspensión es reversible; el baneo es permanente y bloquea además los datos de la cuenta (RF-003-19).
- **RN-003-03 (Visibilidad entre usuarios):** dentro de un grupo, todos ven el **nombre** de los demás miembros; el titular y los miembros se ven mutuamente el **celular**, que siempre existe y está verificado, para poder coordinar pagos. Un solicitante de ingreso solo comparte su celular con el titular después de ser aceptado (spec 010, RNF-010-02). El correo y la CI no se comparten.
- **RN-003-04:** El nombre en la app es el nombre del perfil; el titular puede pedir al miembro que lo coloque tal como figura en su banco, pero la app no lo exige.
- **RN-003-05:** Las fechas de sesión y de tokens se manejan en UTC.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Registro con correo ya existente | Error "Ese correo ya está registrado" (el registro sí puede revelar esto; ver pregunta abierta) |
| Contraseña débil | Mensaje con las reglas incumplidas |
| Correo con mayúsculas o espacios | Se normaliza antes de comparar |
| Inicio de sesión con cuenta suspendida | Mensaje genérico de acceso no disponible, sin detalles |
| Recuperación para un correo que no existe | Misma respuesta que si existiera; no se envía correo |
| Enlace de recuperación vencido o ya usado | Mensaje claro y opción de pedir uno nuevo |
| Cambio de contraseña con la actual incorrecta | Error; no se cambia nada y cuenta como intento fallido |
| Cookie manipulada o JWT inválido | `401` y se borra la cookie |
| Dos registros simultáneos con el mismo correo | Solo uno se crea (restricción única en base de datos) |
| Falla el envío del correo de recuperación | Se registra el error y se reintenta; el usuario ve el mensaje genérico |
| Celular con formato inválido | Error de validación en el campo |
| Registro con el correo, el celular o la CI de una cuenta baneada | Se rechaza con el mensaje genérico, también si el correo cambia solo en mayúsculas o espacios |
| Registro con un correo, un celular y una CI nuevos de una persona baneada | No se puede detectar con solo estos datos; es el límite de la medida (ver la pregunta abierta sobre identidad) |
| Celular o CI ya registrados en otra cuenta | Se rechaza con un mensaje que indica que ya existe una cuenta con ese dato |
| Código de verificación vencido, incorrecto 5 veces o pedido más de 3 veces por hora | Mensaje claro; se debe pedir un código nuevo o esperar |
| Falla el envío del código al celular | Se registra el error; el usuario puede pedir un reenvío dentro del límite |
| Cuenta sin verificar pasadas 24 horas | Se elimina y el celular, la CI y el correo quedan libres |

## 10. Criterios de aceptación

- **CA-003-01:** Dado un visitante con datos válidos, cuando se registra, entonces se crea el usuario, su contraseña se guarda con hash y queda con sesión iniciada.
- **CA-003-02:** Dado un correo ya registrado (aunque con otras mayúsculas), cuando alguien intenta registrarse, entonces se rechaza.
- **CA-003-03:** Dada una contraseña de 8 caracteres, cuando se registra, entonces se rechaza indicando la política.
- **CA-003-04:** Dado un usuario registrado, cuando inicia sesión con credenciales correctas, entonces recibe una cookie httpOnly y el JavaScript de la página no puede leerla.
- **CA-003-05:** Dadas credenciales incorrectas, cuando intenta iniciar sesión, entonces recibe un mensaje genérico idéntico para correo inexistente y contraseña errónea.
- **CA-003-06:** Dado un correo con 5 intentos fallidos en 15 minutos, cuando intenta de nuevo con la contraseña correcta, entonces sigue bloqueado hasta que pase el tiempo.
- **CA-003-07:** Dado un usuario sin sesión, cuando consulta un endpoint protegido, entonces recibe `401`.
- **CA-003-08:** Dado un usuario con sesión, cuando cierra sesión, entonces el mismo token ya no sirve en el servidor.
- **CA-003-09:** Dado un correo existente y uno inexistente, cuando se pide recuperación, entonces la respuesta visible es idéntica.
- **CA-003-10:** Dado un enlace de recuperación válido, cuando se usa para definir una nueva contraseña, entonces se actualiza, el enlace deja de funcionar y se cierran las demás sesiones.
- **CA-003-11:** Dado un enlace de recuperación de más de 30 minutos, cuando se usa, entonces se rechaza.
- **CA-003-12:** Dados dos enlaces de recuperación pedidos seguidos, cuando se usa el primero, entonces se rechaza.
- **CA-003-13:** Dado el límite de 3 recuperaciones por hora, cuando se pide una cuarta, entonces se rechaza con mensaje de espera.
- **CA-003-14:** Dado un usuario, cuando edita su nombre y su celular, entonces los cambios se ven en sus grupos.
- **CA-003-15:** Dado un celular con 7 dígitos, cuando se guarda, entonces se rechaza.
- **CA-003-16:** Dado el cambio de contraseña con la actual correcta, cuando se confirma, entonces las otras sesiones se cierran y llega un correo de aviso.
- **CA-003-17:** Dado cualquier respuesta de la API, cuando se inspecciona, entonces no contiene el hash de contraseña ni el correo de otros usuarios.
- **CA-003-18:** Dado un usuario suspendido, cuando intenta iniciar sesión, entonces no puede entrar.
- **CA-003-19:** Dados dos registros simultáneos con el mismo correo, entonces exactamente uno tiene éxito.
- **CA-003-20:** Dado un JWT manipulado, cuando se envía, entonces la petición se rechaza con `401`.
- **CA-003-21:** Dada una cuenta baneada, cuando alguien se registra con su correo (aunque con otras mayúsculas o espacios), entonces se rechaza con el mensaje genérico.
- **CA-003-22:** Dada una cuenta baneada, cuando alguien se registra con un correo distinto pero con el mismo celular, entonces se rechaza con el mismo mensaje genérico.
- **CA-003-23:** Dada una cuenta baneada, cuando intenta iniciar sesión o recuperar su contraseña, entonces no puede y el mensaje no revela el baneo.
- **CA-003-24:** Dado el bloqueo de datos, cuando se inspecciona la tabla de bloqueos, entonces solo contiene huellas y no el correo, el celular ni la CI en claro.
- **CA-003-25:** Dado un registro sin celular o sin CI, cuando se envía, entonces se rechaza con error de validación en el campo.
- **CA-003-26:** Dado un celular o una CI ya registrados, cuando alguien se registra con ellos, entonces se rechaza.
- **CA-003-27:** Dado un código de verificación correcto dentro de 10 minutos, cuando se ingresa, entonces el celular queda verificado, se completa el registro y el usuario tiene sesión.
- **CA-003-28:** Dado un código vencido, o el sexto intento sobre un mismo código, cuando se ingresa, entonces se rechaza.
- **CA-003-29:** Dado el límite de 3 envíos por hora, cuando se pide un cuarto código, entonces se rechaza con mensaje de espera.
- **CA-003-30:** Dada una cuenta baneada, cuando alguien se registra con su CI y un correo y celular distintos, entonces se rechaza con el mismo mensaje genérico.
- **CA-003-31:** Dado cualquier usuario, cuando consulta la API, entonces nunca recibe la CI de otro usuario; la CI de su propia cuenta se devuelve enmascarada.
- **CA-003-32:** Dado un cambio de celular, cuando no se verifica el código nuevo, entonces se conserva el celular anterior.
- **CA-003-33:** Dado un usuario que cierra sesión o cambia la contraseña, cuando se usa un token anterior, entonces se rechaza con `401` (versión de sesión).
- **CA-003-34:** Dado un registro sin aceptar la política de datos, cuando se envía, entonces se rechaza.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] **Verificación del correo:** no es obligatoria en esta etapa; el correo se valida solo por formato. La identidad se apoya en el celular verificado y en la CI.
- [RESUELTO 2026-10-17] **Celular y CI en el registro:** son obligatorios, únicos, y el celular se verifica con un código (RF-003-01, RF-003-21 y RF-003-22). El baneo bloquea correo, celular y CI.
- [RESUELTO 2026-10-17] **Mensaje de registro con correo repetido:** se revela que ya existe, con límite de intentos por IP.
- [RESUELTO 2026-10-17] **Eliminar cuenta:** fuera de alcance por ahora; si se agrega, solo sin deudas ni titularidad y anonimizando datos, pero conservando las huellas de bloqueo.
- [RESUELTO 2026-10-17] **Revocación de tokens:** versión de sesión por usuario (RF-003-07).
- [RESUELTO 2026-10-17] **Nombre bancario:** no hay campo separado en esta etapa.
- [NECESITA ACLARACIÓN] **Canal y costo del código de celular.** SMS o WhatsApp, y quién lo paga. **Propuesta:** en desarrollo, el código se muestra en el log; en producción, un proveedor de SMS con un tope de mensajes por día, elegido en la spec 000. El canal queda detrás de la abstracción de mensajería (RF-000-22), así que cambiarlo no afecta esta spec.
- [NECESITA ACLARACIÓN] **Formato de la CI y su revisión.** Se asumió que se registra solo el número (con complemento opcional) y que no se sube foto del documento. **Propuesta:** solo el número, con validación de formato; el administrador no puede verificar que sea real, así que la CI funciona como identificador único y no como prueba de identidad. Pedir una foto y revisarla solo a quien se quiere habilitar como titular es una alternativa más fuerte, pero implica guardar una imagen sensible.
- [NECESITA ACLARACIÓN] **Alias de correo.** Los alias de Gmail (`nombre+1@gmail.com` o con puntos distintos) apuntan a la misma casilla. **Propuesta:** que la huella del bloqueo de correo se calcule sin alias en esos dominios. Ninguna medida garantiza que una persona con otro celular y otra CI no cree una cuenta nueva.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | Se agrega el estado `baneado` y el bloqueo de correo y celular de cuentas baneadas (RN-003-02, RF-003-19, RF-003-20, CA-003-21 a CA-003-24) | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: celular obligatorio y verificado, CI obligatoria y única, política de datos, bloqueo de correo, celular y CI, versión de sesión (RF-003-01, 05, 07, 14, 19, 21, 22, 24; RN-003-03; CA-003-25 a 34) | Equipo |
