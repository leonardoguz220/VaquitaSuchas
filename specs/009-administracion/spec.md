# Spec 009 — Administración

- **Estado:** borrador
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Revisión por capa:** Camila Fuentes (BD) ⬜ · Leonardo Guzman (Backend) ⬜ · Adrian Vargas (Frontend) ⬜
- **Prioridad:** P2 (extra)
- **Depende de:** 003 (usuarios), 004 (catálogo), 008 (reportes de cupos), 002 (para estadísticas)
- **Módulo cubierto:** 10 (Administración)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Una vez que la app tiene usuarios reales, alguien debe poder mantener el catálogo al día, atender reportes de abuso y ver cómo se usa el sistema, sin tocar la base de datos a mano. Esta spec define el **panel de administración**: gestión de usuarios, del catálogo de servicios, moderación y estadísticas generales.

## 2. Objetivos

- Gestionar el catálogo (servicios y planes) sin cambiar código.
- Suspender o reactivar cuentas con criterio y con registro de lo hecho.
- Moderar publicaciones de cupos reportadas.
- Ver estadísticas generales del sistema sin acceder a datos privados.

## 3. Fuera de alcance

- Ver comprobantes de pago, contraseñas o correos de otros usuarios sin necesidad.
- Modificar cobros, montos o estados de pago.
- Roles intermedios (moderador, soporte); solo existe `admin`.
- Facturación o métricas de ingresos.
- Exportaciones masivas de datos personales.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Administrador | Todo lo descrito en esta spec | Ver comprobantes; cambiar montos o estados de cobros; ver contraseñas |
| Usuario normal | Nada de esto | Acceder a las rutas de administración (`403`) |

## 5. Historias de usuario

- **HU-009-01:** Como administrador, quiero agregar y actualizar servicios y planes del catálogo.
- **HU-009-02:** Como administrador, quiero buscar un usuario y suspenderlo o reactivarlo.
- **HU-009-03:** Como administrador, quiero revisar publicaciones reportadas y decidir qué hacer.
- **HU-009-04:** Como administrador, quiero ver estadísticas generales del uso de la app.
- **HU-009-05:** Como administrador, quiero un registro de mis acciones para rendir cuentas.
- **HU-009-06:** Como administrador, quiero promover a otro administrador.

## 6. Requisitos funcionales

### Acceso
- **RF-009-01:** Solo los usuarios con rol `admin` acceden a las rutas `/admin` y a los endpoints de administración; los demás reciben `403`. Las pantallas de administración no se muestran a usuarios normales.
- **RF-009-02:** El primer administrador se crea con el seed o un comando de línea con variables de entorno; nadie se registra como admin.
- **RF-009-03:** Un administrador puede promover a otro usuario a `admin` o quitarle el rol, pero **no puede quitarse el rol a sí mismo** si es el último admin.

### Catálogo
- **RF-009-04:** El administrador puede **crear, editar, activar y desactivar** servicios y planes (campos de la spec 004). No existe el borrado físico.
- **RF-009-05:** Al editar precios o cupos de un plan, se muestra el aviso de que **no cambia** las suscripciones existentes (copia, RF-004-08).
- **RF-009-06:** El administrador puede cargar o actualizar el catálogo desde un archivo (CSV o JSON) con **vista previa** de los cambios antes de aplicarlos [NECESITA ACLARACIÓN: ¿es necesario en esta etapa?].
- **RF-009-07:** Se valida que los `slug` sean únicos, los cupos estén entre 2 y 20 y los montos sean positivos.

### Usuarios
- **RF-009-08:** El administrador puede **listar y buscar** usuarios por nombre o correo, con filtros por estado (`activo`, `suspendido`) y rol, paginados.
- **RF-009-09:** Para cada usuario ve: nombre, correo, celular, estado, rol, fecha de registro, último ingreso, cantidad de grupos como titular y como miembro, nivel de puntualidad y cantidad de reportes recibidos. **No** ve contraseñas ni comprobantes.
- **RF-009-10:** El administrador puede **suspender** a un usuario indicando un motivo obligatorio, y **reactivarlo**. Un usuario suspendido no puede iniciar sesión (RN-003-02) y sus sesiones activas se cierran.
- **RF-009-11:** Al suspender, el usuario recibe un correo con el motivo y la forma de apelar [NECESITA ACLARACIÓN: canal de apelación].

### Moderación
- **RF-009-12:** El administrador ve la cola de **publicaciones reportadas u ocultas** (spec 008) con los motivos y comentarios de los reportes.
- **RF-009-13:** Por cada publicación puede **restaurarla**, **eliminarla** (cierre definitivo) o **eliminarla y suspender** al titular. Todo queda con motivo.
- **RF-009-14:** Se notifica al titular de la decisión (spec 005).

### Estadísticas
- **RF-009-15:** El tablero muestra: usuarios totales, nuevos del mes y activos (con algún ingreso en 30 días); grupos activos y cerrados; cobros del mes por estado; monto gestionado en el mes (en Bs); tasa de puntualidad global; servicios más compartidos (top 5); publicaciones de cupos activas y solicitudes del mes.
- **RF-009-16:** Los gráficos tienen alternativa en tabla y no dependen solo del color.
- **RF-009-17:** Las estadísticas son **agregadas**: no permiten ver el detalle de cobros o comprobantes de usuarios concretos.

### Auditoría
- **RF-009-18:** Cada acción de administración (crear o editar catálogo, suspender, reactivar, promover, moderar) se registra en un **log de auditoría** con quién, qué, sobre qué, motivo y fecha. El log es de solo anexado y consultable por los administradores con filtros.

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
- **RN-009-03:** Suspender a un usuario **no** borra ni cambia sus datos, grupos ni cobros: solo bloquea el acceso. Sus grupos siguen funcionando; los miembros de un grupo cuyo titular fue suspendido ven un aviso [NECESITA ACLARACIÓN].
- **RN-009-04:** Toda suspensión, eliminación de publicación o cambio de rol requiere un **motivo** de 10 a 300 caracteres.
- **RN-009-05:** Los cambios del catálogo no alteran suscripciones existentes (RN-004-01).
- **RN-009-06:** Las estadísticas usan siempre los datos persistidos (copias y ciclos), igual que los reportes de la spec 006.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Usuario normal accede a `/admin` | `403` y redirección a su panel |
| Se intenta quitar el rol al último admin | Error "Debe existir al menos un administrador" |
| Se suspende al titular de un grupo con cobros abiertos | Se permite; los cobros siguen su curso y se avisa a los miembros [NECESITA ACLARACIÓN] |
| Suspensión sin motivo | Error de validación |
| Importación de catálogo con una fila inválida | No se aplica nada y se muestra el error por fila |
| Dos administradores editan el mismo plan a la vez | Gana el último guardado y la edición anterior queda en auditoría (o se avisa del conflicto) |
| Se desactiva un servicio con grupos activos | Los grupos no cambian; el servicio deja de ofrecerse |
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

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Quién es el administrador y qué necesita** (P28). **Propuesta:** el equipo de desarrollo durante la demo, con las acciones de esta spec.
- [NECESITA ACLARACIÓN] **Importación masiva de catálogo** (RF-009-06). **Propuesta:** dejarla como última tarea de la spec; el seed cubre la carga inicial.
- [NECESITA ACLARACIÓN] **Qué pasa con un grupo cuyo titular fue suspendido.** **Propuesta:** los cobros siguen, pero se avisa a los miembros y se permite transferir la titularidad.
- [NECESITA ACLARACIÓN] **Canal de apelación de una suspensión.** **Propuesta:** un correo de contacto definido por el equipo.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Claude, a pedido del equipo |
