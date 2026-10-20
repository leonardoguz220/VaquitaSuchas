# Spec 002 — Cobros y pagos

- **Estado:** aprobada
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): aprobada · Adrian Vargas (Frontend): aprobada · Leonardo Guzman (Backend): aprobada
- **Prioridad:** P0 (MVP)
- **Depende de:** 001 (Suscripciones compartidas)
- **Módulos cubiertos:** 5 (Cobros y pagos)
- **Última actualización:** 2026-10-18

## 1. Contexto y problema

Una vez formado el grupo, el dolor real es el cobro mensual: recordar quién pagó, quién no, y tener pruebas. Hoy se hace por chat, con capturas perdidas y discusiones.

Esta spec define el ciclo de vida de un **cobro mensual**: su generación automática en la fecha de corte, la subida del **comprobante** por parte del miembro, la **confirmación o rechazo** del titular y el **historial** visible para todo el grupo.

## 2. Objetivos

- Generar automáticamente un cobro mensual por cada miembro (excepto el titular).
- Permitir al miembro registrar su pago subiendo un comprobante.
- Permitir al titular confirmar o rechazar el pago con motivo.
- Marcar como atrasados los cobros vencidos sin pago.
- Dar a todo el grupo visibilidad del estado del mes y del historial.

## 3. Fuera de alcance

- Pasarela de pago real o verificación automática del comprobante (la app solo registra y el titular valida).
- Envío de recordatorios y avisos por correo/push (spec 005; aquí solo los estados).
- Multas, intereses o recargos por atraso.
- Pagos parciales o adelantados de varios meses.
- El pago de ingreso de un nuevo miembro: lo gestiona la spec 010 y aquí solo queda registrado como un cobro `pagado` de origen `ingreso`.
- Calificación de reputación (spec 007; esta spec expone los datos que ese módulo necesitará: fecha de pago vs. fecha de vencimiento).
- Reembolsos.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Miembro | Ver sus cobros; subir comprobante mientras el cobro esté `pendiente` o `atrasado`, y reemplazarlo mientras esté `en_revision` (RF-002-08); ver estado e historial del grupo | Confirmar su propio pago; ver comprobantes de otros |
| Titular | Ver todos los cobros del grupo y sus comprobantes; confirmar o rechazar; cancelar un cobro; registrar un pago manual (efectivo) | Confirmar cobros de un grupo ajeno; modificar montos de cobros ya generados |
| Sistema | Generar cobros, marcar atrasos | — |

## 5. Historias de usuario

- **HU-002-01:** Como miembro, quiero ver cuánto debo este mes, a quién pagarle y hasta cuándo.
- **HU-002-02:** Como miembro, quiero subir mi comprobante para demostrar que pagué.
- **HU-002-03:** Como titular, quiero ver los comprobantes y confirmarlos o rechazarlos con un motivo.
- **HU-002-04:** Como titular, quiero registrar un pago recibido en efectivo, para que quede en el historial.
- **HU-002-05:** Como miembro, quiero ver el estado del mes de todo el grupo y el historial, para que haya transparencia.
- **HU-002-06:** Como titular, quiero que los cobros se generen solos cada mes, para no hacerlo a mano.
- **HU-002-07:** Como titular, quiero cancelar un cobro (ej. un miembro que se va), para que no figure como deuda.

## 6. Requisitos funcionales

### Generación
- **RF-002-01:** En la **fecha de corte** (día de cobro del grupo, ajustado según RN-001-06, a las 00:00 America/La_Paz) el sistema genera un cobro por cada miembro activo **excepto el titular**.
- **RF-002-02:** Cada cobro guarda un **snapshot**: monto en centavos de Bs, precio original y moneda, tipo de cambio usado, nº de miembros, período (`AAAA-MM`), fecha de emisión y **fecha de vencimiento**.
- **RF-002-03:** Fecha de vencimiento = fecha de corte + **3 días** de gracia _(decidido 2026-10-17)_. Si el cobro se emite con más de un día de retraso por una caída del servicio, el vencimiento es el mayor entre ese y la emisión + 3 días _(decidido 2026-10-18)_.
- **RF-002-04:** La generación es **idempotente**: no puede existir más de un cobro por (grupo, miembro, período), aunque el proceso se ejecute varias veces.
- **RF-002-05:** Los grupos cerrados no generan cobros. Los grupos de un titular baneado quedan en solo lectura: no generan cobros nuevos y sus cobros abiertos se congelan, sin pasar a `atrasado` ni retirar a nadie (spec 009, RF-009-22). Pausar la recepción de nuevos miembros (RF-001-09) no afecta la generación de cobros. Un miembro que ingresó después de la generación del período no recibe un cobro regular de ese período: ya pagó su cuota de ingreso, que figura como su cobro de ese período (spec 010, RN-010-03).

### Pago y comprobante
- **RF-002-06:** El miembro puede subir un comprobante (imagen JPG/PNG o PDF, máximo 5 MB) a un cobro `pendiente` o `atrasado`; el cobro pasa a `en_revision`.
- **RF-002-07:** Al subir, el miembro puede indicar método (`qr`, `transferencia`) y una **referencia obligatoria** de la transacción (máx. 100 caracteres). La referencia no puede repetirse en otro comprobante del mismo grupo; la de un comprobante rechazado puede volver a usarse (spec 010, RN-010-14). En un pago en efectivo registrado por el titular no se pide referencia.
- **RF-002-08:** El miembro puede reemplazar el comprobante mientras el cobro esté `en_revision` (el anterior se conserva en el historial del cobro).
- **RF-002-09:** El sistema muestra al miembro los datos de pago que el titular configuró (texto y/o imagen de QR), configurados en la suscripción (spec 001, RF-001-20). Si no los configuró, se muestra un aviso _(decidido 2026-10-17)_.

### Confirmación
- **RF-002-10:** El titular puede **confirmar** un cobro `en_revision` → `pagado` (se guarda quién y cuándo).
- **RF-002-11:** El titular puede **rechazar** un cobro `en_revision` indicando un motivo obligatorio (5–200 caracteres); el cobro vuelve a `pendiente` (o `atrasado` si ya venció) y el miembro puede volver a subir. El titular puede marcar el rechazo como «comprobante inválido», lo que afecta la medición de puntualidad (spec 007, RF-007-12).
- **RF-002-12:** El titular puede registrar un **pago manual** (efectivo) sobre un cobro `pendiente` o `atrasado` → `pagado`, con nota opcional.
- **RF-002-13:** El titular puede **cancelar** un cobro `pendiente` o `atrasado` → `cancelado`, con motivo.

### Atrasos
- **RF-002-14 (Atraso y retiro):** pasada la fecha de vencimiento (corte + 3 días), el sistema marca como `atrasado` todo cobro que siga en `pendiente` y **retira automáticamente al miembro del grupo** (spec 001, RF-001-23). El cobro queda `atrasado` como deuda visible y cuenta como no puntual (spec 007). Los cobros `en_revision` **no** se marcan atrasados ni retiran a nadie. Si el titular rechaza un comprobante cuando el cobro ya venció, el cobro queda `atrasado` sin retiro automático. El miembro retirado conserva acceso solo a sus cobros adeudados para pagarlos (RN-002-11). _(Decidido 2026-10-17)_

### Consulta e historial
- **RF-002-15:** Cada miembro ve **sus cobros** con filtro por estado y período.
- **RF-002-16:** Todos los miembros ven el **resumen del mes** del grupo: por cada miembro, estado del cobro y monto (sin ver comprobantes de otros).
- **RF-002-17:** Todos los miembros ven el **historial** del grupo (cobros pasados, estados, fechas de pago). Cada cobro registra una línea de tiempo de eventos (generado, comprobante subido, rechazado, confirmado, atrasado, cancelado) con fecha y autor.
- **RF-002-18:** El titular ve un resumen: total esperado, total cobrado, total pendiente y total atrasado del período.

### Cobro de ingreso
- **RF-002-19:** Cuando el titular confirma una solicitud de ingreso (spec 010), el sistema crea el cobro del período que acaba de empezar del nuevo miembro directamente en estado `pagado`, con origen `ingreso`, el snapshot de la cuota cotizada y el comprobante de la solicitud. Aparece en el historial y en el resumen del mes como cualquier otro cobro pagado, pero no cuenta para la calificación de puntualidad (spec 007, RN-007-09).

## 7. Requisitos no funcionales

- **RNF-002-01 (Seguridad):** Los comprobantes se almacenan en un espacio **privado**; el acceso es por URL firmada de corta duración (≤ 10 min), solo para el titular y el miembro dueño del cobro.
- **RNF-002-02 (Seguridad):** Se valida el tipo real del archivo (no solo la extensión) y se rechazan archivos que no sean imagen o PDF.
- **RNF-002-03 (Integridad):** Las transiciones de estado se validan en el servidor mediante una función pura; una transición inválida devuelve error y no cambia datos.
- **RNF-002-04 (Auditoría):** Todo cambio de estado queda registrado con autor, fecha y motivo (si aplica); el registro es de solo anexado.
- **RNF-002-05 (Confiabilidad):** El proceso de generación y de atrasos se puede reejecutar sin duplicar ni corromper datos, y recupera ejecuciones perdidas (si el servidor estuvo caído en la fecha de corte).
- **RNF-002-06 (Usabilidad):** Subir un comprobante desde el celular toma como máximo 3 toques desde la pantalla del cobro.
- **RNF-002-07 (Privacidad):** Los demás miembros ven estado y monto de cada cobro, nunca el comprobante ni la referencia.

## 8. Reglas de negocio

- **RN-002-01 (Máquina de estados):**

  | Desde | Hacia | Quién | Condición |
  |---|---|---|---|
  | _(nuevo)_ | `pendiente` | Sistema | Fecha de corte |
  | _(nuevo)_ | `pagado` | Sistema | El titular confirma una solicitud de ingreso (spec 010) |
  | `pendiente` | `en_revision` | Miembro | Sube comprobante |
  | `atrasado` | `en_revision` | Miembro | Sube comprobante |
  | `pendiente` | `atrasado` | Sistema | Pasa fecha de vencimiento (el miembro es retirado, RF-002-14) |
  | `en_revision` | `pagado` | Titular | Confirma |
  | `en_revision` | `pendiente` | Titular | Rechaza, vigente |
  | `en_revision` | `atrasado` | Titular | Rechaza, ya vencido |
  | `pendiente` / `atrasado` | `pagado` | Titular | Pago manual |
  | `pendiente` / `atrasado` | `cancelado` | Titular | Cancela con motivo |

  `pagado` y `cancelado` son estados **finales**. Cualquier otra transición es inválida.

- **RN-002-02:** El monto de un cobro es **inmutable** una vez generado (ver RN-001-03).
- **RN-002-03:** El miembro nunca confirma su propio pago. El titular no genera cobro para sí mismo.
- **RN-002-04:** La cuota del miembro en el cobro es la de RN-001-02 vigente en la fecha de corte.
- **RN-002-05:** Un cobro se considera **puntual** si `fecha_subida_comprobante <= fecha_vencimiento` (dato para reputación, spec 007).
- **RN-002-06:** Los comprobantes de cobros `pagado` o `cancelado` se conservan mientras exista el grupo y hasta **2 meses** después de cerrarlo.
- **RN-002-08 (Datos para reputación):** cada cobro registra `primera_subida_en` (primera vez que el miembro subió un comprobante) y `pagado_en` (momento en que pasó a `pagado`; en un pago manual, la fecha indicada por el titular, por defecto la actual). La spec 007 los usa para medir la puntualidad.
- **RN-002-09 (Ciclo de cobro):** al generar los cobros de un período, el sistema registra un **ciclo** del grupo con: período, total en Bs, tipo de cambio, número de miembros, cuota base, cuota del titular (referencia) y fecha de corte. Los cobros de los miembros referencian ese ciclo. El panel (spec 006) y la reputación (spec 007) leen de aquí.
- **RN-002-10 (Origen del cobro):** cada cobro tiene un origen: `ciclo` (generado en la fecha de corte) o `ingreso` (pago previo de un nuevo miembro, spec 010). El origen no cambia las reglas de visibilidad ni de historial. Los cobros de origen `ingreso` no cuentan para la calificación de puntualidad (spec 007, RN-007-09).
- **RN-002-07:** Si un miembro es quitado, abandona o es retirado por falta de pago, sus cobros históricos se conservan; los no pagados pasan a `cancelado` solo por decisión del titular (RF-002-13). Un cobro `atrasado` de alguien retirado sigue siendo deuda visible para el titular.
- **RN-002-11 (Pago de la deuda tras el retiro):** quien fue retirado por falta de pago puede subir el comprobante de su cobro `atrasado` y el titular puede confirmarlo o cancelarlo. Mientras tenga un cobro `atrasado` en el grupo no puede abrir una nueva solicitud de ingreso (spec 010, RN-010-13). Pagar la deuda no lo devuelve al grupo.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| El proceso de generación se ejecuta dos veces el mismo día | No se duplican cobros (RF-002-04) |
| El servidor estuvo caído en la fecha de corte | Al reiniciar, genera los cobros faltantes del período con fecha de emisión real |
| Archivo > 5 MB o de tipo no permitido | Error claro; el cobro no cambia de estado |
| Miembro sube comprobante a un cobro `pagado` o `cancelado` | Error "Este cobro ya no admite cambios" |
| Titular confirma un cobro que no está `en_revision` | Error de transición inválida |
| Rechazo sin motivo | Error de validación |
| Dos acciones simultáneas sobre el mismo cobro (ej. cancelar y confirmar) | Solo una se aplica; la otra recibe error de estado (control optimista de concurrencia) |
| El tipo de cambio cambia después de generar el cobro | El cobro conserva su monto original |
| Una persona ingresa después de generados los cobros del período | Su cuota de ingreso queda como su cobro de ese período y el primer cobro regular llega en el siguiente corte |
| Una persona ingresa el mismo día del corte, antes de generados los cobros | La generación no crea un segundo cobro para ese período (RF-002-04) |
| Miembro con cobro `atrasado` sube comprobante | Pasa a `en_revision`; si el titular rechaza, vuelve a `atrasado` |
| Grupo cerrado en la fecha de corte | No se generan cobros ese período |
| Falla en el almacenamiento del archivo | El cobro no cambia de estado; se informa y se permite reintentar |

## 10. Criterios de aceptación

- **CA-002-01:** Dado un grupo con 3 miembros (incluido el titular), cuando llega la fecha de corte, entonces se generan exactamente 2 cobros `pendiente` con el snapshot correcto.
- **CA-002-02:** Dado que la generación ya corrió para un período, cuando se ejecuta otra vez, entonces no se crean cobros duplicados.
- **CA-002-03:** Dado un día de cobro 31, cuando el mes es febrero, entonces el cobro se genera el 28 (29 en bisiesto).
- **CA-002-04:** Dado un cobro `pendiente`, cuando el miembro sube un comprobante JPG de 2 MB, entonces el cobro pasa a `en_revision` y queda registrado en la línea de tiempo.
- **CA-002-05:** Dado un archivo de 6 MB o un `.exe`, cuando el miembro intenta subirlo, entonces se rechaza y el estado no cambia.
- **CA-002-06:** Dado un cobro `en_revision`, cuando el titular confirma, entonces pasa a `pagado` y se guarda quién y cuándo.
- **CA-002-07:** Dado un cobro `en_revision`, cuando el titular rechaza con motivo, entonces vuelve a `pendiente` (o `atrasado` si venció) y el miembro ve el motivo.
- **CA-002-08:** Dado un rechazo sin motivo, cuando el titular lo envía, entonces recibe error de validación.
- **CA-002-09:** Dado un cobro `pendiente` cuya fecha de vencimiento pasó, cuando corre el proceso de atrasos, entonces pasa a `atrasado`.
- **CA-002-10:** Dado un cobro `en_revision` vencido, cuando corre el proceso de atrasos, entonces permanece `en_revision`.
- **CA-002-11:** Dado un cobro `pagado`, cuando alguien intenta subir un comprobante o cambiar su estado, entonces recibe error y no hay cambios.
- **CA-002-12:** Dado un miembro, cuando intenta confirmar su propio cobro, entonces recibe `403`.
- **CA-002-13:** Dado un miembro del grupo, cuando intenta ver el comprobante de otro miembro, entonces recibe `403`.
- **CA-002-23:** Dado un usuario que no pertenece al grupo, cuando intenta ver un cobro o un comprobante de ese grupo, entonces recibe `404`.
- **CA-002-14:** Dado un titular, cuando registra un pago manual sobre un cobro `pendiente`, entonces pasa a `pagado` con la nota y la marca "manual".
- **CA-002-15:** Dado un titular, cuando cancela un cobro `atrasado` con motivo, entonces pasa a `cancelado` y deja de contar como deuda.
- **CA-002-16:** Dado un cobro ya generado, cuando el titular cambia el tipo de cambio de la suscripción, entonces el monto del cobro no cambia.
- **CA-002-17:** Dado el resumen del mes, cuando un miembro lo abre, entonces ve estado y monto de todos, pero ningún comprobante ajeno.
- **CA-002-18:** Dado el historial, cuando se consulta, entonces cada cobro muestra su línea de tiempo con evento, autor y fecha.
- **CA-002-19:** Dadas dos acciones simultáneas sobre un mismo cobro, entonces solo una se aplica y la otra devuelve error de estado.
- **CA-002-20:** Dado el resumen del titular, cuando hay 2 `pagado`, 1 `en_revision` y 1 `atrasado`, entonces los totales esperado/cobrado/pendiente/atrasado coinciden con la suma de montos.
- **CA-002-21:** Dada cualquier transición no listada en RN-002-01, cuando se intenta, entonces la función de transición la rechaza (test unitario exhaustivo sobre todas las combinaciones estado × acción).
- **CA-002-22:** Dado un servidor caído en la fecha de corte, cuando se reinicia, entonces se generan los cobros faltantes sin duplicar.
- **CA-002-24:** Dado un miembro cuyo ingreso fue confirmado en un período, cuando corre la generación de cobros de ese período, entonces no se crea un segundo cobro para él y el cobro de ingreso figura `pagado`.
- **CA-002-25:** Dada una solicitud de ingreso confirmada, cuando se consulta el historial del grupo, entonces el cobro de ingreso aparece como `pagado` con su línea de tiempo y el comprobante, visible solo para el titular y el miembro.
- **CA-002-26:** Dado un comprobante sin referencia, cuando el miembro lo sube, entonces se rechaza y el cobro no cambia de estado.
- **CA-002-27:** Dada una referencia ya usada en otro comprobante del mismo grupo, cuando se sube, entonces se rechaza; si el comprobante anterior fue rechazado, o la referencia es de otro grupo, se acepta.
- **CA-002-28:** Dado un cobro `pendiente` cuyo vencimiento pasó, cuando corre el proceso de atrasos, entonces el cobro pasa a `atrasado`, el miembro deja de pertenecer al grupo y titular y miembro reciben un aviso.
- **CA-002-29:** Dado un cobro `en_revision` al pasar el vencimiento, cuando corre el proceso de atrasos, entonces no se marca atrasado y el miembro no es retirado.
- **CA-002-30:** Dado un cobro `en_revision` rechazado después del vencimiento, cuando el titular rechaza, entonces queda `atrasado` y el miembro no es retirado automáticamente.
- **CA-002-31:** Dado un miembro retirado con un cobro `atrasado`, cuando sube su comprobante y el titular lo confirma, entonces el cobro queda `pagado`, la deuda desaparece y no vuelve a ser miembro.
- **CA-002-32:** Dado un miembro retirado con un cobro `atrasado`, cuando consulta el grupo, entonces solo ve sus cobros adeudados y no el resto del grupo.
- **CA-002-33:** Dado un grupo cerrado hace más de 2 meses, cuando corre la limpieza, entonces se eliminan sus comprobantes y se conservan los montos y estados del historial.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] Días de gracia: 3 (RF-002-03).
- [RESUELTO 2026-10-17] Datos de pago: texto + imagen de QR en la suscripción (RF-002-09, spec 001 RF-001-20).
- [RESUELTO 2026-10-17] El titular puede ver el comprobante de un miembro ya quitado o retirado (propuesta aceptada).
- [RESUELTO 2026-10-17] Los comprobantes se conservan 2 meses tras cerrar el grupo (RN-002-06).
- [RESUELTO 2026-10-17] Período del cobro de ingreso y doble pago cerca del corte: el ingreso solo se abre durante los 3 primeros días del período (spec 001, RF-001-22), así que se paga siempre el período que acaba de empezar.
- [RESUELTO 2026-10-17] **Atrasos prolongados y cobros que nunca se pagan** (P33): el miembro tiene 3 días para pagar; si no lo hace, es retirado del grupo y su cobro queda `atrasado` como deuda visible (RF-002-14, RN-002-11). La pérdida máxima del titular es una cuota.
- [RESUELTO 2026-10-18] **Retiro y deuda:** quien fue retirado puede seguir pagando su deuda y no puede volver a ese grupo mientras la tenga (RN-002-11).

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Leonardo Guzman |
| 2026-10-17 | Se resuelven: 3 días de gracia y datos de pago en la suscripción | Equipo (ronda 1 de preguntas) |
| 2026-10-17 | Se fija `403` (miembro sin permiso) y `404` (no pertenece al grupo) para comprobantes ajenos: CA-002-13 y CA-002-23 | Equipo |
| 2026-10-17 | Se registra la pregunta abierta sobre atrasos prolongados y cobros impagos | Equipo |
| 2026-10-17 | Se agrega el cobro de ingreso por la spec 010: RF-002-19, RN-002-10, nueva transición en RN-002-01, CA-002-24 y CA-002-25 | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: referencia obligatoria y única (RF-002-07), retiro automático por atraso (RF-002-14, RN-002-11), retención de 2 meses (RN-002-06), CA-002-26 a 33; se resuelve P33 | Equipo |
| 2026-10-18 | Se confirma el tratamiento de la deuda del miembro retirado (RN-002-11) | Equipo |
| 2026-10-18 | Se aprueban la emisión tardía (RF-002-03: vencimiento = mayor entre corte + 3 días y emisión + 3 días) y el tratamiento de grupos cerrados y congelados (`research.md` R5) | Equipo |
| 2026-10-18 | Spec aprobada por las tres capas (BD, Backend y Frontend) | Equipo |
