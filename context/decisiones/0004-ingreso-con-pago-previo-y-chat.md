# 0004. Ingreso al grupo con pago previo y chat por solicitud

- **Fecha:** 2026-10-17
- **Estado:** propuesta, pendiente de revisión por capa
- **Capas:** todas

## Contexto

El diseño inicial dejaba que quien tenía el código de invitación se uniera al grupo de inmediato y pagara recién en el siguiente cobro. Así el titular quedaba expuesto desde el primer día: la persona usaba la cuenta compartida sin haber pagado y el titular, que ya había pagado la plataforma, cubría esa cuota.

Al revisar cómo proteger al titular, el equipo evaluó opciones como cobrar con anticipación, limitar la deuda a una cuota, exigir prepago según la reputación o pedir una garantía. Después decidió resolver el problema de raíz con un modelo parecido al de las operaciones entre pares: la persona que quiere un cupo se comunica con el titular por un chat, el titular le envía su QR, y cuando comprueba que el pago llegó, la agrega al grupo.

## Decisión

- El código de invitación abre una **solicitud de ingreso** y no une a la persona. La persona es miembro solo cuando el titular confirma su pago.
- Cada solicitud tiene un **chat propio** entre el solicitante y el titular, con texto y fotos. Los mensajes no se editan ni se borran y quedan como evidencia.
- El titular envía los datos de pago y el sistema fija la cuota de ingreso: el precio del mes dividido entre los miembros que tendrá el grupo con la persona incluida. El solicitante tiene 15 minutos para pagar y subir el comprobante, y el titular 60 minutos para confirmar, con un recordatorio a los 30.
- Al confirmar, el pago de ingreso queda registrado como el cobro del período en curso del nuevo miembro, en estado `pagado`. Desde el siguiente corte se aplican los cobros mensuales de siempre. No se pagan por adelantado los meses siguientes.
- Hay un único tipo de reclamo: quien pagó y no fue agregado lo abre, y un administrador revisa la evidencia. Si confirma la estafa, la cuenta del titular se banea de forma permanente y su correo y su celular quedan bloqueados para nuevos registros.
- Solo puede crear suscripciones un titular habilitado: quien tiene una muy buena calificación de puntualidad o quien un administrador habilitó manualmente.
- Esto entra en el MVP como la spec 010.

## Alternativas consideradas

- **Mantener el ingreso directo y proteger al titular con otras medidas** (cobro anticipado, tope de deuda, prepago según reputación, garantía de un mes). Cambiaba menos las specs, pero dejaba expuesto el primer pago, que es el de mayor riesgo con personas desconocidas.
- **Un enlace a WhatsApp en lugar de un chat propio.** No cuesta nada, pero la conversación quedaría fuera de la app y no serviría como evidencia en un reclamo.
- **Una plataforma que custodie el dinero hasta que ambas partes cumplan.** Es lo que protege al comprador en una operación entre pares, pero obligaría a manejar dinero, algo que el proyecto deja fuera de su alcance.

## Consecuencias

- Hay una spec nueva (010) y cambian las specs 001, 002, 003, 005, 007, 008 y 009. El chat deja de estar fuera del alcance, pero solo como chat por solicitud: el chat de grupo sigue fuera.
- La calificación básica de la spec 007 se construye junto con el MVP, porque habilita a los titulares. Las insignias y el ranking siguen en P2.
- Los plazos de 15 y 60 minutos se evalúan al consultar o actuar y no solo con tareas programadas, porque el servicio gratuito de Render se duerme tras 15 minutos sin tráfico.
- La protección tiene límites. Vaquita no custodia dinero, así que un solicitante que paga queda expuesto al titular y solo cuenta con la evidencia, el reclamo y el baneo. El baneo se puede evadir con un correo y un celular nuevos. Los meses siguientes siguen siendo cobros con 3 días de gracia, y la deuda de un miembro que deja de pagar después de entrar sigue abierta (P33).
- Quedan puntos por definir, listados en la sección 11 de la spec 010: período en curso del pago de ingreso, umbral para ser titular y arranque con los primeros titulares, datos que identifican a un baneado, y plazos de vencimiento de la solicitud abierta y del reclamo.
