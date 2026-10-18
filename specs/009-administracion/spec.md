# Spec 009 — Administración

- **Estado:** borrador
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Leonardo Guzman (Backend): pendiente · Adrian Vargas (Frontend): pendiente
- **Prioridad:** P2 (extra)
- **Depende de:** 003 (usuarios), 004 (catálogo), 008 (reportes de cupos), 002 (para estadísticas), 010 (reclamos de ingreso)
- **Módulo cubierto:** 10 (Administración)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Una vez que la app tiene usuarios reales, alguien debe poder mantener el catálogo al día, atender reportes de abuso y ver cómo se usa el sistema, sin tocar la base de datos a mano. Esta spec define el **panel de administración**: gestión de usuarios, del catálogo de servicios, moderación y estadísticas generales.

## 2. Objetivos

- Gestionar el catálogo (servicios y planes) sin cambiar código.
- Suspender o reactivar cuentas con criterio y con registro de lo hecho.
- Moderar publicaciones de cupos reportadas.
- Revisar los reclamos de ingreso y banear a quienes estafen, sea titular o solicitante.
- Habilitar manualmente a los primeros titulares.
- Ver estadísticas generales del sistema sin acceder a datos privados.

## 3. Fuera de alcance

- Ver comprobantes de pago, chats, contraseñas o correos de otros usuarios sin necesidad. La única excepción es la evidencia de un reclamo abierto (spec 010), y cada acceso queda registrado.
- Modificar cobros, montos o estados de pago.
- Roles intermedios (moderador, soporte); solo existe `admin`.
- Facturación o métricas de ingresos.
- Exportaciones masivas de datos personales.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Administrador (el equipo del proyecto durante la demo) | Todo lo descrito en esta spec | Ver comprobantes o chats fuera de un reclamo; cambiar montos o estados de cobros; ver contraseñas |
| Usuario normal | Nada de esto | Acceder a las rutas de administración (`403`) |

## 5. Historias de usuario

- **HU-009-01:** Como administrador, quiero agregar y actualizar servicios y planes del catálogo.
- **HU-009-02:** Como administrador, quiero buscar un usuario y suspenderlo o reactivarlo.
- **HU-009-03:** Como administrador, quiero revisar publicaciones reportadas y decidir qué hacer.
- **HU-009-04:** Como administrador, quiero ver estadísticas generales del uso de la app.
- **HU-009-05:** Como administrador, quiero un registro de mis acciones para rendir cuentas.
- **HU-009-06:** Como administrador, quiero promover a otro administrador.
- **HU-009-07:** Como administrador, quiero revisar un reclamo con toda su evidencia y banear a quien estafó (titular o solicitante), para proteger a los usuarios.
- **HU-009-08:** Como administrador, quiero habilitar manualmente a un usuario como titular, para que el sistema pueda arrancar con titulares de confianza.

## 6. Requisitos funcionales

### Acceso
- **RF-009-01:** Solo los usuarios con rol `admin` acceden a las rutas `/admin` y a los endpoints de administración; los demás reciben `403`. Las pantallas de administración no se muestran a usuarios normales.
- **RF-009-02:** El primer administrador se crea con el seed o un comando de línea con variables de entorno; nadie se registra como admin.
- **RF-009-03:** Un administrador puede promover a otro usuario a `admin` o quitarle el rol, pero **no puede quitarse el rol a sí mismo** si es el último admin.

### Catálogo
- **RF-009-04:** El administrador puede **crear, editar, activar y desactivar** servicios y planes (campos de la spec 004). No existe el borrado físico.
- **RF-009-05:** Al editar precios o cupos de un plan, se muestra el aviso de que **no cambia** las suscripciones existentes (copia, RF-004-08).
- **RF-009-06:** El administrador puede cargar o actualizar el catálogo desde un archivo (CSV o JSON) con **vista previa** de los cambios antes de aplicarlos Es la **última tarea** de la spec; el seed cubre la carga inicial _(decidido 2026-10-17)_.
- **RF-009-07:** Se valida que los `slug` sean únicos, los cupos estén entre 2 y 20 y los montos sean positivos.

### Usuarios
- **RF-009-08:** El administrador puede **listar y buscar** usuarios por nombre o correo, con filtros por estado (`activo`, `suspendido`, `baneado`) y rol, paginados.
- **RF-009-09:** Para cada usuario ve: nombre, correo, celular, cédula de identidad **enmascarada** (solo los últimos dígitos), estado, rol, fecha de registro, último ingreso, cantidad de grupos como titular y como miembro, nivel de puntualidad y cantidad de reportes recibidos. **No** ve contraseñas ni comprobantes.
- **RF-009-10:** El administrador puede **suspender** a un usuario indicando un motivo obligatorio, y **reactivarlo**. Un usuario suspendido no puede iniciar sesión (RN-003-02) y sus sesiones activas se cierran.
- **RF-009-11:** Al suspender, el usuario recibe un correo con el motivo y la forma de apelar: un correo de contacto del equipo, definido por configuración (`correo_apelaciones`) _(decidido 2026-10-17)_.

### Baneo, reclamos y titulares
- **RF-009-19 (Baneo):** el administrador puede **banear** a un usuario con un motivo obligatorio y, si corresponde, el reclamo que lo origina. El estado pasa a `baneado`, se cierran sus sesiones y se bloquean su correo, su celular, su cédula de identidad y su cuenta de Telegram (spec 003, RF-003-19). El baneo puede recaer en un **titular** o en un **solicitante o miembro**. Al banear a un miembro, es retirado de los grupos en los que está, y sus titulares reciben un aviso; sus cobros abiertos se conservan como deuda visible y el titular decide si los cancela. La acción de reactivar de la suspensión no deshace un baneo.
- **RF-009-20 (Reclamos):** el administrador ve la cola de reclamos de ingreso (los abiertos primero) con la evidencia que define la spec 010 (RF-010-23) y los resuelve como `estafa_confirmada` o `sin_falta`. Resolver como `estafa_confirmada` banea en la misma acción a la persona acusada: el titular en un reclamo por pago sin ingreso, o el solicitante en un reclamo por comprobante falso (spec 010, RF-010-24).
- **RF-009-21 (Habilitar titulares):** el administrador puede habilitar o quitar la habilitación manual de un usuario como titular, con un motivo (spec 001, RF-001-21).
- **RF-009-22 (Efectos del baneo de un titular):** sus solicitudes activas pasan a `rechazada` (spec 010), sus grupos pasan a solo lectura, sus miembros reciben un aviso y el grupo muestra el texto **"titular baneado"** con la opción **"buscar otro grupo"**, que lleva a la búsqueda de cupos libres (spec 008). Un grupo en solo lectura no genera cobros nuevos ni recibe miembros. Los cobros abiertos no se cancelan: quedan congelados, sin pasar a `atrasado` ni retirar a nadie, y se excluyen de la calificación de los miembros (spec 007, RF-007-14). _(Decidido 2026-10-17; los cobros abiertos se congelan, decidido 2026-10-18)_
- **RF-009-23 (Revisión del baneo):** otro administrador (distinto del que baneó) puede revertir un baneo en forma excepcional, con un motivo, y queda en auditoría. Al revertirlo se liberan los datos bloqueados y se descongelan los grupos que se congelaron por ese baneo (RF-009-22); no se restituyen las pertenencias a otros grupos ni se rehacen cobros o solicitudes. La persona baneada pide la revisión por el correo de contacto del equipo (RF-009-11). _(Decidido 2026-10-17)_
- **RF-009-24 (Titular suspendido):** mientras un titular está suspendido, su grupo sigue funcionando y los miembros ven un aviso. Como el titular no puede iniciar sesión, un administrador puede transferir la titularidad a un miembro habilitado como titular (spec 001, RF-001-21), a pedido de los miembros, con motivo y auditoría.

### Moderación
- **RF-009-12:** El administrador ve la cola de **publicaciones reportadas u ocultas** (spec 008) con los motivos y comentarios de los reportes.
- **RF-009-13:** Por cada publicación puede **restaurarla**, **eliminarla** (cierre definitivo) o **eliminarla y suspender** al titular. Todo queda con motivo.
- **RF-009-14:** Se notifica al titular de la decisión (spec 005).

### Estadísticas
- **RF-009-15:** El tablero muestra: usuarios totales, nuevos del mes y activos (con algún ingreso en 30 días); grupos activos y cerrados; cobros del mes por estado; monto gestionado en el mes (en Bs); tasa de puntualidad global; servicios más compartidos (top 5); publicaciones de cupos activas, solicitudes de ingreso del mes y reclamos abiertos.
- **RF-009-16:** Los gráficos tienen alternativa en tabla y no dependen solo del color.
- **RF-009-17:** Las estadísticas son **agregadas**: no permiten ver el detalle de cobros o comprobantes de usuarios concretos.

### Auditoría
- **RF-009-18:** Cada acción de administración (crear o editar catálogo, suspender, reactivar, banear, habilitar titulares, promover, moderar, resolver reclamos y abrir su evidencia) se registra en un **log de auditoría** con quién, qué, sobre qué, motivo y fecha. El log es de solo anexado y consultable por los administradores con filtros.

## 7. Requisitos no funcionales

- **RNF-009-01 (Seguridad):** los endpoints de administración verifican el rol en el servidor en cada petición; el frontend solo oculta menús.
- **RNF-009-02 (Seguridad):** las acciones sensibles (suspender, promover, quitar rol) piden confirmación explícita.
- **RNF-009-03 (Privacidad):** el administrador accede al mínimo de datos necesario; no hay exportaciones masivas de datos personales.
- **RNF-009-04 (Rendimiento):** el tablero de estadísticas carga en menos de 2 segundos con hasta 10.000 usuarios; puede usar datos con retraso de hasta 5 minutos.
- **RNF-009-05 (Integridad):** el log de auditoría no se puede editar ni borrar desde la aplicación.
- **RNF-009-06 (Usabilidad):** listas con búsqueda, filtros y paginación; funcionan en pantallas pequeñas.

## 8. Reglas de negocio

- **RN-009-01:** Siempre debe existir al menos un administrador activo.
- **RN-009-02:** Un administrador no puede suspenderse a sí mismo ni a otro administrador sin antes quitarle el rol.
- **RN-009-03:** Suspender a un usuario **no** borra ni cambia sus datos, grupos ni cobros: solo bloquea el acceso. Sus grupos siguen funcionando; los miembros de un grupo cuyo titular fue suspendido ven un aviso (RF-009-24).
- **RN-009-04:** Toda suspensión, eliminación de publicación o cambio de rol requiere un **motivo** de 10 a 300 caracteres.
- **RN-009-05:** Los cambios del catálogo no alteran suscripciones existentes (RN-004-01).
- **RN-009-06:** Las estadísticas usan siempre los datos persistidos (copias y ciclos), igual que los reportes de la spec 006.
- **RN-009-07:** Un baneo requiere un motivo de 10 a 300 caracteres y queda en auditoría. Un administrador no puede banearse a sí mismo ni a otro administrador sin antes quitarle el rol (RN-009-02).
- **RN-009-08:** El administrador solo accede al chat y al comprobante de una solicitud cuando existe un reclamo abierto sobre ella, y cada acceso se registra.
- **RN-009-09:** Un reclamo por sí solo no banea a nadie: el baneo es una decisión del administrador (spec 010, RN-010-08).

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Usuario normal accede a `/admin` | `403` y redirección a su panel |
| Se intenta quitar el rol al último admin | Error "Debe existir al menos un administrador" |
| Se suspende al titular de un grupo con cobros abiertos | Se permite; los cobros siguen su curso, se avisa a los miembros y un administrador puede transferir la titularidad (RF-009-24) |
| Suspensión sin motivo | Error de validación |
| Importación de catálogo con una fila inválida | No se aplica nada y se muestra el error por fila |
| Dos administradores editan el mismo plan a la vez | Gana el último guardado y la edición anterior queda en auditoría (o se avisa del conflicto) |
| Se desactiva un servicio con grupos activos | Los grupos no cambian; el servicio deja de ofrecerse |
| Se banea al titular de un grupo con cobros abiertos y miembros activos | Se aplican los efectos de RF-009-22: el grupo queda en solo lectura con el texto "titular baneado", los cobros abiertos se congelan y se avisa a los miembros |
| Se banea a un miembro que está en varios grupos | Es retirado de todos y cada titular recibe un aviso |
| Se revierte un baneo | Los datos bloqueados quedan libres y la cuenta vuelve a `activo`; no se restauran grupos ni cobros |
| Un administrador intenta abrir el chat de una solicitud sin reclamo | Se rechaza con `403` |
| Se resuelve un reclamo ya resuelto | Error de estado; no cambia nada |
| Búsqueda de usuario sin resultados | Mensaje claro |
| Se intenta borrar el log de auditoría | No existe esa acción en la app |
| Estadísticas con cero datos | Valores en cero, sin errores |

## 10. Criterios de aceptación

- **CA-009-01:** Dado un usuario normal, cuando llama a un endpoint de administración, entonces recibe `403`.
- **CA-009-02:** Dado un administrador, cuando crea un servicio y un plan válidos, entonces aparecen en el catálogo (spec 004).
- **CA-009-03:** Dado un `slug` repetido, cuando el administrador guarda, entonces se rechaza.
- **CA-009-04:** Dado un plan con suscripciones existentes, cuando el administrador cambia su precio, entonces esas suscripciones conservan el precio anterior.
- **CA-009-05:** Dado un plan desactivado, cuando un titular crea una suscripción, entonces no se ofrece.
- **CA-009-06:** Dada una importación con una fila inválida, cuando se confirma, entonces no se aplica ningún cambio.
- **CA-009-07:** Dado un administrador que busca "camila", cuando se ejecuta, entonces encuentra usuarios por nombre o correo.
- **CA-009-08:** Dado el detalle de un usuario, cuando lo ve el administrador, entonces no aparecen contraseñas ni comprobantes.
- **CA-009-09:** Dada una suspensión con motivo, cuando se aplica, entonces el usuario no puede iniciar sesión y sus sesiones activas se cierran.
- **CA-009-10:** Dada una suspensión sin motivo o de menos de 10 caracteres, cuando se envía, entonces se rechaza.
- **CA-009-11:** Dado un usuario suspendido, cuando se reactiva, entonces puede iniciar sesión otra vez.
- **CA-009-12:** Dado el último administrador, cuando intenta quitarse el rol, entonces se rechaza.
- **CA-009-13:** Dado un administrador, cuando intenta suspender a otro administrador, entonces se rechaza hasta que le quite el rol.
- **CA-009-14:** Dada una publicación ocultada por 3 reportes, cuando un administrador la restaura, entonces vuelve a la búsqueda y queda registrado quién y por qué.
- **CA-009-15:** Dada una publicación eliminada con motivo, cuando se confirma, entonces el titular recibe una notificación con la decisión.
- **CA-009-16:** Dado el tablero, cuando se abre, entonces los totales de cobros por estado coinciden con la base de datos.
- **CA-009-17:** Dada cualquier estadística, cuando se inspecciona, entonces no incluye detalles de comprobantes ni de cobros de personas concretas.
- **CA-009-18:** Dada una acción de administración, cuando se ejecuta, entonces aparece en el log de auditoría con autor, motivo y fecha.
- **CA-009-19:** Dado el log de auditoría, cuando se busca una forma de editarlo o borrarlo desde la API, entonces no existe esa operación.
- **CA-009-20:** Dado el primer despliegue, cuando se ejecuta el comando de creación del admin con variables de entorno, entonces se crea un administrador y no se guardan credenciales en el repositorio.
- **CA-009-21:** Dado el tablero con 10.000 usuarios de prueba, cuando se carga, entonces responde en menos de 2 segundos.
- **CA-009-22:** Dado un baneo con motivo, cuando se aplica, entonces el usuario no puede iniciar sesión, sus sesiones se cierran y su correo, celular, cédula y cuenta de Telegram quedan bloqueados para nuevos registros.
- **CA-009-23:** Dado un baneo sin motivo o de menos de 10 caracteres, cuando se envía, entonces se rechaza.
- **CA-009-24:** Dado un usuario baneado, cuando un administrador usa la acción de reactivar, entonces no se deshace el baneo.
- **CA-009-25:** Dado un reclamo por pago sin ingreso, cuando el administrador lo resuelve como `estafa_confirmada`, entonces el titular queda baneado, sus solicitudes activas se rechazan y sus miembros reciben un aviso.
- **CA-009-26:** Dado un reclamo resuelto como `sin_falta`, cuando se aplica, entonces ninguna cuenta cambia de estado.
- **CA-009-27:** Dado un administrador, cuando abre la evidencia de un reclamo, entonces ve línea de tiempo, chat y comprobante y queda en el log de auditoría; sin reclamo abierto no puede ver el chat de una solicitud.
- **CA-009-28:** Dado un administrador que habilita manualmente a un usuario como titular, cuando ese usuario crea una suscripción, entonces se permite aunque su calificación sea menor al umbral.
- **CA-009-30:** Dado un reclamo por comprobante falso, cuando el administrador lo resuelve como `estafa_confirmada`, entonces el solicitante queda baneado y el titular no.
- **CA-009-31:** Dado un grupo cuyo titular fue baneado, cuando un miembro lo abre, entonces ve el texto "titular baneado", el grupo está en solo lectura y la opción "buscar otro grupo" lleva a la búsqueda de cupos libres.
- **CA-009-32:** Dado un grupo con titular baneado y un cobro `pendiente` que vence, cuando corre el proceso de atrasos, entonces el cobro no pasa a `atrasado` ni se retira a nadie.
- **CA-009-33:** Dado un miembro baneado que está en 2 grupos, cuando se aplica el baneo, entonces es retirado de ambos y los dos titulares reciben un aviso.
- **CA-009-34:** Dado un baneo, cuando un administrador distinto lo revierte con motivo, entonces el usuario queda `activo`, sus datos se liberan y queda en auditoría; el mismo administrador que baneó no puede revertirlo.
- **CA-009-35:** Dado un titular suspendido, cuando un administrador transfiere la titularidad a un miembro habilitado, entonces el grupo tiene nuevo titular y queda en auditoría; a un miembro no habilitado, se rechaza.
- **CA-009-36:** Dado un usuario con cédula registrada, cuando un administrador consulta su ficha, entonces la ve enmascarada.
- **CA-009-37:** Dado un titular baneado cuyos grupos quedaron congelados, cuando otro administrador revierte el baneo, entonces esos grupos se descongelan y vuelven a generar cobros desde el siguiente corte; los grupos donde era miembro no se restituyen.
- **CA-009-29:** Dado un administrador, cuando intenta banear a otro administrador, entonces se rechaza hasta que le quite el rol.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] **Quién es el administrador y qué necesita** (P28). **Decidido:** el equipo de desarrollo durante la demo, con las acciones de esta spec.
- [RESUELTO 2026-10-17] **Importación masiva de catálogo** (RF-009-06). **Decidido:** dejarla como última tarea de la spec; el seed cubre la carga inicial.
- [RESUELTO 2026-10-17] **Qué pasa con un grupo cuyo titular fue suspendido.** **Decidido:** los cobros siguen, pero se avisa a los miembros y se permite transferir la titularidad.
- [RESUELTO 2026-10-17] **Canal de apelación de una suspensión.** **Decidido:** un correo de contacto definido por el equipo.
- [RESUELTO 2026-10-17] **Qué datos se bloquean con un baneo** (RF-009-19): correo, celular, cédula de identidad y cuenta de Telegram, para cualquier persona baneada.
- [RESUELTO 2026-10-17] **Efectos del baneo sobre el grupo** (RF-009-22): texto "titular baneado" y opción de buscar otro grupo. **Revisión de un baneo** (RF-009-23): por otro administrador, con motivo.
- [RESUELTO 2026-10-18] **Cobros abiertos de un grupo con titular baneado:** se congelan y se excluyen de la calificación de los miembros, en lugar de cancelarse (RF-009-22).
- [RESUELTO 2026-10-18] **Transferencia por un administrador** de un grupo con titular suspendido (RF-009-24): solo a pedido de los miembros y hacia un miembro habilitado.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | Se agregan el baneo, la cola de reclamos y la habilitación manual de titulares (RF-009-19 a RF-009-23, RN-009-07 a RN-009-09, CA-009-22 a CA-009-29) | Equipo |
| 2026-10-18 | Al revertir un baneo se descongelan los grupos que congeló (RF-009-23, CA-009-37) | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: el baneo bloquea correo, celular y cédula y recae también en solicitantes (RF-009-19, 20), efectos en el grupo (RF-009-22), revisión, apelación y titular suspendido (RF-009-11, 23, 24), CA-009-30 a 36; se aceptan las propuestas de la sección 11 | Equipo |
| 2026-10-18 | Se confirman los cobros congelados de un titular baneado, la transferencia por un administrador y el bloqueo de la cuenta de Telegram | Equipo |
