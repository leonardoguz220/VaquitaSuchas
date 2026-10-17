# Spec 008 — Cupos libres

- **Estado:** borrador
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Leonardo Guzman (Backend): pendiente · Adrian Vargas (Frontend): pendiente
- **Prioridad:** P2 (extra)
- **Depende de:** 001 (grupos), 003 (usuarios), 005 (notificaciones), 007 (reputación, para mostrar puntualidad)
- **Módulo cubierto:** 9 (Cupos libres)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Muchos grupos tienen lugares vacíos: un plan familiar de 6 personas con 4 ocupadas paga más por persona de lo necesario. Y mucha gente busca compartir un servicio y no conoce a nadie. Los **cupos libres** conectan a ambos lados: el titular publica los lugares que le sobran y quien busca envía una solicitud que el titular aprueba.

## 2. Objetivos

- Que un titular publique los cupos libres de su grupo de forma segura.
- Que cualquier usuario busque cupos por servicio y cuota estimada.
- Que el titular decida a quién acepta, con información de puntualidad.
- Que la unión por solicitud respete las mismas reglas del grupo (cupos, cuotas, historial).

## 3. Fuera de alcance

- Pagos o depósitos de garantía por el cupo.
- Chat dentro de la app (la coordinación se hace por celular o WhatsApp con los datos del perfil, spec 003).
- Publicaciones con imágenes.
- Recomendaciones automáticas de grupos.
- Cobro de comisiones por la intermediación.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Titular | Publicar, editar y retirar publicaciones de **sus** grupos; aceptar o rechazar solicitudes | Publicar cupos de grupos ajenos o de grupos cerrados |
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
- **RF-008-03:** La publicación muestra: servicio y plan (copia del grupo), cupos ofrecidos, **cuota estimada** por persona si se ocupan los cupos ofrecidos (ver RN-008-02), día de cobro, nombre del titular, su nivel de puntualidad (spec 007) y la fecha de publicación.
- **RF-008-04:** La publicación **no** muestra: nombres ni datos de los miembros actuales, comprobantes, datos de pago ni el código de invitación.
- **RF-008-05:** La publicación **expira a los 30 días**; el titular puede renovarla. También se cierra sola si el grupo se llena o se cierra.
- **RF-008-06:** El titular puede editar o retirar la publicación en cualquier momento.

### Búsqueda
- **RF-008-07:** Los usuarios autenticados pueden listar publicaciones activas con filtros por servicio, categoría y rango de cuota estimada, y orden por cuota (menor a mayor), por fecha o por puntualidad del titular.
- **RF-008-08:** La búsqueda excluye publicaciones de grupos donde el usuario ya es miembro y las propias.
- **RF-008-09:** Las listas se paginan.

### Solicitudes
- **RF-008-10:** Un usuario puede enviar una solicitud a una publicación con un mensaje de hasta 200 caracteres. Máximo 5 solicitudes pendientes por usuario y una por publicación.
- **RF-008-11:** El titular ve las solicitudes con nombre del solicitante, mensaje, su nivel de puntualidad y su puntaje (spec 007).
- **RF-008-12:** El titular puede **aceptar** o **rechazar** (con un motivo opcional). Al aceptar, el usuario se une al grupo aplicando las reglas de la spec 001 (RN-001-11 y cupos).
- **RF-008-13:** El solicitante puede retirar su solicitud mientras esté pendiente.
- **RF-008-14:** Al aceptar la última cupo ofrecido, la publicación se cierra y las demás solicitudes pendientes pasan a `rechazada` por falta de cupo.
- **RF-008-15:** Las solicitudes pendientes **vencen a los 14 días**.
- **RF-008-16:** Se notifica (spec 005) al titular de cada solicitud nueva y al solicitante de la respuesta.

### Moderación
- **RF-008-17:** Cualquier usuario puede **reportar** una publicación indicando un motivo (spam, datos falsos, conducta indebida, otro) y un comentario opcional. Un usuario puede reportar una vez por publicación.
- **RF-008-18:** Las publicaciones con 3 reportes de usuarios distintos se **ocultan temporalmente** hasta que un administrador las revise (spec 009).

## 7. Requisitos no funcionales

- **RNF-008-01 (Privacidad):** una publicación nunca expone datos personales de los miembros actuales ni datos de pago.
- **RNF-008-02 (Rendimiento):** buscar cupos responde en menos de 500 ms con hasta 5.000 publicaciones.
- **RNF-008-03 (Concurrencia):** aceptar solicitudes y unirse por código nunca pueden superar los cupos del grupo, aunque ocurran a la vez.
- **RNF-008-04 (Abuso):** límites de solicitudes y de reportes por usuario; cuentas suspendidas no pueden publicar ni solicitar.
- **RNF-008-05 (Usabilidad):** buscar, filtrar y solicitar funciona cómodamente desde celular.
- **RNF-008-06 (Auditoría):** se registra quién aceptó o rechazó cada solicitud y cuándo.

## 8. Reglas de negocio

- **RN-008-01:** Solo el titular puede aceptar solicitudes; la aceptación equivale a unirse por código y respeta RN-001-05, RN-001-07 y RN-001-13.
- **RN-008-02 (Cuota estimada):** `cuota_estimada = total_bs / (miembros_actuales + cupos_ofrecidos)`, con la regla de redondeo de RN-001-02 aplicada al cobro real. Se rotula como **estimada**: la cuota real depende de cuántos miembros finalmente tenga el grupo.
- **RN-008-03:** Aceptar a alguien cambia la cuota de **todos** los miembros a partir del siguiente cobro (RN-001-03). El titular debe ser consciente de ello antes de aceptar (aviso en pantalla).
- **RN-008-04:** Una publicación activa no cambia cupos si el grupo cambia de tamaño: se recalcula `cupos libres` y, si es menor a los ofrecidos, se ajusta automáticamente.
- **RN-008-05:** Un usuario puede tener solicitudes pendientes en distintas publicaciones, pero una vez aceptado en una, sus otras solicitudes al **mismo servicio** se mantienen pendientes hasta que él las retire [NECESITA ACLARACIÓN].
- **RN-008-06:** Un solicitante con nivel "En riesgo" puede solicitar; la decisión es del titular.
- **RN-008-07:** Los textos libres (descripción, condiciones, mensaje) se muestran escapados, sin HTML ni enlaces activos.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Publicar en un grupo lleno | Error "No hay cupos libres" |
| Dos solicitudes aceptadas a la vez para el último cupo | Solo una se completa; la otra recibe error de cupo |
| El grupo se cierra con solicitudes pendientes | Las solicitudes pasan a `rechazada` y se avisa a los solicitantes |
| El titular transfiere la titularidad | La publicación queda a nombre del nuevo titular [NECESITA ACLARACIÓN] |
| El solicitante ya se unió al grupo por código | La solicitud se cancela automáticamente |
| Publicación expirada con solicitudes pendientes | Las solicitudes quedan vencidas y se notifica |
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
- **CA-008-10:** Dada una solicitud, cuando el titular la acepta, entonces el usuario se une al grupo, las cuotas se recalculan y se notifica a ambos.
- **CA-008-11:** Dada una publicación con 1 cupo y 3 solicitudes, cuando el titular acepta una, entonces las otras pasan a `rechazada` y la publicación se cierra.
- **CA-008-12:** Dadas dos aceptaciones simultáneas para el último cupo, entonces exactamente una se completa.
- **CA-008-13:** Dado un solicitante, cuando retira su solicitud pendiente, entonces el titular ya no la ve.
- **CA-008-14:** Dada una publicación de más de 30 días, cuando corre el proceso diario, entonces pasa a `expirada`.
- **CA-008-15:** Dada una solicitud pendiente de más de 14 días, cuando corre el proceso diario, entonces pasa a `vencida` y se notifica.
- **CA-008-16:** Dado un grupo que se cierra, cuando ocurre, entonces su publicación se cierra y las solicitudes pendientes se rechazan.
- **CA-008-17:** Dados 3 reportes de usuarios distintos, cuando se registra el tercero, entonces la publicación se oculta de la búsqueda.
- **CA-008-18:** Dado un usuario que ya reportó una publicación, cuando reporta otra vez, entonces se rechaza.
- **CA-008-19:** Dado un texto con `<script>`, cuando se muestra, entonces aparece como texto plano.
- **CA-008-20:** Dado un usuario que no es titular, cuando intenta aceptar una solicitud, entonces recibe `403`.
- **CA-008-21:** Dado el titular, cuando ve una solicitud, entonces ve el nivel y puntaje de puntualidad del solicitante.
- **CA-008-22:** Dado un usuario suspendido, cuando intenta publicar o solicitar, entonces se rechaza.

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Quién ve las publicaciones** (P27). **Propuesta:** todos los usuarios autenticados; sin publicaciones públicas sin sesión.
- [NECESITA ACLARACIÓN] **Aprobación.** **Propuesta:** el titular aprueba cada solicitud.
- [NECESITA ACLARACIÓN] **Transferencia de titularidad** con publicación activa. **Propuesta:** la publicación pasa al nuevo titular, previa notificación.
- [NECESITA ACLARACIÓN] **Solicitudes al mismo servicio** tras ser aceptado en una publicación (RN-008-05). **Propuesta:** quedan pendientes hasta que el usuario las retire.
- [NECESITA ACLARACIÓN] ¿Se muestra el celular del titular antes de ser aceptado? **Propuesta:** no; se comparte solo tras aceptar la solicitud.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Claude, a pedido del equipo |
