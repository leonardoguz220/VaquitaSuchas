# Cómo funciona Vaquita

- **Estado:** borrador para revisión del equipo
- **Fuente:** las diez specs de [`specs/`](../specs/00-roadmap.md). Este documento resume el sistema completo; ante cualquier diferencia manda la spec.

Vaquita resuelve un problema concreto: una persona paga una suscripción compartida y después tiene que acordarse de quién le debe cuánto, convertir dólares a bolivianos y perseguir a cada uno por su pago. La aplicación calcula la cuota de cada miembro, genera el cobro de cada mes, recibe los comprobantes, deja que el titular los confirme y conserva el historial para todo el grupo.

## 1. Quiénes usan el sistema

| Actor | Qué hace |
|---|---|
| Visitante | Se registra o inicia sesión |
| Usuario | Persona con cuenta. Puede ser titular en unos grupos y miembro en otros |
| Titular | Crea la suscripción, invita, confirma pagos y gestiona el grupo. Hay exactamente uno por grupo y no tiene cobro propio |
| Miembro | Ve su cuota, paga, sube comprobantes y ve el estado y el historial del grupo |
| Administrador | Mantiene el catálogo, suspende cuentas, modera publicaciones y ve estadísticas generales |
| Sistema | Tareas programadas que generan cobros, marcan atrasos, envían avisos y recalculan la reputación |

## 2. Recorrido de un grupo

1. Una persona se registra con correo y contraseña (spec 003) y queda con la sesión iniciada.
2. Crea una suscripción como titular (spec 001). Elige un servicio y plan del catálogo (spec 004) o escribe un servicio propio, e indica el precio, la moneda (USD o Bs), el tipo de cambio si el precio está en dólares, el día de cobro y los cupos totales. El sistema le genera un código de invitación de 8 caracteres.
3. Comparte el código, por correo o por un mensaje de WhatsApp prellenado (spec 005). Cada invitado se registra o inicia sesión y se une con el código mientras haya cupos libres.
4. Cada vez que cambia el número de miembros, el precio o el tipo de cambio, el sistema recalcula la cuota y cada miembro ve su monto estimado en Bs con el desglose.
5. En la fecha de corte del mes (spec 002), el sistema genera un cobro para cada miembro, excepto el titular. Cada cobro vence 3 días después de la fecha de corte.
6. El miembro paga fuera de la app (QR o transferencia) usando los datos de pago que configuró el titular, y sube el comprobante. El cobro pasa a `en_revision`.
7. El titular revisa el comprobante y lo confirma, con lo que el cobro pasa a `pagado`, o lo rechaza con un motivo, con lo que vuelve a `pendiente` o a `atrasado` y el miembro puede subir otro.
8. Si el vencimiento pasa sin pago, el cobro pasa a `atrasado` y el sistema recuerda al miembro cada 3 días, hasta 3 veces.
9. Todo el grupo ve el resumen del mes y el historial. Cada pago puntual suma a la reputación del miembro (spec 007).
10. Cuando el titular quiere salir, transfiere la titularidad o cierra el grupo. Un grupo cerrado queda en solo lectura.

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
```

`pagado` y `cancelado` son finales. Un cobro `en_revision` nunca se marca atrasado. La tabla completa está en la spec 002 (RN-002-01).

### Fechas y zona horaria

Las fechas se guardan en UTC y se muestran en America/La_Paz. Si el día de cobro no existe en un mes (por ejemplo el 31 en febrero), se usa el último día de ese mes. Quien entra a un grupo después de generado el cobro del mes empieza a pagar desde el cobro siguiente.

### Privacidad

Cada persona solo ve los grupos a los que pertenece; pedir un recurso de un grupo ajeno responde `404`. Los comprobantes los ven solo el titular y quien los subió. Entre los miembros se ve el nombre, y el celular solo si lo ingresaron; el correo nunca se comparte. Los permisos se validan siempre en el servidor.

## 4. Qué hace cada módulo

### Usuarios y autenticación (spec 003)

Registro con nombre, correo, contraseña (mínimo 10 caracteres, con letra y número) y celular opcional boliviano. El inicio de sesión emite un JWT guardado en una cookie httpOnly, con duración de 7 días desde la última actividad. La recuperación de contraseña envía un enlace de un solo uso que vence a los 30 minutos, y la pantalla responde igual exista o no la cuenta. Hay bloqueo temporal tras 5 intentos fallidos en 15 minutos y un límite de 3 pedidos de recuperación por hora. El perfil permite editar nombre y celular y cambiar la contraseña.

### Catálogo de servicios (spec 004)

Servicios (Netflix, Spotify, Disney+, YouTube Premium, Max, Prime Video y otros) con sus planes, cada uno con precio de referencia, moneda, cupos máximos y, opcionalmente, el precio individual que se usa para calcular el ahorro. Se puede listar, filtrar por categoría y buscar por nombre. El seed inicial lo carga y los servicios inactivos nunca se borran. Si un servicio no está, el titular crea una suscripción personalizada con nombre libre.

### Suscripciones compartidas (spec 001)

Creación, código de invitación (regenerable) y opción de pausar el ingreso de nuevos miembros. El titular edita nombre, precio, tipo de cambio, día de cobro y cupos (sin bajar de los miembros actuales), quita miembros, transfiere la titularidad o cierra el grupo. Un miembro puede abandonar el grupo si no tiene cobros abiertos o si el titular los cancela. El titular configura sus datos de pago: un texto (hasta 500 caracteres) y una imagen de QR (JPG o PNG, hasta 2 MB). Cada usuario ve la lista de sus grupos con su rol, su cuota y su estado.

### Cobros y pagos (spec 002)

Generación automática e idempotente de los cobros del mes, con un ciclo del grupo que guarda el total, el tipo de cambio y las cuotas. Subida de comprobantes (JPG, PNG o PDF de hasta 5 MB) con método y referencia opcionales, y reemplazo mientras esté en revisión. El titular confirma, rechaza (motivo de 5 a 200 caracteres), registra pagos en efectivo o cancela. Cada cobro lleva una línea de tiempo de eventos. Los miembros ven el resumen del mes y el historial del grupo sin ver los comprobantes de otros, y el titular ve el total esperado, cobrado, pendiente y atrasado.

### Notificaciones (spec 005)

Centro de notificaciones dentro de la app, siempre activo, y correos que cada usuario puede desactivar por tipo (los de seguridad no se desactivan). Para el miembro: aviso 2 días antes de la fecha de corte, cobro generado, recordatorio un día antes del vencimiento, atrasos y resolución de sus pagos. Para el titular: comprobante recibido, recordatorio si lleva más de 48 horas en revisión, ingreso o salida de miembros y atrasos. Invitaciones por correo y por WhatsApp (enlace `wa.me` que abre el mensaje, sin envío desde el servidor). Los correos fallidos se reintentan hasta 3 veces y las notificaciones se conservan 90 días.

### Panel y reportes (spec 006)

Resumen por mes con el gasto propio, el ahorro estimado, lo que el usuario debe, y, para el titular, lo que le deben y la cobranza por grupo. Tres gráficos (gasto de los últimos 12 meses, gasto por servicio y ahorro acumulado), cada uno con alternativa en tabla. Calendario con fechas de corte y vencimientos, historial con filtros y exportación a CSV, además del historial completo del grupo para el titular.

### Reputación (spec 007)

Calificación de puntualidad de 0 a 5 estrellas, en pasos de media estrella: 5 por la proporción de cobros puntuales sobre cobros considerados en los últimos 12 meses. Un cobro es puntual si el miembro subió su comprobante antes del vencimiento, aunque el titular lo rechace después. Con menos de 3 cobros el nivel es "Nuevo"; luego Excelente (5 estrellas), Bueno (4 a 4,5), Regular (3 a 3,5) o En riesgo (2,5 o menos). Incluye insignias (primer pago, rachas de 3, 6 y 12 pagos puntuales, seis meses sin atrasos y otras), un ranking dentro del grupo sin montos ni comprobantes y la posibilidad de reportar un cobro mal calificado para que el titular lo revise.

### Cupos libres (spec 008)

El titular publica los cupos que le sobran, con descripción y condiciones, y la publicación muestra la cuota estimada por persona. Cada grupo tiene una publicación activa, que expira a los 30 días. Los usuarios la buscan con filtros por servicio, categoría y cuota, y envían una solicitud con un mensaje (máximo 5 pendientes por usuario). El titular ve el nivel de puntualidad del solicitante y acepta o rechaza; al aceptar, la persona se une al grupo con las reglas normales. Las solicitudes pendientes vencen a los 14 días. Cualquier usuario puede reportar una publicación y, con 3 reportes de personas distintas, se oculta hasta que un administrador la revise.

### Administración (spec 009)

Solo para el rol `admin`, creado con el seed o por otro administrador. Gestiona el catálogo (crear, editar, activar y desactivar, sin borrado físico), busca usuarios y los suspende o reactiva con un motivo obligatorio de 10 a 300 caracteres, modera las publicaciones reportadas y ve un tablero de estadísticas agregadas, sin acceso a comprobantes ni a cobros individuales. Todas las acciones quedan en un log de auditoría que no se puede editar ni borrar. Siempre debe existir al menos un administrador activo.

### Setup del proyecto (spec 000)

Repositorio con las tres capas, `docker-compose` con PostgreSQL y una bandeja de correo de desarrollo, migraciones y seed con `npm run db:migrate`, `db:seed` y `db:reset`, validación de variables de entorno, `GET /health`, Swagger en `/api/docs`, formato uniforme de errores, servicio de correo con modos `dev` y `prod`, módulo de tareas programadas, proxy `/api` del frontend, formato de Bs y fechas, CI con GitHub Actions y un entorno desplegado de punta a punta para el profesor.

## 5. Procesos automáticos

| Proceso | Cuándo | Qué hace |
|---|---|---|
| Generación de cobros | Fecha de corte de cada grupo, 00:00 de La Paz | Crea los cobros del mes y el ciclo del grupo |
| Marca de atrasos | Al pasar el vencimiento | Pasa a `atrasado` los cobros `pendiente` |
| Avisos programados | Diario, 08:00 de La Paz | Aviso previo, recordatorio de vencimiento, recordatorios de atraso y revisión pendiente |
| Envío de correos | Cada 5 minutos | Envía los correos pendientes y reintenta los fallidos |
| Reconciliación de reputación | Diario | Verifica y corrige calificaciones |
| Vencimientos | Diario | Expira publicaciones (30 días), solicitudes (14 días) y notificaciones (90 días) |

Todos los procesos son idempotentes y calculan lo que falta según los datos, de modo que se pueden ejecutar dos veces o con retraso (por ejemplo, tras un reinicio del servidor) sin duplicar cobros ni avisos.

## 6. Qué ve y qué puede hacer cada rol

| Acción | Miembro | Titular | Administrador |
|---|---|---|---|
| Ver su cuota y sus cobros | Sí | Cuota de referencia | No aplica |
| Subir comprobante | Sí | No | No |
| Confirmar, rechazar o cancelar un cobro | No | Sí | No |
| Registrar un pago en efectivo | No | Sí | No |
| Ver el resumen del mes y el historial del grupo | Sí, sin comprobantes ajenos | Sí | No |
| Ver comprobantes | Solo los suyos | Los de su grupo | Nunca |
| Invitar, quitar miembros, transferir o cerrar el grupo | No | Sí | No |
| Publicar cupos y aceptar solicitudes | No | Sí | Modera publicaciones reportadas |
| Gestionar catálogo y usuarios | No | No | Sí |

## 7. Conceptos de datos

Las entidades que se desprenden de las specs son: usuario, servicio y plan del catálogo, suscripción (grupo), membresía, ciclo de cobro, cobro, comprobante, evento del cobro, notificación y sus preferencias, publicación de cupos, solicitud, reporte, insignia y log de auditoría. El modelo concreto (tablas, columnas y restricciones) lo define Camila en el `plan.md` de cada feature, y se congela al aprobarlo.

## 8. Puntos abiertos para la revisión del equipo

### Decisiones que dependen del equipo

| Spec | Pregunta | Propuesta actual |
|---|---|---|
| 000 | Servicio de correo en producción | Un proveedor con plan gratuito suficiente (Resend, Brevo o Gmail SMTP) |
| 000 | Cómo cubrir los límites del plan gratuito de Render | Ver el riesgo descrito más abajo |
| 001 | Servicio personalizado fuera del catálogo | Sí, con nombre libre |
| 002 | Comprobantes de un miembro ya quitado | El titular los puede ver |
| 002 | Conservación de comprobantes tras cerrar el grupo | 12 meses |
| 003 | Verificación del correo | No obligatoria en esta etapa |
| 003 | Registro con un correo repetido | Revelar que ya existe, con límite por IP |
| 003 | Eliminar cuenta | Fuera de alcance por ahora |
| 003 | Revocación de sesiones | Versión de sesión por usuario |
| 005 | Frecuencia de avisos | Valores por defecto de la spec, ajustables por configuración |
| 006 | Librería de gráficos | Recharts |
| 007 | Abuso del rechazo para "congelar" la puntualidad | El titular puede marcar un rechazo como comprobante inválido |
| 008 | Quién ve las publicaciones | Solo usuarios con sesión |
| 008 | Titularidad transferida con una publicación activa | La publicación pasa al nuevo titular |
| 009 | Grupo cuyo titular fue suspendido | Los cobros siguen, se avisa a los miembros y se puede transferir la titularidad |
| 009 | Canal de apelación de una suspensión | Un correo de contacto del equipo |
| 009 | Importación masiva del catálogo | Última tarea de la spec |

### Preguntas del banco que siguen sin respuesta

Si la materia pide diagramas o documentos específicos (P8), si una persona puede ser titular de varios grupos y con qué límite (P15), si el titular puede saltar un mes sin cobrar (P17), cuántos usuarios se esperan en la demo (P29), los requisitos de privacidad y borrado de cuenta (P31) y si habrá marca propia con logo y colores (P32). El detalle está en [`specs/00-preguntas-abiertas.md`](../specs/00-preguntas-abiertas.md).

### Riesgo del despliegue en Render

Según la documentación de Render, la base de datos gratuita caduca a los 30 días de crearse (con 14 días de gracia antes de borrarse), tiene 1 GB, no tiene copias de seguridad y no incluye pool de conexiones. El servicio web gratuito se duerme tras 15 minutos sin tráfico y permite 750 horas al mes. Como la generación de cobros, los atrasos y los avisos dependen de tareas programadas, un servicio dormido no las ejecutaría. El plan de la spec 000 tiene que decidir entre una instancia de pago, recrear la base cerca de la fecha de la demo con `db:reset` y el seed, o un disparador externo que despierte el servicio.

## 9. Cómo comentar este documento

Los comentarios, dudas y cambios se abren como issue o como PR en el repositorio, indicando la sección y la spec afectada. Los cambios de reglas se hacen primero en la spec correspondiente y después aquí.
