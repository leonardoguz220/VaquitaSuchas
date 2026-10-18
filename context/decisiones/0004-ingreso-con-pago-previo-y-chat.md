# 0004. Ingreso al grupo con pago previo y chat por solicitud

- **Fecha:** 2026-10-17
- **Estado:** aceptada el 2026-10-17 (decisión del equipo); falta la revisión por capa de las specs
- **Capas:** todas

## Contexto

El diseño inicial dejaba que quien tenía el código de invitación se uniera al grupo de inmediato y pagara recién en el siguiente cobro. Así el titular quedaba expuesto desde el primer día: la persona usaba la cuenta compartida sin haber pagado y el titular, que ya había pagado la plataforma, cubría esa cuota.

Al revisar cómo proteger al titular, el equipo evaluó opciones como cobrar con anticipación, limitar la deuda a una cuota, exigir prepago según la reputación o pedir una garantía. Después decidió resolver el problema de raíz con un modelo parecido al de las operaciones entre pares: la persona que quiere un cupo se comunica con el titular por un chat, el titular le envía su QR, y cuando comprueba que el pago llegó, la agrega al grupo.

## Decisión

- El código de invitación abre una **solicitud de ingreso** y no une a la persona. La persona es miembro solo cuando el titular confirma su pago.
- Nadie entra a mitad de un período de cobro: solo se puede abrir una solicitud durante la **ventana de ingreso**, los 3 primeros días de cada período. Así quien entra paga el período que acaba de empezar y no hay doble pago cerca del corte.
- Cada solicitud tiene un **chat propio** entre el solicitante y el titular, con texto y fotos. Los mensajes no se editan ni se borran y quedan como evidencia.
- El titular envía los datos de pago y el sistema fija la cuota de ingreso: el precio del mes dividido entre los miembros que tendrá el grupo con la persona incluida. El solicitante tiene 15 minutos para pagar y subir el comprobante (con una referencia obligatoria y única por grupo), y el titular 60 minutos para confirmar, con un recordatorio a los 30. El titular puede prorrogar el plazo de pago una vez, por 15 minutos.
- Al confirmar, el pago de ingreso queda registrado como el cobro del período que acaba de empezar del nuevo miembro, en estado `pagado`. Desde el siguiente corte se aplican los cobros mensuales de siempre. No se pagan por adelantado los meses siguientes.
- Un miembro que no paga su cobro dentro de los 3 días siguientes al corte es **retirado del grupo automáticamente**. Su cobro queda `atrasado` como deuda visible y no puede volver a ese grupo hasta saldarla. La pérdida máxima del titular es una cuota.
- Hay dos tipos de reclamo y cualquiera de las partes puede abrir el suyo, con una imagen de evidencia opcional: el solicitante que pagó y no fue agregado, y el titular que recibió un comprobante falso. Un administrador (por ahora, el equipo del proyecto) revisa la evidencia. Si confirma la estafa, se banea la cuenta de la persona acusada, sea titular o solicitante, y su correo, su celular y su cédula quedan bloqueados para nuevos registros (ADR 0005).
- Solo puede crear suscripciones un titular habilitado: quien tiene 4,5 estrellas o más con al menos 6 cobros considerados, o quien un administrador habilitó manualmente. Un titular puede tener hasta 5 grupos activos.
- El chat, las solicitudes y los comprobantes se conservan 2 meses.
- Esto entra en el MVP como la spec 010.

## Alternativas consideradas

- **Mantener el ingreso directo y proteger al titular con otras medidas** (cobro anticipado, tope de deuda, prepago según reputación, garantía de un mes). Cambiaba menos las specs, pero dejaba expuesto el primer pago, que es el de mayor riesgo con personas desconocidas.
- **Un enlace a WhatsApp en lugar de un chat propio.** No cuesta nada, pero la conversación quedaría fuera de la app y no serviría como evidencia en un reclamo.
- **Una plataforma que custodie el dinero hasta que ambas partes cumplan.** Es lo que protege al comprador en una operación entre pares, pero obligaría a manejar dinero, algo que el proyecto deja fuera de su alcance.

## Consecuencias

- Hay una spec nueva (010) y cambian las specs 001, 002, 003, 005, 007, 008 y 009. El chat deja de estar fuera del alcance, pero solo como chat por solicitud: el chat de grupo sigue fuera.
- La calificación básica de la spec 007 se construye junto con el MVP, porque habilita a los titulares. Las insignias y el ranking siguen en P2.
- Los plazos de 15 y 60 minutos se evalúan al consultar o actuar y no solo con tareas programadas, porque el servicio gratuito de Render se duerme tras 15 minutos sin tráfico.
- La protección tiene límites. Vaquita no custodia dinero, así que un solicitante que paga queda expuesto al titular y solo cuenta con la evidencia, el reclamo y el baneo. El baneo bloquea correo, celular, cédula y cuenta de Telegram, lo que lo hace más difícil de evadir pero no imposible. Los meses siguientes siguen siendo cobros con 3 días de gracia, y el retiro automático limita la pérdida del titular a una cuota.
- Los puntos que quedaban abiertos (cómo se cuentan los "3 primeros días", la ventana de un grupo nuevo y el regreso de un miembro retirado con deuda) se cerraron el 2026-10-18 y están en las specs 001, 002 y 010.
