# Cómo funciona Vaquita

- **Estado:** borrador para revisión del equipo
- **Fuente:** las once specs de [`specs/`](../specs/00-roadmap.md). Este documento resume el sistema completo; ante cualquier diferencia manda la spec.

Vaquita resuelve un problema concreto: una persona paga una suscripción compartida y después tiene que acordarse de quién le debe cuánto, convertir dólares a bolivianos y perseguir a cada uno por su pago. La aplicación calcula la cuota de cada miembro, genera el cobro de cada mes, recibe los comprobantes, deja que el titular los confirme y conserva el historial para todo el grupo. El ingreso de cada persona se cobra antes de unirla al grupo, mediante una solicitud con chat entre ella y el titular.

## 1. Quiénes usan el sistema

| Actor | Qué hace |
|---|---|
| Visitante | Se registra o inicia sesión |
| Usuario | Persona con cuenta. Puede ser titular en unos grupos y miembro en otros |
| Solicitante | Usuario que abrió una solicitud de ingreso con un código. Todavía no es miembro |
| Titular | Crea la suscripción (si está habilitado), invita, confirma ingresos y pagos y gestiona el grupo. Hay exactamente uno por grupo y no tiene cobro propio |
| Miembro | Ve su cuota, paga, sube comprobantes y ve el estado y el historial del grupo |
| Administrador | Mantiene el catálogo, suspende o banea cuentas, resuelve reclamos, habilita titulares, modera publicaciones y ve estadísticas generales |
| Sistema | Tareas programadas que generan cobros, marcan atrasos, envían avisos y recalculan la reputación |

## 2. Recorrido de un grupo

1. Una persona se registra con nombre, correo, celular, cédula de identidad (CI) y contraseña (spec 003). Verifica su celular con un código de 6 dígitos y recién entonces queda con la sesión iniciada.
2. Si está habilitado como titular, crea una suscripción (spec 001). Está habilitado quien tiene una muy buena calificación de puntualidad (spec 007) o quien un administrador habilitó. Elige un servicio y plan del catálogo (spec 004) o escribe un servicio propio, e indica el precio, la moneda (USD o Bs), el tipo de cambio si el precio está en dólares, el día de cobro y los cupos totales. El sistema le genera un código de invitación de 8 caracteres.
3. Comparte el código, por correo o por un mensaje de WhatsApp prellenado (spec 005). Nadie entra a mitad de un período: solo se puede abrir una solicitud durante los 3 primeros días de cada período de cobro, contando el día de corte como día 1 (la ventana de ingreso, spec 001, RF-001-22). Cada invitado se registra o inicia sesión y, con el código, abre una solicitud de ingreso (spec 010) dentro de esa ventana y mientras haya un cupo disponible. El código no une a nadie por sí solo.
4. En el chat de la solicitud, el titular le envía sus datos de pago (por ejemplo su QR). El sistema fija la cuota de ingreso: el precio del mes dividido entre los miembros que tendrá el grupo con la persona incluida. La persona tiene 15 minutos para pagar fuera de la app y subir el comprobante con la referencia de la transacción, que es obligatoria y no puede repetirse en el grupo. El titular puede prorrogar ese plazo una vez, por 15 minutos.
5. El titular verifica en su banco que el dinero llegó y confirma. Tiene 60 minutos, con un recordatorio a los 30. Solo entonces la persona es miembro, y su pago queda como su cobro del período que acaba de empezar. Si el titular no responde, la solicitud expira y quien pagó puede abrir un reclamo.
6. Cada vez que cambia el número de miembros, el precio o el tipo de cambio, el sistema recalcula la cuota y cada miembro ve su monto estimado en Bs con el desglose.
7. En la fecha de corte del mes (spec 002), el sistema genera un cobro para cada miembro, excepto el titular y quien ya pagó ese período al ingresar. Cada cobro vence 3 días después de la fecha de corte. La referencia del comprobante es obligatoria y única por grupo.
8. El miembro paga fuera de la app (QR o transferencia) usando los datos de pago que configuró el titular, y sube el comprobante. El cobro pasa a `en_revision`.
9. El titular revisa el comprobante y lo confirma, con lo que el cobro pasa a `pagado`, o lo rechaza con un motivo, con lo que vuelve a `pendiente` o a `atrasado` y el miembro puede subir otro.
10. Si el vencimiento pasa sin pago, el cobro pasa a `atrasado` y el miembro es **retirado del grupo automáticamente**. Su cobro queda como deuda visible, cuenta como no puntual y no puede volver a ese grupo hasta saldarla. Así la pérdida máxima del titular es una cuota. Un cobro en revisión no retira a nadie.
11. Todo el grupo ve el resumen del mes y el historial. Cada pago puntual suma a la reputación del miembro (spec 007).
12. Si un titular recibe el dinero y no agrega a la persona, ella abre un reclamo; si un solicitante presenta un comprobante falso, el titular lo abre contra él. Cada parte puede adjuntar una imagen de evidencia y la otra puede responder. Un administrador (el equipo del proyecto) revisa el chat, el comprobante y la línea de tiempo, y si confirma la estafa banea la cuenta de quien la cometió y bloquea su correo, su celular y su CI (specs 009 y 003). Si el titular es baneado, su grupo queda en solo lectura con el texto "titular baneado" y la opción de buscar otro grupo.
13. Cuando el titular quiere salir, transfiere la titularidad o cierra el grupo. Un grupo cerrado queda en solo lectura.

## 3. Reglas que atraviesan todo el sistema

### Cálculo de la cuota

El monto se guarda en centavos como entero. La cuota base es el total en Bs dividido entre el número de miembros actuales (no entre los cupos totales), redondeado hacia abajo. Los centavos que sobran se suman a la cuota del titular, de modo que las cuotas siempre suman el total.

Ejemplo: un plan de USD 17,99 con tipo de cambio 6,96 da un total de Bs 125,21 (12.521 centavos). Entre 4 miembros, la cuota base es Bs 31,30 y sobra 1 centavo, así que la cuota del titular es Bs 31,31. Como el titular no tiene cobro propio, esa cuota solo se usa de referencia (por ejemplo, para calcular su ahorro) y los otros tres miembros pagan Bs 31,30 cada uno.

### Copias históricas

Cada cobro guarda una copia del monto, del precio original, de la moneda, del tipo de cambio y del número de miembros usados. La suscripción guarda una copia del servicio y del plan del catálogo. Así, editar la suscripción o el catálogo no cambia lo que ya se cobró.

### Estados de un cobro

```
pendiente  -> en_revision  -> pagado
pendiente  -> atrasado     -> en_revision
en_revision -> pendiente o atrasado   (el titular rechaza)
pendiente o atrasado -> pagado        (pago manual del titular)
pendiente o atrasado -> cancelado     (el titular cancela con motivo)
(nuevo) -> pagado                     (el titular confirma una solicitud de ingreso)
```

`pagado` y `cancelado` son finales. Un cobro `en_revision` nunca se marca atrasado. El cobro de ingreso nace directamente `pagado`. La tabla completa está en la spec 002 (RN-002-01).

### Estados de una solicitud de ingreso

```
abierta        -> esperando_pago   (el titular envía los datos de pago y el sistema reserva un cupo)
esperando_pago -> pago_informado   (el solicitante sube el comprobante dentro de 15 minutos)
pago_informado -> aceptada         (el titular confirma dentro de 60 minutos)
esperando_pago -> aceptada         (el titular registra un pago en efectivo)
cualquier estado activo -> rechazada o cancelada
cualquier estado activo -> expirada (vence el plazo)
```

`aceptada`, `rechazada`, `cancelada` y `expirada` son finales. Una solicitud `abierta` también expira a las 24 horas o cuando termina la ventana de ingreso. Los plazos se evalúan con la hora del servidor al consultar o actuar. La tabla completa está en la spec 010 (RN-010-05).

### Fechas y zona horaria

Las fechas se guardan en UTC y se muestran en America/La_Paz. Si el día de cobro no existe en un mes (por ejemplo el 31 en febrero), se usa el último día de ese mes. Quien entra a un grupo lo hace dentro de los 3 primeros días de un período y paga primero la cuota de ese período; ese pago queda como su cobro y desde el siguiente corte recibe los cobros regulares. Un titular puede tener hasta 5 grupos activos; como miembro no hay límite.

### Privacidad

Cada persona solo ve los grupos a los que pertenece; pedir un recurso de un grupo ajeno responde `404`. Los comprobantes los ven solo el titular y quien los subió. El chat y el comprobante de una solicitud los ven solo el solicitante y el titular; un administrador los ve únicamente cuando hay un reclamo abierto, y cada acceso queda registrado. Entre los miembros se ve el nombre y el celular verificado; el correo y la CI nunca se comparten, y el celular de un solicitante solo se muestra al titular después de aceptado. El chat y los comprobantes de una solicitud se conservan 2 meses. Los permisos se validan siempre en el servidor.

## 4. Qué hace cada módulo

### Usuarios y autenticación (spec 003)

Registro con nombre, correo, contraseña (mínimo 10 caracteres, con letra y número), celular boliviano verificado con un código de 6 dígitos y cédula de identidad, estos dos obligatorios y únicos, y aceptación de una política de datos corta. El inicio de sesión emite un JWT guardado en una cookie httpOnly, con duración de 7 días desde la última actividad. La recuperación de contraseña envía un enlace de un solo uso que vence a los 30 minutos, y la pantalla responde igual exista o no la cuenta. Hay bloqueo temporal tras 5 intentos fallidos en 15 minutos y un límite de 3 pedidos de recuperación por hora. El perfil permite editar nombre y celular (el nuevo celular se verifica) y cambiar la contraseña. Una cuenta baneada no puede iniciar sesión y su correo, su celular y su CI quedan bloqueados para nuevos registros. La CI se guarda cifrada, nunca se muestra a otros usuarios y el administrador la ve enmascarada.

### Catálogo de servicios (spec 004)

Servicios (Netflix, Spotify, Disney+, YouTube Premium, Max, Prime Video y otros) con sus planes, cada uno con precio de referencia, moneda, cupos máximos y, opcionalmente, el precio individual que se usa para calcular el ahorro. Se puede listar, filtrar por categoría y buscar por nombre. El seed inicial lo carga y los servicios inactivos nunca se borran. Si un servicio no está, el titular crea una suscripción personalizada con nombre libre.

### Suscripciones compartidas (spec 001)

Creación (solo para titulares habilitados, hasta 5 grupos activos por titular), código de invitación (regenerable) que abre una solicitud de ingreso dentro de la ventana de ingreso de 3 días, y opción de pausar el ingreso de nuevos miembros. Un miembro que no paga a los 3 días del corte es retirado automáticamente. El titular edita nombre, precio, tipo de cambio, día de cobro y cupos (sin bajar de los miembros actuales), quita miembros, transfiere la titularidad o cierra el grupo. Un miembro puede abandonar el grupo si no tiene cobros abiertos o si el titular los cancela. El titular configura sus datos de pago: un texto (hasta 500 caracteres) y una imagen de QR (JPG o PNG, hasta 2 MB). Cada usuario ve la lista de sus grupos con su rol, su cuota y su estado.

### Cobros y pagos (spec 002)

Generación automática e idempotente de los cobros del mes, con un ciclo del grupo que guarda el total, el tipo de cambio y las cuotas. Subida de comprobantes (JPG, PNG o PDF de hasta 5 MB) con método y referencia obligatoria y única por grupo, y reemplazo mientras esté en revisión. El titular confirma, rechaza (motivo de 5 a 200 caracteres), registra pagos en efectivo o cancela. Cada cobro lleva una línea de tiempo de eventos. Quien fue retirado por falta de pago puede pagar su deuda pero no vuelve al grupo. Los miembros ven el resumen del mes y el historial del grupo sin ver los comprobantes de otros, y el titular ve el total esperado, cobrado, pendiente y atrasado.

### Solicitudes de ingreso y chat (spec 010)

Quien ingresa un código dentro de la ventana de ingreso abre una solicitud (una por grupo y hasta 5 activas por usuario) con un chat privado entre ella y el titular, que admite texto de hasta 1.000 caracteres e imágenes JPG o PNG de hasta 5 MB. Los mensajes no se editan ni se borran y el chat queda en solo lectura al terminar la solicitud. El titular envía los datos de pago y el sistema fija la cuota de ingreso y reserva un cupo. El solicitante tiene 15 minutos para subir el comprobante y el titular 60 para decidir; el titular también puede prorrogar el plazo de pago una vez, registrar un pago en efectivo o rechazar con motivo. Al confirmar, la persona se une y se registra su cobro del período como `pagado`. Cualquiera de las partes puede reclamar dentro de 7 días: el solicitante que pagó y no ingresó, o el titular que recibió un comprobante falso. Un administrador revisa la evidencia y lo resuelve como estafa confirmada, con baneo de la persona acusada, o sin falta. Vaquita no custodia el dinero ni lo devuelve.

### Notificaciones (spec 005)

Centro de notificaciones dentro de la app, siempre activo, y correos que cada usuario puede desactivar por tipo (los de seguridad no se desactivan). Para el miembro: aviso 2 días antes de la fecha de corte, cobro generado, recordatorio un día antes del vencimiento, retiro por falta de pago y resolución de sus pagos. Para el titular: comprobante recibido, recordatorio si lleva más de 48 horas en revisión, ingreso o salida de miembros y retiros por falta de pago. Opcionalmente, avisos por Telegram vinculando la cuenta con un enlace de un solo uso. Invitaciones por correo y por WhatsApp (enlace `wa.me` que abre el mensaje, sin envío desde el servidor, dirigido al celular verificado del miembro). Los correos fallidos se reintentan hasta 3 veces y las notificaciones se conservan 90 días.

### Panel y reportes (spec 006)

Resumen por mes con el gasto propio, el ahorro estimado, lo que el usuario debe, y, para el titular, lo que le deben y la cobranza por grupo. Tres gráficos (gasto de los últimos 12 meses, gasto por servicio y ahorro acumulado), cada uno con alternativa en tabla. Calendario con fechas de corte y vencimientos, historial con filtros y exportación a CSV, además del historial completo del grupo para el titular.

### Reputación (spec 007)

Calificación de puntualidad de 0 a 5 estrellas, en pasos de media estrella: 5 por la proporción de cobros puntuales sobre cobros considerados en los últimos 12 meses. Un cobro es puntual si el miembro subió su comprobante antes del vencimiento, aunque el titular lo rechace después. Con menos de 3 cobros el nivel es "Nuevo"; quien fue retirado por mora conserva su cobro como no puntual; luego Excelente (5 estrellas), Bueno (4 a 4,5), Regular (3 a 3,5) o En riesgo (2,5 o menos). Incluye insignias (primer pago, rachas de 3, 6 y 12 pagos puntuales, seis meses sin atrasos y otras), un ranking dentro del grupo sin montos ni comprobantes y la posibilidad de reportar un cobro mal calificado para que el titular lo revise. La calificación básica se construye junto con el MVP porque habilita a los titulares, y los cobros de ingreso no cuentan para ella.

### Cupos libres (spec 008)

El titular publica los cupos que le sobran, con descripción y condiciones, y la publicación muestra la cuota estimada por persona. Cada grupo tiene una publicación activa, que expira a los 30 días. Los usuarios la buscan con filtros por servicio, categoría y cuota, y abren una solicitud de ingreso con un mensaje inicial (spec 010; máximo 5 activas por usuario), solo durante la ventana de ingreso, que la publicación muestra. Al ser aceptado en un grupo, se cancelan las otras solicitudes abiertas al mismo servicio. El titular ve el nivel de puntualidad y la calificación del solicitante, y el ingreso sigue el flujo de pago previo y confirmación. Cualquier usuario puede reportar una publicación y, con 3 reportes de personas distintas, se oculta hasta que un administrador la revise.

### Administración (spec 009)

Solo para el rol `admin`, creado con el seed o por otro administrador. Gestiona el catálogo (crear, editar, activar y desactivar, sin borrado físico), busca usuarios y los suspende o reactiva con un motivo obligatorio de 10 a 300 caracteres, banea cuentas de forma permanente (titulares o solicitantes; otro administrador puede revisar un baneo), resuelve los reclamos de ingreso con su evidencia, habilita manualmente a los primeros titulares, modera las publicaciones reportadas y ve un tablero de estadísticas agregadas, sin acceso a comprobantes ni a cobros individuales fuera de un reclamo abierto. Todas las acciones quedan en un log de auditoría que no se puede editar ni borrar. Siempre debe existir al menos un administrador activo.

### Setup del proyecto (spec 000)

Repositorio con las tres capas, `docker-compose` con PostgreSQL y una bandeja de correo de desarrollo, migraciones y seed con `npm run db:migrate`, `db:seed` y `db:reset`, validación de variables de entorno, `GET /health`, Swagger en `/api/docs`, formato uniforme de errores, servicio de correo y de mensajería al celular con modos `dev` y `prod`, módulo de tareas programadas, proxy `/api` del frontend, formato de Bs y fechas, CI con GitHub Actions y un entorno desplegado de punta a punta para el profesor.

## 5. Procesos automáticos

| Proceso | Cuándo | Qué hace |
|---|---|---|
| Generación de cobros | Fecha de corte de cada grupo, 00:00 de La Paz | Crea los cobros del mes y el ciclo del grupo |
| Marca de atrasos y retiro | Al pasar el vencimiento (corte + 3 días) | Pasa a `atrasado` los cobros `pendiente` y retira al miembro del grupo |
| Plazos de solicitudes | Cada minuto y al consultar o actuar | Pasa a `expirada` las solicitudes cuyo plazo venció o cuya ventana de ingreso terminó, libera sus cupos y envía el recordatorio de 30 minutos al titular |
| Limpieza de solicitudes | Diario | Elimina el chat, las imágenes y los comprobantes de solicitudes con más de 2 meses, salvo reclamos abiertos |
| Avisos programados | Diario, 08:00 de La Paz | Aviso previo, recordatorio de vencimiento y revisión pendiente |
| Envío de correos y Telegram | Cada 5 minutos | Envía los correos y mensajes pendientes y reintenta los fallidos |
| Reconciliación de reputación | Diario | Verifica y corrige calificaciones |
| Vencimientos | Diario | Expira publicaciones (30 días) y notificaciones (90 días) |

Todos los procesos son idempotentes y calculan lo que falta según los datos, de modo que se pueden ejecutar dos veces o con retraso (por ejemplo, tras un reinicio del servidor) sin duplicar cobros ni avisos. Los plazos de las solicitudes se evalúan además en el momento de consultar o actuar, para que sean correctos aunque el servicio haya estado dormido.

## 6. Qué ve y qué puede hacer cada rol

| Acción | Miembro | Titular | Administrador |
|---|---|---|---|
| Ver su cuota y sus cobros | Sí | Cuota de referencia | No aplica |
| Subir comprobante | Sí | No | No |
| Confirmar, rechazar o cancelar un cobro | No | Sí | No |
| Registrar un pago en efectivo | No | Sí | No |
| Ver el resumen del mes y el historial del grupo | Sí, sin comprobantes ajenos | Sí | No |
| Ver comprobantes | Solo los suyos | Los de su grupo | Nunca, salvo la evidencia de un reclamo abierto |
| Abrir una solicitud de ingreso y escribir en su chat | Solo como solicitante, antes de ser miembro | Sí, como contraparte | No |
| Confirmar, rechazar o registrar en efectivo un ingreso | No | Sí | No |
| Abrir un reclamo | Solo quien pagó y no ingresó | Sí, contra un comprobante falso | Resuelve el reclamo y puede banear |
| Crear una suscripción | Solo si está habilitado | Solo si está habilitado | Habilita titulares |
| Invitar, quitar miembros, transferir o cerrar el grupo | No | Sí | No |
| Publicar cupos y aceptar solicitudes | No | Sí | Modera publicaciones reportadas |
| Gestionar catálogo y usuarios | No | No | Sí |

## 7. Conceptos de datos

Las entidades que se desprenden de las specs son: usuario, servicio y plan del catálogo, suscripción (grupo), membresía, ciclo de cobro, cobro, comprobante, evento del cobro, notificación y sus preferencias, publicación de cupos, solicitud de ingreso, mensaje del chat, reclamo, reporte, insignia, bloqueo de identidad y log de auditoría. El modelo concreto (tablas, columnas y restricciones) lo define Camila en el `plan.md` de cada feature, y se congela al aprobarlo.

## 8. Puntos abiertos para la revisión del equipo

### Decisiones tomadas el 2026-10-17

Las respuestas del equipo ya están en las specs. Las principales:

| Tema | Decisión | Dónde |
|---|---|---|
| Ingreso | Solo durante los 3 primeros días del período de cobro | Spec 001, RF-001-22 |
| Mora | A los 3 días del corte sin pago, el miembro es retirado y su cobro queda como deuda | Spec 002, RF-002-14 |
| Titular | 4,5 estrellas con 6 cobros considerados, o habilitado por un administrador; hasta 5 grupos activos | Spec 001, RF-001-21 y RN-001-14 |
| Identidad | Celular verificado con código y CI, obligatorios y únicos; el baneo bloquea correo, celular y CI | Spec 003, ADR 0005 |
| Reclamos | Los puede abrir el solicitante y el titular, con una imagen de evidencia opcional | Spec 010, RF-010-21 |
| Prórroga | El titular puede extender una vez el plazo de pago por 15 minutos | Spec 010, RF-010-28 |
| Referencia | Obligatoria y única por grupo en cada comprobante | Specs 002 y 010 |
| Conservación | 2 meses para el chat, las solicitudes y los comprobantes tras cerrar el grupo | Specs 002 y 010 |
| Baneo | Lo decide un administrador (el equipo); otro puede revisarlo; la apelación es por un correo de contacto | Spec 009 |
| Grupo con titular baneado | Se muestra "titular baneado" y la opción de buscar otro grupo | Spec 009, RF-009-22 |
| Notificaciones | App y correo; Telegram opcional en P1; sin recordatorios de atraso | Spec 005 |
| Correo y secretos | Resend en producción, gitleaks en CI | Spec 000 |
| Carga | Menos de 100 usuarios en la demo | Spec 000, RNF-000-05 |
| Documentación | Solo documentos, sin diagramas | Banco de preguntas, P8 |

### Puntos que siguen abiertos

| Spec | Pregunta | Propuesta actual |
|---|---|---|
| 000 | Cómo cubrir los límites del plan gratuito de Render | Ver el riesgo descrito más abajo |
| 000 y 003 | Canal y costo del código de celular (SMS o WhatsApp) | Un proveedor de SMS con tope diario, decidido en el plan de la spec 000 |
| 003 | Formato de la CI y si se revisa una foto | Solo el número, sin foto |
| 003 | Alias de correo (Gmail) | Calcular el bloqueo sobre el correo sin alias |
| 001 y 010 | Qué son los "3 primeros días" y cómo funciona la ventana de un grupo nuevo | Desde el corte de cada grupo, con el día de corte como día 1; un grupo nuevo tiene una ventana inicial desde su creación |
| 002 y 010 | Un miembro retirado con deuda y el regreso al grupo | Puede pagar su deuda, pero no abrir una solicitud a ese grupo hasta saldarla |
| 009 | Cobros abiertos de un grupo con titular baneado | Congelarlos y excluirlos de la calificación, en lugar de cancelarlos |
| 009 | Transferencia por un administrador con el titular suspendido | A pedido de los miembros y hacia un miembro habilitado |

### Límites de la protección

Vaquita no custodia dinero, así que no puede garantizar que alguien recupere lo que pagó. Lo que ofrece al solicitante son plazos cortos, la evidencia del chat y del comprobante, un reclamo que revisa un administrador y el baneo del titular que estafe. Ese baneo bloquea el correo, el celular verificado y la CI, lo que lo hace más difícil de evadir, pero una persona todavía puede conseguir datos nuevos. Al titular lo protege que nadie ingrese sin pagar, pero los meses siguientes siguen siendo cobros con 3 días de gracia, pero un miembro que deja de pagar después de entrar es retirado a los 3 días del corte, de modo que la pérdida máxima del titular es una cuota, que queda registrada como deuda del miembro.

### Riesgo del despliegue en Render

Según la documentación de Render, la base de datos gratuita caduca a los 30 días de crearse (con 14 días de gracia antes de borrarse), tiene 1 GB, no tiene copias de seguridad y no incluye pool de conexiones. El servicio web gratuito se duerme tras 15 minutos sin tráfico y permite 750 horas al mes. Como la generación de cobros, los atrasos y los avisos dependen de tareas programadas, un servicio dormido no las ejecutaría. Los plazos de minutos de las solicitudes de ingreso (15 y 60 minutos) se evalúan al consultar o actuar para no depender de ellas. El plan de la spec 000 tiene que decidir entre una instancia de pago, recrear la base cerca de la fecha de la demo con `db:reset` y el seed, o un disparador externo que despierte el servicio.

## 9. Cómo comentar este documento

Los comentarios, dudas y cambios se abren como issue o como PR en el repositorio, indicando la sección y la spec afectada. Los cambios de reglas se hacen primero en la spec correspondiente y después aquí.
