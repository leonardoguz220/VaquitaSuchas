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
- **HU-003-05:** Como usuario, quiero cambiar mi contraseña estando dentro de la app.
- **HU-003-06:** Como usuario, quiero que, si me bloquean por intentos fallidos, el bloqueo sea temporal y claro.

## 6. Requisitos funcionales

### Registro
- **RF-003-01:** El registro pide: nombre completo (2 a 80 caracteres), correo electrónico, contraseña y confirmación de contraseña. El celular es opcional.
- **RF-003-02:** El correo es único sin distinguir mayúsculas y se guarda normalizado (minúsculas, sin espacios).
- **RF-003-03:** La contraseña cumple la política: mínimo 10 caracteres, al menos una letra y un número, y no puede ser igual al correo.
- **RF-003-04:** Al registrarse, el usuario queda con sesión iniciada.
- **RF-003-05:** El celular, si se ingresa, se guarda como número boliviano (8 dígitos, empieza con 6 o 7) con prefijo `+591`.

### Sesión
- **RF-003-06:** El inicio de sesión usa correo y contraseña. Al ingresar, el backend emite un JWT que el frontend guarda en una **cookie httpOnly, `Secure` y `SameSite=Lax`**; el navegador nunca lee el token.
- **RF-003-07:** La sesión dura 7 días desde la última actividad (renovación deslizante). Cerrar sesión elimina la cookie e invalida el token en el servidor [NECESITA ACLARACIÓN: lista de tokens revocados].
- **RF-003-08:** Los endpoints protegidos rechazan peticiones sin sesión válida con `401`.
- **RF-003-09:** El usuario puede ver en su perfil la fecha del último inicio de sesión.

### Recuperación de contraseña
- **RF-003-10:** El usuario ingresa su correo y recibe un enlace de recuperación. La respuesta de la pantalla es **siempre la misma**, exista o no la cuenta.
- **RF-003-11:** El enlace contiene un token aleatorio de un solo uso que vence a los 30 minutos. En la base de datos solo se guarda su hash.
- **RF-003-12:** Al restablecer la contraseña con éxito, el token se invalida, se cierran todas las demás sesiones del usuario y se le avisa por correo que su contraseña cambió.
- **RF-003-13:** Si el usuario pide un nuevo enlace, los anteriores dejan de funcionar.

### Perfil
- **RF-003-14:** El usuario puede editar su nombre y su celular. El correo no se puede editar en esta etapa.
- **RF-003-15:** El usuario puede cambiar su contraseña ingresando la actual y la nueva; al hacerlo se cierran sus otras sesiones.
- **RF-003-16:** Las demás personas ven de un usuario únicamente lo que define la regla RN-003-03.

### Protección
- **RF-003-17:** Tras 5 intentos fallidos de inicio de sesión en 15 minutos para un mismo correo, se bloquea el inicio de sesión de ese correo por 15 minutos. También hay un límite por dirección IP.
- **RF-003-18:** Los pedidos de recuperación de contraseña tienen límite: máximo 3 por correo cada hora.

### Cuentas baneadas
- **RF-003-19:** Cuando se banea una cuenta (spec 009), el sistema guarda una huella irreversible (hash con una clave del servidor) de su correo normalizado y de su celular. El registro rechaza cualquier correo o celular cuya huella esté bloqueada, con el mensaje genérico "No es posible crear la cuenta con estos datos", sin indicar cuál dato fue el bloqueado.
- **RF-003-20:** Una cuenta baneada no puede iniciar sesión ni recuperar su contraseña, y sus sesiones activas se cierran. El mensaje es el mismo genérico de acceso no disponible.

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
- **RN-003-03 (Visibilidad entre usuarios):** dentro de un grupo, todos ven el **nombre** de los demás miembros; el titular y los miembros se ven mutuamente el **celular** solo si fue ingresado, para poder coordinar pagos. El correo no se comparte.
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
| Registro con el correo o el celular de una cuenta baneada | Se rechaza con el mensaje genérico, también si el correo cambia solo en mayúsculas o espacios |
| Registro con un correo y un celular nuevos de una persona baneada | No se puede detectar con solo estos datos; ver la pregunta abierta sobre identidad |

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
- **CA-003-24:** Dado el bloqueo de datos, cuando se inspecciona la tabla de bloqueos, entonces solo contiene huellas y no el correo ni el celular en claro.

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Verificación del correo.** **Propuesta:** sin verificación obligatoria en esta etapa; el correo se valida solo por formato. Riesgo: cuentas con correos ajenos y, con el baneo (RF-003-19), facilidad para abrir otra cuenta con otro correo.
- [NECESITA ACLARACIÓN] **Identidad de una persona baneada.** Hoy el bloqueo usa el correo y el celular, y una persona puede conseguir otros nuevos. Dos medidas lo dificultan y tienen costo: verificar el celular con un código por SMS o WhatsApp (cuesta por mensaje y depende de un proveedor) y pedir la cédula de identidad a quien quiera ser titular (es un dato personal sensible; se guardaría solo su huella y hay que revisar la normativa de protección de datos). **Propuesta:** en el MVP bloquear correo y celular, y decidir en equipo si se suma la cédula solo para titulares. Los alias de Gmail (`nombre+1@gmail.com` o con puntos distintos) apuntan a la misma casilla; **propuesta:** que la huella del bloqueo se calcule sobre el correo sin alias en esos dominios. Ninguna medida garantiza que la persona no cree otra cuenta con datos nuevos.
- [NECESITA ACLARACIÓN] **Mensaje de registro con correo repetido:** revelar que existe (mejor experiencia) o respuesta neutra (más privado). **Propuesta:** revelarlo, con límite de intentos por IP.
- [NECESITA ACLARACIÓN] **Eliminar cuenta.** **Propuesta:** fuera de alcance por ahora; si se agrega, solo sin deudas ni titularidad y anonimizando datos para conservar el historial de los grupos.
- [NECESITA ACLARACIÓN] **Revocación de tokens:** lista de tokens revocados en base de datos o versión de sesión por usuario. **Propuesta:** versión de sesión por usuario (columna `session_version`) para simplificar.
- [NECESITA ACLARACIÓN] **Nombre bancario:** ¿hace falta un campo separado "nombre en el banco" para ayudar a conciliar pagos? **Propuesta:** no en esta etapa.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | Se agrega el estado `baneado` y el bloqueo de correo y celular de cuentas baneadas (RN-003-02, RF-003-19, RF-003-20, CA-003-21 a CA-003-24) | Equipo |
