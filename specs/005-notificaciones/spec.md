# Spec 005 — Notificaciones

- **Estado:** borrador
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Adrian Vargas (Frontend): pendiente · Leonardo Guzman (Backend): pendiente
- **Prioridad:** P1 (importante)
- **Depende de:** 000 (servicio de correo y tareas programadas), 001, 002, 003
- **Módulo cubierto:** 6 (Notificaciones)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

El valor de Vaquita está en que nadie tenga que perseguir a nadie. Para eso la app debe avisar a cada persona lo que le toca hacer: pagar antes de vencer, revisar un comprobante, enterarse de un atraso o de un cambio en su grupo. Esta spec define **qué avisos existen, cuándo se envían, por qué canal y cómo se evitan duplicados y excesos**.

## 2. Objetivos

- Recordar los pagos antes de que venzan y avisar de los atrasos.
- Avisar al titular cuando hay algo que revisar y al miembro cuando su pago fue resuelto.
- Permitir invitar a nuevos miembros por correo y por WhatsApp.
- Dar al usuario control sobre qué correos recibe, sin perder los avisos dentro de la app.

## 3. Fuera de alcance

- Notificaciones push del navegador o del celular.
- Envío automático de mensajes de WhatsApp o SMS mediante API (solo se genera un enlace para que la persona los envíe).
- Chat entre miembros.
- Plantillas editables por el usuario.

## 4. Actores y permisos

| Actor | Recibe / puede |
|---|---|
| Miembro | Avisos de sus cobros y del grupo; ver y marcar sus notificaciones; ajustar sus preferencias de correo |
| Titular | Avisos de comprobantes, nuevos miembros y atrasos de su grupo; invitar por correo; abrir WhatsApp con un mensaje de cobro |
| Sistema | Genera y envía las notificaciones programadas |

Nadie puede ver las notificaciones de otra persona.

## 5. Historias de usuario

- **HU-005-01:** Como miembro, quiero que me avisen antes de que se acerque mi cobro para no olvidarme.
- **HU-005-02:** Como miembro, quiero saber cuándo mi pago fue confirmado o rechazado, y por qué.
- **HU-005-03:** Como titular, quiero enterarme cuando un miembro sube un comprobante.
- **HU-005-04:** Como titular, quiero invitar a un amigo por correo o por WhatsApp con mi código.
- **HU-005-05:** Como titular, quiero recordarle a un miembro atrasado con un mensaje listo por WhatsApp.
- **HU-005-06:** Como usuario, quiero ver mis avisos en la app y marcar los que ya leí.
- **HU-005-07:** Como usuario, quiero decidir qué avisos me llegan por correo.

## 6. Requisitos funcionales

### Centro de notificaciones (dentro de la app)
- **RF-005-01:** Cada usuario tiene una lista de notificaciones con título, texto breve, fecha, enlace a la pantalla relacionada y estado leída/no leída.
- **RF-005-02:** La interfaz muestra un contador de no leídas. El usuario puede marcar una como leída, marcar todas como leídas y navegar con paginación.
- **RF-005-03:** Las notificaciones dentro de la app **no se pueden desactivar**; el correo sí (ver RF-005-17).

### Eventos para el miembro
- **RF-005-04 (Aviso previo):** 2 días antes de la fecha de corte del grupo, se avisa a cada miembro del cobro próximo y su monto estimado.
- **RF-005-05 (Cobro generado):** al generarse el cobro, se avisa con monto, fecha de vencimiento y datos de pago.
- **RF-005-06 (Recordatorio de vencimiento):** 1 día antes del vencimiento, si el cobro sigue `pendiente`.
- **RF-005-07 (Atraso):** cuando el cobro pasa a `atrasado`, se avisa. Mientras siga atrasado, se envía un recordatorio cada 3 días, **máximo 3 recordatorios**.
- **RF-005-08 (Resolución):** cuando el titular confirma o rechaza un pago, se avisa al miembro; el rechazo incluye el motivo.
- **RF-005-09 (Cambios del grupo):** se avisa al miembro cuando es quitado del grupo, cuando cambia la titularidad o cuando el grupo se cierra.

### Eventos para el titular
- **RF-005-10:** Cuando un miembro sube un comprobante (cobro `en_revision`), se avisa al titular.
- **RF-005-11:** Si un comprobante lleva más de 48 horas en revisión, se envía **un** recordatorio al titular.
- **RF-005-12:** Se avisa al titular cuando un miembro se une o abandona el grupo.
- **RF-005-13:** Se avisa al titular cuando uno de sus miembros pasa a `atrasado` (un aviso por cobro).

### Invitaciones
- **RF-005-14 (Correo):** el titular ingresa un correo y el sistema envía una invitación con un enlace `/unirse?codigo=XXXXXXXX` y el código. Si el invitado no tiene sesión, tras iniciar sesión o registrarse vuelve a esa pantalla con el código ya cargado. Límite: 10 invitaciones por hora por titular.
- **RF-005-15 (WhatsApp):** el titular puede abrir WhatsApp con un mensaje prellenado que incluye el enlace de invitación, mediante un enlace `wa.me`. No se envía nada desde el servidor.
- **RF-005-16 (Cobro por WhatsApp):** el titular puede abrir WhatsApp con un mensaje de recordatorio de cobro dirigido al celular del miembro (si lo registró), con el monto, el período y el vencimiento.

### Preferencias
- **RF-005-17:** El usuario puede activar o desactivar el correo por tipo de aviso: recordatorios de pago, resoluciones de pago, avisos como titular, y avisos de grupo. Los correos de **seguridad** (recuperar o cambiar contraseña) no se pueden desactivar.
- **RF-005-18:** Todo correo no transaccional incluye un enlace para desactivar ese tipo de aviso.

### Procesamiento
- **RF-005-19:** Las notificaciones programadas se generan con una tarea diaria a las 08:00 hora de La Paz, y una tarea cada 5 minutos envía los correos pendientes.
- **RF-005-20:** Un correo fallido se reintenta hasta 3 veces (a los 5 minutos, 30 minutos y 2 horas) y luego queda marcado como fallido, sin afectar la notificación dentro de la app.
- **RF-005-21:** Las notificaciones se conservan 90 días y luego se eliminan.

## 7. Requisitos no funcionales

- **RNF-005-01 (Idempotencia):** cada notificación tiene una clave única (tipo, entidad, período y número de recordatorio); ejecutar dos veces una tarea nunca duplica avisos.
- **RNF-005-02 (Privacidad):** los correos no incluyen comprobantes ni datos de otras personas distintos del nombre y los montos necesarios.
- **RNF-005-03 (Horario):** los correos de recordatorio solo se envían entre las 08:00 y las 20:00 de La Paz; los avisos inmediatos (por ejemplo, comprobante subido) pueden enviarse en cualquier momento.
- **RNF-005-04 (Confiabilidad):** una falla del proveedor de correo no debe impedir que se complete una operación del usuario (subir comprobante, confirmar, etc.).
- **RNF-005-05 (Rendimiento):** listar notificaciones responde en menos de 300 ms con hasta 1.000 registros.
- **RNF-005-06 (Accesibilidad):** el contador y los estados de lectura no dependen solo del color.
- **RNF-005-07 (Idioma):** todos los textos en español (Bolivia), con montos `Bs 25,50` y fechas en hora de La Paz.

## 8. Reglas de negocio

- **RN-005-01:** No se envían avisos de cobro a un miembro cuyo cobro está `pagado`, `en_revision` o `cancelado` (salvo la resolución).
- **RN-005-02:** Si un cobro se paga o cancela, se cancelan los recordatorios pendientes de ese cobro.
- **RN-005-03:** El titular **no** recibe avisos de cobro como si fuera miembro (no tiene cobro propio, RN-001-10).
- **RN-005-04:** Un usuario suspendido o con cuenta inactiva no recibe correos.
- **RN-005-05:** El aviso previo se calcula con la cuota vigente al momento del aviso y se indica como "estimado".
- **RN-005-06:** Los tiempos (2 días, 1 día, 3 días, 48 horas, 3 recordatorios) son **parámetros de configuración** con estos valores por defecto.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| La tarea diaria se ejecuta dos veces | No se duplican avisos (clave única) |
| El servidor estuvo caído a las 08:00 | Al reiniciar, se generan los avisos pendientes del día |
| El miembro paga antes del recordatorio | El recordatorio no se envía |
| El usuario desactivó los correos de un tipo | Se guarda la notificación en la app y no se envía el correo |
| Correo inválido en una invitación | Error de validación; no se envía |
| Invitación al correo de alguien que ya es miembro | Se envía igual el correo de forma neutra, sin revelar si pertenece al grupo |
| Se supera el límite de invitaciones | Mensaje con el tiempo de espera |
| Miembro sin celular y el titular quiere usar WhatsApp | El botón de WhatsApp para ese miembro no se muestra |
| El proveedor de correo está caído | Reintentos; finalmente estado `failed` y registro del error |
| Un grupo se cierra con avisos pendientes | Los avisos futuros de ese grupo se cancelan |
| Cuenta con correo rebotado | Se marca el correo con problemas y se deja de enviar [NECESITA ACLARACIÓN] |

## 10. Criterios de aceptación

- **CA-005-01:** Dado un cobro que se genera, cuando termina la generación, entonces el miembro tiene una notificación con monto, vencimiento y datos de pago.
- **CA-005-02:** Dado un grupo con fecha de corte el día 15, cuando es día 13, entonces cada miembro recibe un aviso previo.
- **CA-005-03:** Dado un cobro `pendiente` que vence mañana, cuando corre la tarea diaria, entonces el miembro recibe un recordatorio.
- **CA-005-04:** Dado un cobro `pagado`, cuando corre la tarea diaria, entonces no se genera recordatorio.
- **CA-005-05:** Dado un cobro que pasa a `atrasado`, cuando ocurre, entonces el miembro y el titular reciben aviso.
- **CA-005-06:** Dado un cobro `atrasado` durante 12 días, cuando corre la tarea diaria cada día, entonces el miembro recibe como máximo 3 recordatorios, cada 3 días.
- **CA-005-07:** Dado un comprobante subido, cuando el cobro pasa a `en_revision`, entonces el titular recibe un aviso inmediato.
- **CA-005-08:** Dado un comprobante en revisión por más de 48 horas, cuando corre la tarea, entonces el titular recibe un solo recordatorio.
- **CA-005-09:** Dado un rechazo con motivo, cuando el titular lo envía, entonces el miembro recibe el motivo en su notificación.
- **CA-005-10:** Dada la tarea diaria ejecutada dos veces, cuando termina, entonces no hay notificaciones duplicadas.
- **CA-005-11:** Dado un usuario con correos de recordatorio desactivados, cuando corresponde un recordatorio, entonces ve la notificación en la app y no recibe correo.
- **CA-005-12:** Dado un correo de seguridad, cuando se envía, entonces se envía aunque el usuario haya desactivado los demás.
- **CA-005-13:** Dado un correo no transaccional, cuando se envía, entonces incluye un enlace funcional para desactivar ese tipo.
- **CA-005-14:** Dado un titular, cuando invita a un correo válido, entonces el invitado recibe un correo con enlace y código.
- **CA-005-15:** Dado un invitado sin sesión que abre el enlace, cuando se registra, entonces llega a la pantalla de unirse con el código cargado.
- **CA-005-16:** Dado un titular que invitó a 10 correos en una hora, cuando envía el siguiente, entonces se rechaza.
- **CA-005-17:** Dado el botón de WhatsApp, cuando se pulsa, entonces se abre un enlace `wa.me` con el mensaje prellenado y no se hace ninguna llamada de envío desde el servidor.
- **CA-005-18:** Dado un miembro sin celular, cuando el titular ve su cobro atrasado, entonces no aparece el botón de WhatsApp para él.
- **CA-005-19:** Dado el proveedor de correo caído, cuando un miembro sube un comprobante, entonces la operación se completa y el correo queda en reintentos.
- **CA-005-20:** Dadas 3 fallas de envío, cuando se agotan los reintentos, entonces el correo queda `failed` y la notificación en la app sigue visible.
- **CA-005-21:** Dado un usuario, cuando consulta notificaciones, entonces solo ve las suyas.
- **CA-005-22:** Dado un usuario que marca todas como leídas, cuando recarga, entonces el contador está en cero.
- **CA-005-23:** Dada una notificación de más de 90 días, cuando corre la limpieza, entonces se elimina.
- **CA-005-24:** Dado un correo de recordatorio programado, cuando son las 21:00 de La Paz, entonces no se envía hasta la siguiente ventana.

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Canal de recordatorios** (P21). **Propuesta:** en la app + correo; WhatsApp solo con enlace manual.
- [NECESITA ACLARACIÓN] **Frecuencia de avisos** (P22). **Propuesta:** valores por defecto de RN-005-06, ajustables por configuración.
- [NECESITA ACLARACIÓN] **Rebotes de correo.** **Propuesta:** si el proveedor informa rebote permanente, se marca el correo y se deja de enviar.
- [NECESITA ACLARACIÓN] ¿Se necesita un resumen semanal para el titular? **Propuesta:** no en esta etapa.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
