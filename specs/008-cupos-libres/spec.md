# Spec 008 — Cupos libres

- **Estado:** aprobada
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Revisión por capa:** Camila Fuentes (BD): aprobada · Leonardo Guzman (Backend): aprobada · Adrian Vargas (Frontend): aprobada
- **Prioridad:** P2 (extra)
- **Depende de:** 001 (grupos), 003 (usuarios), 005 (notificaciones), 007 (reputación, para mostrar puntualidad), 010 (solicitudes de ingreso)
- **Módulo cubierto:** 9 (Cupos libres)
- **Última actualización:** 2026-10-18

## 1. Contexto y problema

Muchos grupos tienen lugares vacíos: un plan familiar de 6 personas con 4 ocupadas paga más por persona de lo necesario. Y mucha gente busca compartir un servicio y no conoce a nadie. Los **cupos libres** conectan a ambos lados: el titular publica los lugares que le sobran y quien busca abre una solicitud de ingreso (spec 010), conversa con el titular, paga y entra cuando el titular lo confirma.

## 2. Objetivos

- Que un titular publique los cupos libres de su grupo de forma segura.
- Que cualquier usuario busque cupos por servicio y cuota estimada.
- Que el titular decida a quién acepta, con información de puntualidad.
- Que la solicitud siga el flujo de la spec 010 (chat, pago previo y confirmación) y respete las reglas del grupo (cupos, cuotas, historial).

## 3. Fuera de alcance

- Depósitos de garantía por el cupo. El pago de ingreso se define en la spec 010.
- Chat de grupo. La conversación de cada solicitud pertenece a la spec 010.
- Publicaciones con imágenes.
- Recomendaciones automáticas de grupos.
- Cobro de comisiones por la intermediación.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Titular | Publicar, editar y retirar publicaciones de **sus** grupos; gestionar las solicitudes que llegan (spec 010) | Publicar cupos de grupos ajenos o de grupos cerrados |
| Usuario autenticado | Buscar publicaciones, enviar solicitudes, retirarlas, reportar publicaciones | Ver datos privados del grupo antes de ser aceptado |
| Miembro | Ver que el grupo tiene una publicación activa | Gestionar la publicación |
| Administrador | Moderar publicaciones reportadas (spec 009) | — |

## 5. Historias de usuario

- **HU-008-01:** Como titular, quiero publicar los cupos libres de mi suscripción para completar el grupo.
- **HU-008-02:** Como usuario, quiero buscar cupos por servicio y precio para encontrar un grupo.
- **HU-008-03:** Como usuario, quiero enviar una solicitud con un mensaje corto.
- **HU-008-04:** Como titular, quiero ver quién solicita, su puntualidad y aceptar o rechazar.
- **HU-008-05:** Como solicitante, quiero saber el resultado de mi solicitud.
- **HU-008-06:** Como usuario, quiero reportar una publicación sospechosa.
- **HU-008-07:** Como titular, quiero retirar la publicación cuando ya no la necesito.

## 6. Requisitos funcionales

### Publicación
- **RF-008-01:** El titular puede publicar cupos de un grupo **activo** con al menos 1 cupo libre. Campos: cupos ofrecidos (de 1 hasta los libres), descripción (hasta 300 caracteres) y condiciones opcionales (hasta 300 caracteres).
- **RF-008-02:** Cada grupo puede tener **una** publicación activa.
- **RF-008-03:** La publicación muestra: servicio y plan (copia del grupo), cupos ofrecidos, **cuota estimada** por persona si se ocupan los cupos ofrecidos (ver RN-008-02), día de cobro, nombre del titular, su nivel de puntualidad (spec 007), la fecha de publicación y el **estado de la ventana de ingreso**: "abierta hasta [fecha]" o "se abre el [fecha]" (spec 001, RF-001-22).
- **RF-008-04:** La publicación **no** muestra: nombres ni datos de los miembros actuales, comprobantes, datos de pago ni el código de invitación.
- **RF-008-05:** La publicación **expira a los 30 días**; el titular puede renovarla. También se cierra sola si el grupo se llena o se cierra.
- **RF-008-06:** El titular puede editar o retirar la publicación en cualquier momento.

### Búsqueda
- **RF-008-07:** Los usuarios autenticados pueden listar publicaciones activas con filtros por servicio, categoría y rango de cuota estimada, y orden por cuota (menor a mayor), por fecha o por puntualidad del titular.
- **RF-008-08:** La búsqueda excluye publicaciones de grupos donde el usuario ya es miembro y las propias.
- **RF-008-09:** Las listas se paginan.

### Solicitudes
- **RF-008-10:** Un usuario puede solicitar un cupo de una publicación con un mensaje inicial de hasta 200 caracteres, que abre una **solicitud de ingreso** (spec 010) y la primera línea de su chat. Solo se puede solicitar mientras la ventana de ingreso del grupo esté abierta; fuera de ella la publicación se ve, pero el botón de solicitar queda deshabilitado con la fecha de apertura. Rigen los límites de la spec 010: una solicitud activa por grupo y máximo 5 activas por usuario.
- **RF-008-11:** El titular ve las solicitudes con nombre del solicitante, mensaje, su nivel de puntualidad y su calificación en estrellas (spec 007), dentro de la lista de la spec 010 (RF-010-26).
- **RF-008-12:** El ingreso sigue el flujo de la spec 010: el titular envía los datos de pago, el solicitante paga y sube el comprobante, y el titular confirma. El titular también puede rechazar con motivo. Al confirmar, la persona se une al grupo con las reglas de la spec 001 (cupos y RN-001-11).
- **RF-008-13:** El solicitante puede cancelar su solicitud mientras no haya informado el pago (RF-010-15).
- **RF-008-14:** Al aceptarse el último cupo ofrecido, la publicación se cierra y las demás solicitudes `abierta` pasan a `rechazada` por falta de cupo (spec 010, RN-010-05).
- **RF-008-15:** Los plazos de las solicitudes son los de la spec 010 (RN-010-06). Una solicitud `abierta` expira a las 24 horas sin que el titular envíe los datos de pago, o cuando termina la ventana de ingreso, lo que ocurra primero.
- **RF-008-16:** Se notifica (spec 005) al titular de cada solicitud nueva y al solicitante de la respuesta.

### Moderación
- **RF-008-17:** Cualquier usuario puede **reportar** una publicación indicando un motivo (spam, datos falsos, conducta indebida, otro) y un comentario opcional. Un usuario puede reportar una vez por publicación.
- **RF-008-18:** Las publicaciones con 3 reportes de usuarios distintos se **ocultan temporalmente** hasta que un administrador las revise (spec 009).

## 7. Requisitos no funcionales

- **RNF-008-01 (Privacidad):** una publicación nunca expone datos personales de los miembros actuales ni datos de pago.
- **RNF-008-02 (Rendimiento):** buscar cupos responde en menos de 500 ms con hasta 5.000 publicaciones.
- **RNF-008-03 (Concurrencia):** aceptar solicitudes nunca puede superar los cupos del grupo, aunque ocurran a la vez (reserva de cupos de la spec 010, RN-010-02).
- **RNF-008-04 (Abuso):** límites de solicitudes y de reportes por usuario; cuentas suspendidas no pueden publicar ni solicitar.
- **RNF-008-05 (Usabilidad):** buscar, filtrar y solicitar funciona cómodamente desde celular.
- **RNF-008-06 (Auditoría):** se registra quién aceptó o rechazó cada solicitud y cuándo.

## 8. Reglas de negocio

- **RN-008-01:** Solo el titular puede aceptar solicitudes; la aceptación sigue el flujo de la spec 010 y respeta RN-001-05, RN-001-07 y RN-001-13.
- **RN-008-02 (Cuota estimada):** `cuota_estimada = total_bs / (miembros_actuales + cupos_ofrecidos)`, con la regla de redondeo de RN-001-02 aplicada al cobro real. Se rotula como **estimada**: la cuota real depende de cuántos miembros finalmente tenga el grupo.
- **RN-008-03:** Aceptar a alguien cambia la cuota de **todos** los miembros a partir del siguiente cobro (RN-001-03). El titular debe ser consciente de ello antes de aceptar (aviso en pantalla).
- **RN-008-04:** Una publicación activa no cambia cupos si el grupo cambia de tamaño: se recalcula `cupos libres` y, si es menor a los ofrecidos, se ajusta automáticamente.
- **RN-008-05:** Un usuario puede tener solicitudes pendientes en distintas publicaciones, pero una vez aceptado en una, sus otras solicitudes `abierta` al **mismo servicio** pasan a `cancelada` por el sistema (spec 010, RN-010-05). Las que ya están en pago siguen su curso. _(Decidido 2026-10-17)_
- **RN-008-06:** Un solicitante con nivel "En riesgo" puede solicitar; la decisión es del titular.
- **RN-008-07:** Los textos libres (descripción, condiciones, mensaje) se muestran escapados, sin HTML ni enlaces activos.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Publicar en un grupo lleno | Error "No hay cupos libres" |
| Solicitar un cupo con la ventana de ingreso cerrada | Se rechaza mostrando la fecha de apertura; la publicación sigue visible |
| Dos solicitudes aceptadas a la vez para el último cupo | Solo una se completa; la otra recibe error de cupo |
| El grupo se cierra con solicitudes pendientes | Las solicitudes pasan a `rechazada` y se avisa a los solicitantes |
| El titular transfiere la titularidad | La publicación queda a nombre del nuevo titular, previa notificación |
| El solicitante ya tiene una solicitud activa en ese grupo, abierta con el código | No se crea otra: hay una solicitud activa por grupo (RF-010-02) |
| Publicación expirada con solicitudes en curso | Las solicitudes siguen su flujo (spec 010); la publicación deja de recibir nuevas |
| Usuario suspendido con solicitudes pendientes | Las solicitudes se cancelan |
| Mensaje con enlaces o HTML | Se muestra como texto plano |
| Reporte del propio titular a su publicación | No permitido |
| Se oculta una publicación por reportes | Deja de aparecer en la búsqueda y el titular es notificado |
| Un titular intenta publicar con 0 cupos ofrecidos | Error de validación |

## 10. Criterios de aceptación

- **CA-008-01:** Dado un grupo activo con 2 cupos libres, cuando el titular publica 2 cupos, entonces aparece en la búsqueda con la cuota estimada.
- **CA-008-02:** Dado un grupo lleno, cuando el titular intenta publicar, entonces se rechaza.
- **CA-008-03:** Dado un grupo con publicación activa, cuando el titular intenta crear otra, entonces se rechaza.
- **CA-008-04:** Dado un total de Bs 90,00, 2 miembros y 1 cupo ofrecido, cuando se calcula la cuota estimada, entonces es Bs 30,00.
- **CA-008-05:** Dada una publicación, cuando un usuario la consulta, entonces no ve nombres de miembros, datos de pago ni código de invitación.
- **CA-008-06:** Dada una búsqueda por servicio "Netflix", cuando se ejecuta, entonces solo aparecen publicaciones de ese servicio.
- **CA-008-07:** Dado un usuario que ya es miembro de un grupo, cuando busca, entonces no ve las publicaciones de ese grupo.
- **CA-008-08:** Dada una solicitud con mensaje de 250 caracteres, cuando se envía, entonces se rechaza.
- **CA-008-09:** Dado un usuario con 5 solicitudes pendientes, cuando envía la sexta, entonces se rechaza.
- **CA-008-10:** Dada una solicitud con pago informado, cuando el titular confirma, entonces el usuario se une al grupo, las cuotas se recalculan y se notifica a ambos (spec 010).
- **CA-008-11:** Dada una publicación con 1 cupo y 3 solicitudes `abierta`, cuando el titular confirma el ingreso de una, entonces las otras pasan a `rechazada` y la publicación se cierra.
- **CA-008-12:** Dadas dos solicitudes que compiten por el último cupo ofrecido, entonces exactamente una llega a aceptarse.
- **CA-008-13:** Dado un solicitante, cuando cancela su solicitud antes de informar el pago, entonces el titular ya no la ve entre las activas.
- **CA-008-14:** Dada una publicación de más de 30 días, cuando corre el proceso diario, entonces pasa a `expirada`.
- **CA-008-15:** Dada una solicitud `abierta` de más de 24 horas sin datos de pago, cuando se evalúa, entonces pasa a `expirada` y se notifica.
- **CA-008-16:** Dado un grupo que se cierra, cuando ocurre, entonces su publicación se cierra y las solicitudes pendientes se rechazan.
- **CA-008-17:** Dados 3 reportes de usuarios distintos, cuando se registra el tercero, entonces la publicación se oculta de la búsqueda.
- **CA-008-18:** Dado un usuario que ya reportó una publicación, cuando reporta otra vez, entonces se rechaza.
- **CA-008-19:** Dado un texto con `<script>`, cuando se muestra, entonces aparece como texto plano.
- **CA-008-20:** Dado un usuario que no es titular, cuando intenta aceptar una solicitud, entonces recibe `403`.
- **CA-008-21:** Dado el titular, cuando ve una solicitud, entonces ve el nivel y la calificación en estrellas del solicitante.
- **CA-008-23:** Dada una publicación de un grupo con la ventana de ingreso cerrada, cuando un usuario la abre, entonces ve "se abre el [fecha]" y no puede solicitar; con la ventana abierta ve "abierta hasta [fecha]".
- **CA-008-24:** Dado un usuario aceptado en un grupo de un servicio, cuando tiene otras solicitudes `abierta` a grupos del mismo servicio, entonces pasan a `cancelada` y las que están en pago siguen su curso.
- **CA-008-22:** Dado un usuario suspendido, cuando intenta publicar o solicitar, entonces se rechaza.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] **Quién ve las publicaciones** (P27). **Decidido:** todos los usuarios autenticados; sin publicaciones públicas sin sesión.
- [RESUELTO 2026-10-17] **Aprobación.** El titular decide y el ingreso exige pago previo y confirmación (spec 010).
- [RESUELTO 2026-10-17] **Transferencia de titularidad** con publicación activa. **Decidido:** la publicación pasa al nuevo titular, previa notificación.
- [RESUELTO 2026-10-17] **Solicitudes al mismo servicio** tras ser aceptado en una publicación (RN-008-05). **Decidido:** quedan pendientes hasta que el usuario las retire.
- [RESUELTO 2026-10-17] ¿Se muestra el celular del titular antes de ser aceptado? **Decidido:** no; se comparte solo tras aceptar la solicitud.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | Las solicitudes pasan a ser las de la spec 010 (chat, pago previo y confirmación); cambian RF-008-10 a RF-008-15, RNF-008-03, RN-008-01 y CA-008-10 a CA-008-15 | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: ventana de ingreso en la publicación y en la solicitud (RF-008-03, 10, 15), cancelación de otras solicitudes al mismo servicio (RN-008-05, CA-008-23 y 24); se aceptan las propuestas de la sección 11 | Equipo |
| 2026-10-18 | Spec aprobada por las tres capas (BD, Backend y Frontend) | Equipo |
| 2026-10-20 | Convergencia: puertos con la spec 010, prioridad de `cannotRequestReason` y visibilidad de `GET /listings/:id` | Equipo (`/speckit-converge`) |
