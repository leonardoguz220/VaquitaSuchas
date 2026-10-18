# Spec 010 — Solicitudes de ingreso y chat

- **Estado:** borrador
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Adrian Vargas (Frontend): pendiente · Leonardo Guzman (Backend): pendiente
- **Prioridad:** P0 (MVP)
- **Depende de:** 001 (Suscripciones compartidas), 002 (Cobros y pagos), 003 (Usuarios y autenticación)
- **Módulos cubiertos:** 3 (ingreso al grupo); amplía el módulo de suscripciones compartidas
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

En el diseño anterior quien tenía el código de invitación se unía al grupo de inmediato y recién pagaba en el siguiente cobro. Eso dejaba al titular expuesto desde el primer día: la persona usaba la cuenta compartida sin haber pagado nada y el titular, que ya había pagado la plataforma, cubría esa cuota.

El equipo decidió que el ingreso funcione como una operación entre pares, parecida a una orden de compraventa: la persona abre una **solicitud de ingreso**, conversa con el titular en un **chat propio de esa solicitud**, el titular le envía los datos de pago (por ejemplo su QR), la persona paga fuera de la app y sube el comprobante, y el titular, que verifica el dinero en su propio banco, confirma. Solo entonces la persona pasa a ser miembro.

Vaquita no custodia dinero. En una operación entre pares con custodia, la plataforma retiene lo que se intercambia hasta que ambas partes cumplen. Aquí lo que se entrega es el acceso a la cuenta, y lo tiene el titular. Por eso la protección del solicitante no viene de la custodia sino de los plazos, de la evidencia que queda registrada (chat, comprobante y línea de tiempo), de un reclamo que revisa un administrador y de una sanción fuerte para el titular que estafe (baneo de la cuenta).

## 2. Objetivos

- Que nadie entre a un grupo sin que el titular haya confirmado su pago.
- Que el solicitante y el titular puedan conversar dentro de la app, con texto y fotos, y que esa conversación quede como evidencia.
- Que el pago de ingreso tenga plazos cortos y claros para ambas partes.
- Que el pago de ingreso quede registrado como el cobro del período en curso del nuevo miembro, sin romper el historial ni la reputación.
- Que un solicitante que pagó y no fue agregado pueda reclamar, y que un administrador revise la evidencia.

## 3. Fuera de alcance

- Custodia, retención o devolución de dinero por parte de Vaquita. Si el titular recibe el dinero y no agrega a la persona, la devolución se resuelve entre ellos fuera de la app.
- Pasarela de pago o verificación automática del pago: el titular verifica en su banco.
- Chat de grupo entre todos los miembros. El chat de esta spec existe por solicitud y solo entre solicitante y titular.
- Mensajes de voz, llamadas, videos, documentos y enlaces con vista previa. El chat admite texto e imágenes.
- Pago por adelantado de los meses siguientes. Después del pago de ingreso se aplican los cobros mensuales de la spec 002.
- Publicación y búsqueda de cupos (spec 008). Esa spec solo es otra puerta de entrada hacia la solicitud de esta.
- Resolución automática de reclamos.
- Calificación de reputación del titular por rapidez de respuesta (spec 007, pregunta abierta).

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Solicitante (usuario autenticado) | Abrir una solicitud con un código válido; escribir en el chat de su solicitud; subir el comprobante; cancelar la solicitud antes de informar el pago; abrir un reclamo | Ver solicitudes de otras personas; confirmar su propio pago |
| Titular | Ver las solicitudes de sus grupos; escribir en el chat; enviar los datos de pago; confirmar, rechazar o registrar un pago en efectivo; responder un reclamo | Confirmar solicitudes de un grupo ajeno; modificar el monto ya cotizado |
| Otro miembro del grupo | Nada sobre las solicitudes (recibe `403`) | Leer el chat ni ver comprobantes |
| Usuario ajeno a la solicitud y al grupo | Nada (recibe `404`) | — |
| Administrador | Revisar un reclamo con su evidencia y resolverlo (spec 009) | Ver el chat o el comprobante de una solicitud sin reclamo |
| Sistema | Reservar y liberar cupos, vencer plazos, registrar eventos | — |

## 5. Historias de usuario

- **HU-010-01:** Como solicitante, quiero abrir una solicitud con el código del grupo y conversar con el titular, para acordar mi ingreso.
- **HU-010-02:** Como titular, quiero enviar mis datos de pago y el monto exacto a quien quiere entrar, para cobrar antes de darle acceso.
- **HU-010-03:** Como solicitante, quiero ver cuánto debo pagar y cuánto tiempo me queda, para pagar sin apuros ni dudas.
- **HU-010-04:** Como solicitante, quiero subir mi comprobante dentro de la solicitud, para que el titular lo revise.
- **HU-010-05:** Como titular, quiero confirmar el ingreso solo cuando el dinero me llegó a mi banco, para no perder dinero.
- **HU-010-06:** Como solicitante, quiero enviar fotos en el chat, para mostrar capturas de mi pago o de un problema.
- **HU-010-07:** Como solicitante que pagó y no fue agregado, quiero abrir un reclamo, para que un administrador revise lo ocurrido.
- **HU-010-08:** Como administrador, quiero ver la evidencia completa de un reclamo, para decidir con fundamento y sancionar a quien estafe.

## 6. Requisitos funcionales

### Apertura de la solicitud
- **RF-010-01:** Ingresar un código de invitación válido (spec 001, RF-001-07) **abre una solicitud de ingreso**; no une a la persona al grupo. Se exige que el grupo esté activo, que reciba nuevos miembros, que haya un cupo disponible (RN-010-02) y que la persona no sea ya miembro.
- **RF-010-02:** Una persona puede tener **una** solicitud activa por grupo y **hasta 5** solicitudes activas en total. Son activas las que están en `abierta`, `esperando_pago` o `pago_informado`.
- **RF-010-03:** Al abrir la solicitud, el solicitante ve el servicio, el plan, la cuota estimada, el día de cobro y el nombre del titular con su calificación (spec 007, cuando esté disponible). No ve nombres de los miembros ni datos de pago.
- **RF-010-04:** Al abrirse, se crea el chat de la solicitud y el titular recibe un aviso dentro de la app.

### Chat
- **RF-010-05:** Solo el solicitante y el titular pueden leer y escribir en el chat de una solicitud. Un mensaje contiene texto (de 1 a 1.000 caracteres), una imagen (JPG o PNG, máximo 5 MB) o ambos.
- **RF-010-06:** Los mensajes **no se editan ni se borran**. Se ordenan por la fecha del servidor y se conservan como evidencia.
- **RF-010-07:** El chat acepta mensajes mientras la solicitud está activa. Cuando llega a un estado final queda en **solo lectura**, y se conserva 12 meses desde ese momento.
- **RF-010-08:** El texto se muestra como texto plano, sin HTML ni enlaces activos. Las imágenes se sirven con URL firmada de corta duración y se valida su tipo real.
- **RF-010-09:** Con la conversación abierta, cada participante ve los mensajes nuevos de la otra persona en un máximo de 10 segundos. Cada participante ve un contador de mensajes no leídos por solicitud.
- **RF-010-10:** Cada persona puede enviar como máximo 20 mensajes por minuto en una solicitud.

### Pago de ingreso
- **RF-010-11:** El titular puede **enviar los datos de pago** desde una solicitud `abierta`. Al hacerlo, el sistema calcula la cuota de ingreso (RN-010-01) y la fija en la solicitud, reserva un cupo (RN-010-02), adjunta los datos de pago configurados en el grupo (spec 001, RF-001-20) o el QR que el titular elija enviar en ese momento, y pasa la solicitud a `esperando_pago` con un plazo de **15 minutos**.
- **RF-010-12:** Si no hay un cupo disponible, el titular no puede enviar los datos de pago de otra solicitud.
- **RF-010-13:** Dentro de los 15 minutos, el solicitante sube el **comprobante** (JPG, PNG o PDF, máximo 5 MB), indica el método (`qr` o `transferencia`) y, opcionalmente, una referencia de hasta 100 caracteres. La solicitud pasa a `pago_informado`.
- **RF-010-14:** Si pasan los 15 minutos sin comprobante, la solicitud pasa a `expirada` y el cupo se libera.
- **RF-010-15:** El solicitante puede **cancelar** la solicitud mientras esté `abierta` o `esperando_pago`. Después de informar el pago ya no puede cancelar.
- **RF-010-16:** El titular puede **rechazar** una solicitud activa con un motivo obligatorio (de 5 a 200 caracteres). El cupo reservado se libera.

### Confirmación
- **RF-010-17:** En `pago_informado` el titular tiene **60 minutos** para decidir. A los 30 minutos sin decisión recibe un recordatorio. Al **confirmar**, la solicitud pasa a `aceptada` y ocurre en una sola operación: la persona se une al grupo como miembro y se registra su cobro de ingreso (RN-010-03).
- **RF-010-18:** El titular puede registrar un **pago en efectivo** desde `esperando_pago`, sin comprobante. La solicitud pasa a `aceptada` con método `efectivo` y se aplica lo mismo que en la confirmación.
- **RF-010-19:** Si pasan los 60 minutos sin decisión, la solicitud pasa a `expirada` con el motivo `titular_sin_respuesta`, el cupo se libera y se habilita el reclamo (RF-010-21).
- **RF-010-20:** Aceptar nunca puede superar los cupos del grupo, aunque haya varias solicitudes a la vez.

### Reclamo
- **RF-010-21:** El solicitante puede abrir un **reclamo** sobre una solicitud en la que informó el pago (llegó a `pago_informado`) y que terminó `rechazada` o `expirada` por falta de respuesta del titular. Debe abrirlo dentro de 7 días desde que la solicitud llegó a su estado final. Describe lo ocurrido en 10 a 500 caracteres. Hay un único tipo de reclamo y uno por solicitud.
- **RF-010-22:** El titular puede dejar **una** respuesta al reclamo (de 10 a 500 caracteres).
- **RF-010-23:** El administrador ve la cola de reclamos con la evidencia completa de cada uno: línea de tiempo de la solicitud, chat, comprobante, monto cotizado y respuesta del titular. Cada vez que abre esa evidencia queda en el log de auditoría (spec 009).
- **RF-010-24:** El administrador resuelve el reclamo con un motivo (de 10 a 300 caracteres) como `estafa_confirmada` o `sin_falta`. Con `estafa_confirmada` se banea la cuenta del titular (spec 009, RF-009-19). El solicitante y el titular ven la decisión y su motivo.
- **RF-010-25:** La app deja claro, antes de pagar, que Vaquita no devuelve dinero ni obliga al titular a hacerlo, y que el reclamo sirve para sancionar y dejar constancia.

### Consulta
- **RF-010-26:** El solicitante ve sus solicitudes con su estado y el tiempo restante del plazo vigente. El titular ve las solicitudes de cada uno de sus grupos con filtro por estado, ordenadas de la más antigua a la más reciente, con el nombre del solicitante y su calificación en estrellas.
- **RF-010-27:** Cada solicitud tiene una **línea de tiempo** de eventos (abierta, datos de pago enviados, comprobante subido, confirmada, rechazada, cancelada, expirada, reclamo abierto y resuelto) con fecha y autor. El registro es de solo anexado.

## 7. Requisitos no funcionales

- **RNF-010-01 (Seguridad):** Todos los permisos se validan en el servidor. Un usuario ajeno a la solicitud y al grupo recibe `404`; un miembro del grupo que no participa de la solicitud recibe `403`.
- **RNF-010-02 (Privacidad):** El chat y los comprobantes de una solicitud solo los ven el solicitante y el titular. El administrador los ve únicamente cuando hay un reclamo abierto y queda registrado. El celular del solicitante se comparte con el titular solo después de aceptada la solicitud (spec 003, RN-003-03).
- **RNF-010-03 (Confiabilidad):** Los plazos se evalúan con la hora del servidor **en el momento de consultar o actuar**, y una tarea programada los limpia después. Así el resultado es correcto aunque el servicio haya estado dormido o reiniciado cuando venció el plazo.
- **RNF-010-04 (Concurrencia):** La reserva de cupos, la confirmación y la liberación se hacen en transacciones; dos solicitudes nunca ocupan el mismo cupo.
- **RNF-010-05 (Integridad):** Las transiciones de estado se validan en el servidor con una función pura; una transición inválida devuelve error y no cambia datos.
- **RNF-010-06 (Usabilidad):** Todo el flujo se completa desde el celular. La pantalla muestra una cuenta regresiva del plazo vigente y un texto claro de qué protege Vaquita y qué no.
- **RNF-010-07 (Rendimiento):** Listar las solicitudes de un usuario responde en menos de 500 ms con hasta 50 solicitudes.
- **RNF-010-08 (Auditoría):** Todo cambio de estado y toda apertura de evidencia por un administrador quedan registrados con autor, fecha y motivo si aplica.

## 8. Reglas de negocio

- **RN-010-01 (Cuota de ingreso):** `cuota_ingreso = floor(total_bs_centavos / (miembros_actuales + 1))`, donde `miembros_actuales` incluye al titular, es decir, el precio del mes dividido entre los miembros que tendrá el grupo con la persona incluida. Se calcula al enviar los datos de pago y **no cambia** durante la solicitud, aunque cambie el tipo de cambio, el precio o el número de miembros. Los centavos y las diferencias los absorbe el titular (RN-001-02).
- **RN-010-02 (Reserva de cupo):** `cupos_disponibles = cupos_totales − miembros − solicitudes en esperando_pago o pago_informado`. Una solicitud `abierta` no reserva cupo.
- **RN-010-03 (El pago de ingreso es un cobro):** al aceptar, se crea el cobro del **período en curso** del nuevo miembro directamente en estado `pagado`, con origen `ingreso`, el snapshot de la cuota (monto cotizado, precio, moneda, tipo de cambio, número de miembros con el nuevo y período), el comprobante y la referencia a la solicitud. `primera_subida_en` es la fecha del comprobante y `pagado_en` el momento de la confirmación (spec 002, RN-002-08). Por la regla de unicidad (RF-002-04), la generación de cobros del mismo período no crea otro para esa persona.
- **RN-010-04 (Primer cobro regular):** desde la siguiente fecha de corte el nuevo miembro recibe los cobros normales de la spec 002. Esta regla reemplaza a RN-001-11, según la cual quien entraba a mitad de mes pagaba desde el siguiente cobro.
- **RN-010-05 (Máquina de estados):**

  | Desde | Hacia | Quién | Condición |
  |---|---|---|---|
  | _(nueva)_ | `abierta` | Solicitante | Ingresa un código válido (o solicita un cupo publicado, spec 008) |
  | `abierta` | `esperando_pago` | Titular | Envía los datos de pago y hay cupo disponible |
  | `abierta` | `cancelada` | Solicitante | Cancela |
  | `abierta` | `expirada` | Sistema | Pasan 24 horas sin que el titular envíe los datos de pago |
  | `esperando_pago` | `pago_informado` | Solicitante | Sube el comprobante dentro de los 15 minutos |
  | `esperando_pago` | `aceptada` | Titular | Registra un pago en efectivo |
  | `esperando_pago` | `cancelada` | Solicitante | Cancela |
  | `esperando_pago` | `expirada` | Sistema | Pasan 15 minutos sin comprobante |
  | `pago_informado` | `aceptada` | Titular | Confirma |
  | `pago_informado` | `expirada` | Sistema | Pasan 60 minutos sin decisión |
  | `abierta` / `esperando_pago` / `pago_informado` | `rechazada` | Titular | Rechaza con motivo |
  | `abierta` / `esperando_pago` / `pago_informado` | `rechazada` | Sistema | El grupo se cierra, el titular es baneado o no queda cupo |
  | `abierta` / `esperando_pago` / `pago_informado` | `cancelada` | Sistema | La cuenta del solicitante es suspendida o baneada |

  `aceptada`, `rechazada`, `cancelada` y `expirada` son estados **finales**. Cualquier otra transición es inválida.
- **RN-010-06 (Plazos):** los plazos de 15 minutos, 60 minutos, el recordatorio de 30 minutos y las 24 horas de una solicitud `abierta` son valores por defecto de configuración. Se cuentan desde el momento en que el servidor registra el evento que los inicia.
- **RN-010-07 (Reclamo sin custodia):** un reclamo no devuelve dinero ni cambia el estado final de la solicitud. Su efecto es la decisión del administrador y, si corresponde, el baneo del titular.
- **RN-010-08 (Baneo por decisión):** el baneo lo decide el administrador al resolver un reclamo. Un reclamo por sí solo no banea a nadie.
- **RN-010-09:** Un titular no puede transferir la titularidad ni cerrar el grupo mientras tenga solicitudes en `esperando_pago` o `pago_informado`.
- **RN-010-10:** Si cambia el número de miembros durante una solicitud, la cuota ya cotizada se mantiene.
- **RN-010-11:** Pausar la recepción de nuevos miembros (spec 001, RF-001-09) o regenerar el código no afecta a las solicitudes ya abiertas; solo impide abrir nuevas.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Código inexistente, regenerado o de grupo cerrado | Error genérico "Código inválido", igual que en la spec 001 |
| Grupo sin cupo disponible al abrir la solicitud | Error "No hay cupos disponibles" |
| El titular intenta enviar datos de pago y el último cupo ya está reservado | Error indicando que no hay cupo disponible; la solicitud sigue `abierta` |
| El solicitante sube el comprobante a los 16 minutos | Se rechaza por plazo vencido; la solicitud pasa a `expirada` y el chat queda en lectura |
| El tipo de cambio o el precio cambian mientras la solicitud está `esperando_pago` | La cuota ya cotizada no cambia (RN-010-01) |
| Entra otro miembro mientras la solicitud está en curso | La cuota cotizada se mantiene; el titular absorbe la diferencia |
| El titular rechaza una solicitud con pago informado | La solicitud queda `rechazada` y el solicitante puede abrir un reclamo |
| El titular no responde en 60 minutos | `expirada` con motivo `titular_sin_respuesta`; habilita el reclamo |
| Reclamo fuera de los 7 días, repetido, o de una solicitud sin pago informado | Error claro, sin crear el reclamo |
| El servicio estuvo dormido cuando venció un plazo | El plazo se evalúa al consultar o actuar; la solicitud aparece vencida aunque la tarea no haya corrido (RNF-010-03) |
| Mensaje con HTML o `<script>` | Se muestra como texto plano |
| Archivo de más de 5 MB o de tipo no permitido (por ejemplo `.exe`, o un PDF en el chat) | Error claro; no se envía el mensaje ni cambia el estado |
| El grupo se cierra con solicitudes activas | Pasan a `rechazada` por el sistema y se avisa a los solicitantes |
| El titular es baneado con solicitudes activas | Pasan a `rechazada` por el sistema; quien había informado un pago puede reclamar |
| El solicitante es suspendido o baneado con solicitudes activas | Pasan a `cancelada` por el sistema |
| El titular intenta transferir la titularidad con solicitudes en pago | Error indicando que primero debe resolverlas (RN-010-09) |
| La confirmación llega con el grupo ya lleno por otra aceptación | No puede ocurrir: el cupo estaba reservado (RN-010-02); si ocurriera, se rechaza la confirmación y no cambia nada |
| Dos acciones simultáneas sobre la misma solicitud (por ejemplo confirmar y vencer) | Solo una se aplica; la otra recibe error de estado |
| La persona ya fue aceptada por otra solicitud al mismo grupo | La otra solicitud no existe: solo hay una activa por grupo (RF-010-02) |
| Ingreso el mismo día de la fecha de corte antes de generar los cobros | Se acepta; la generación no duplica el cobro de ese período (RF-002-04) |

## 10. Criterios de aceptación

- **CA-010-01:** Dado un código válido de un grupo con cupo, cuando un usuario lo ingresa, entonces se crea una solicitud `abierta`, se crea su chat y el número de miembros del grupo no cambia.
- **CA-010-02:** Dado un usuario que ya es miembro, o un grupo cerrado, pausado o sin cupo, cuando intenta abrir una solicitud, entonces se rechaza sin crear nada.
- **CA-010-03:** Dado un usuario con una solicitud activa en un grupo, cuando intenta abrir otra en el mismo grupo, entonces se rechaza; y con 5 solicitudes activas, la sexta se rechaza.
- **CA-010-04:** Dado un precio total de Bs 90,00 y un grupo con 2 miembros (incluido el titular), cuando el titular envía los datos de pago, entonces la cuota de ingreso es Bs 30,00, la solicitud pasa a `esperando_pago` y vence en 15 minutos.
- **CA-010-05:** Dado un precio total de Bs 100,00 y un grupo con 2 miembros, cuando se cotiza el ingreso, entonces la cuota es Bs 33,33 y el centavo restante lo absorbe el titular.
- **CA-010-06:** Dado un grupo con un único cupo disponible y dos solicitudes `abiertas`, cuando el titular envía los datos de pago a las dos a la vez, entonces solo una pasa a `esperando_pago` y la otra recibe error de cupo.
- **CA-010-07:** Dada una solicitud `esperando_pago`, cuando el solicitante sube un comprobante JPG de 2 MB antes de los 15 minutos, entonces pasa a `pago_informado` y queda registrado en la línea de tiempo.
- **CA-010-08:** Dado un archivo de 6 MB o un `.exe`, cuando el solicitante intenta subirlo como comprobante, entonces se rechaza y el estado no cambia.
- **CA-010-09:** Dada una solicitud `esperando_pago` sin comprobante, cuando pasan 15 minutos, entonces se evalúa como `expirada` y el cupo vuelve a estar disponible, incluso si la tarea programada no se ejecutó.
- **CA-010-10:** Dada una solicitud `esperando_pago` vencida, cuando el solicitante intenta subir el comprobante, entonces se rechaza por plazo vencido.
- **CA-010-11:** Dada una solicitud `pago_informado`, cuando el titular confirma, entonces pasa a `aceptada`, la persona queda como miembro, las cuotas del grupo se recalculan y se crea un cobro del período en curso en estado `pagado` con origen `ingreso` y el snapshot de la cuota cotizada.
- **CA-010-12:** Dado un ingreso confirmado, cuando corre la generación de cobros del mismo período, entonces no se crea un segundo cobro para ese miembro; y en el siguiente corte recibe su cobro regular.
- **CA-010-13:** Dada una solicitud aceptada, cuando el titular y el nuevo miembro se consultan, entonces se ven el celular mutuamente si lo ingresaron.
- **CA-010-14:** Dada una solicitud `pago_informado` con 30 minutos sin decisión, cuando se cumple ese tiempo, entonces el titular recibe un recordatorio.
- **CA-010-15:** Dada una solicitud `pago_informado` con 60 minutos sin decisión, cuando se cumple ese tiempo, entonces pasa a `expirada` con motivo `titular_sin_respuesta` y el cupo se libera.
- **CA-010-16:** Dada una solicitud `esperando_pago`, cuando el titular registra un pago en efectivo, entonces pasa a `aceptada` con método `efectivo` y se aplica lo mismo que en una confirmación.
- **CA-010-17:** Dada una solicitud activa, cuando el titular rechaza con motivo, entonces pasa a `rechazada` y el solicitante ve el motivo; sin motivo recibe error de validación.
- **CA-010-18:** Dada una solicitud `abierta` o `esperando_pago`, cuando el solicitante la cancela, entonces pasa a `cancelada` y libera el cupo; y en `pago_informado` no puede cancelarla.
- **CA-010-19:** Dada una solicitud, cuando el solicitante y el titular intercambian un mensaje de texto y una imagen JPG de 3 MB, entonces ambos los ven en orden y en un máximo de 10 segundos.
- **CA-010-20:** Dado un usuario ajeno al grupo, cuando consulta el chat o la solicitud, entonces recibe `404`; dado un miembro del grupo que no participa, recibe `403`.
- **CA-010-21:** Dado un mensaje de 1.001 caracteres, o con un PDF adjunto, cuando se envía, entonces se rechaza.
- **CA-010-22:** Dado un mensaje con `<script>`, cuando se muestra, entonces aparece como texto plano.
- **CA-010-23:** Dado el chat, cuando se busca una forma de editar o borrar un mensaje desde la API, entonces no existe esa operación.
- **CA-010-24:** Dada una solicitud en estado final, cuando alguien intenta enviar un mensaje, entonces recibe error y el chat queda en solo lectura.
- **CA-010-25:** Dada cualquier transición no listada en RN-010-05, cuando se intenta, entonces la función de transición la rechaza (test unitario exhaustivo sobre todas las combinaciones de estado y acción).
- **CA-010-26:** Dada una solicitud `esperando_pago`, cuando el titular cambia el tipo de cambio de la suscripción, entonces la cuota cotizada no cambia.
- **CA-010-27:** Dada una solicitud que llegó a `pago_informado` y terminó `expirada` por falta de respuesta, cuando el solicitante abre un reclamo dentro de 7 días, entonces se crea y el titular puede dejar una respuesta.
- **CA-010-28:** Dada una solicitud sin pago informado, o un reclamo ya existente, o un plazo de más de 7 días, cuando se intenta abrir un reclamo, entonces se rechaza.
- **CA-010-29:** Dado un reclamo, cuando un administrador abre su evidencia, entonces ve línea de tiempo, chat y comprobante y queda registrado en el log de auditoría; un usuario normal recibe `403`.
- **CA-010-30:** Dado un reclamo, cuando el administrador lo resuelve como `estafa_confirmada` con motivo, entonces la cuenta del titular queda baneada (spec 009) y ambas partes ven la decisión.
- **CA-010-31:** Dado un reclamo resuelto como `sin_falta`, cuando se aplica, entonces no cambia ninguna cuenta y ambas partes ven la decisión.
- **CA-010-32:** Dado un grupo que se cierra, o un titular baneado, con solicitudes activas, cuando ocurre, entonces las solicitudes pasan a `rechazada` por el sistema.
- **CA-010-33:** Dado un titular con una solicitud en `esperando_pago` o `pago_informado`, cuando intenta transferir la titularidad, entonces recibe error.
- **CA-010-34:** Dado un usuario suspendido o baneado, cuando intenta abrir una solicitud, entonces se rechaza; y sus solicitudes activas pasan a `cancelada`.
- **CA-010-35:** Dada cualquier solicitud, cuando se consulta su línea de tiempo, entonces cada evento muestra tipo, autor y fecha, y no hay operación para modificarlo.
- **CA-010-36:** Flujo feliz de punta a punta: dado un grupo con cupo, cuando una persona abre la solicitud con el código, el titular envía los datos de pago, la persona sube el comprobante y el titular confirma, entonces es miembro, su cobro de ingreso figura `pagado` en el historial del grupo y en el siguiente corte recibe su cobro regular.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] El ingreso se cobra antes de unir a la persona y funciona con solicitud, chat y confirmación del titular. Entra en el MVP.
- [RESUELTO 2026-10-17] Monto de ingreso: la cuota del mes del servicio dividida entre los miembros del grupo (RN-010-01).
- [RESUELTO 2026-10-17] Plazos: 15 minutos para que el solicitante pague y entre 30 y 60 minutos para que el titular confirme (RF-010-17).
- [RESUELTO 2026-10-17] El chat admite texto y fotos (RF-010-05).
- [RESUELTO 2026-10-17] Por ahora hay un único tipo de reclamo (RF-010-21).
- [RESUELTO 2026-10-17] Los meses siguientes no se pagan por adelantado: se mantienen los cobros de la spec 002.
- [RESUELTO 2026-10-17] La sanción para un titular que estafa es el baneo de la cuenta, sin posibilidad de crear otra con los mismos datos (RF-010-24 y spec 009).
- [NECESITA ACLARACIÓN] **Período en curso** (RN-010-03). El pago de ingreso cubre el período del último corte. **Propuesta:** en un grupo nuevo, la fecha de creación cuenta como corte inicial. Quien ingresa pocos días antes del siguiente corte paga dos veces en pocos días; la propuesta es aceptarlo, avisarlo antes de pagar, y evaluar que si faltan 5 días o menos el pago de ingreso cubra el período siguiente.
- [NECESITA ACLARACIÓN] **Quién puede ser titular** y cómo arranca el sistema sin titulares con historial. Está descrito en la spec 001 (RF-001-21) porque condiciona la creación del grupo.
- [NECESITA ACLARACIÓN] **Identidad del baneado.** Qué datos se bloquean (spec 009, RF-009-19 y spec 003, RF-003-19) y qué tan fuerte puede ser el bloqueo.
- [NECESITA ACLARACIÓN] **Baneo directo o con confirmación.** **Propuesta:** el baneo lo decide un administrador al resolver el reclamo (RN-010-08), no el reclamo por sí solo, para que una acusación falsa no destruya una cuenta.
- [NECESITA ACLARACIÓN] **Vencimiento de la solicitud `abierta`.** **Propuesta:** 24 horas sin que el titular envíe los datos de pago (RN-010-05).
- [NECESITA ACLARACIÓN] **Plazo del reclamo.** **Propuesta:** 7 días desde el estado final (RF-010-21).
- [NECESITA ACLARACIÓN] **Prórroga del plazo de pago.** Si el banco demora, ¿puede el titular extenderlo una vez? **Propuesta:** sí, una vez y por 15 minutos.
- [NECESITA ACLARACIÓN] **Referencia obligatoria y única** en el comprobante de ingreso, para evitar comprobantes reutilizados. **Propuesta:** obligatoria y única por grupo, y decidirlo junto con la misma regla para los cobros de la spec 002.
- [NECESITA ACLARACIÓN] **Comprobante falso del solicitante.** ¿Puede el titular abrir un reclamo contra quien presentó un comprobante falso? **Propuesta:** por ahora no; el titular rechaza y el chat queda como evidencia.
- [NECESITA ACLARACIÓN] **Retención del chat y de los comprobantes.** **Propuesta:** 12 meses desde el estado final, igual que los comprobantes de la spec 002.
- [NECESITA ACLARACIÓN] **Grupos de un titular baneado.** **Propuesta:** el grupo pasa a solo lectura, los miembros reciben un aviso y los cobros abiertos se cancelan con el motivo "titular baneado" (spec 009).

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador a partir de la decisión del equipo de cobrar el ingreso antes de unir a la persona, con chat por solicitud | Equipo |
