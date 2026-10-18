# Spec 002 — Cobros y pagos

- **Estado:** borrador
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Adrian Vargas (Frontend): pendiente · Leonardo Guzman (Backend): pendiente
- **Prioridad:** P0 (MVP)
- **Depende de:** 001 (Suscripciones compartidas)
- **Módulos cubiertos:** 5 (Cobros y pagos)
- **Última actualización:** 2026-10-17

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
- Calificación de reputación (spec 007; esta spec expone los datos que ese módulo necesitará: fecha de pago vs. fecha de vencimiento).
- Reembolsos.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Miembro | Ver sus cobros; subir/reemplazar comprobante mientras el cobro esté `pendiente` o `atrasado`; ver estado e historial del grupo | Confirmar su propio pago; ver comprobantes de otros |
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
- **RF-002-03:** Fecha de vencimiento = fecha de corte + **3 días** de gracia _(decidido 2026-10-17)_.
- **RF-002-04:** La generación es **idempotente**: no puede existir más de un cobro por (grupo, miembro, período), aunque el proceso se ejecute varias veces.
- **RF-002-05:** Los grupos cerrados no generan cobros. Pausar la recepción de nuevos miembros (RF-001-09) no afecta la generación de cobros. Un miembro que ingresó después de la generación del período no recibe cobro de ese período.

### Pago y comprobante
- **RF-002-06:** El miembro puede subir un comprobante (imagen JPG/PNG o PDF, máximo 5 MB) a un cobro `pendiente` o `atrasado`; el cobro pasa a `en_revision`.
- **RF-002-07:** Al subir, el miembro puede indicar método (`qr`, `transferencia`) y una referencia opcional (máx. 100 caracteres).
- **RF-002-08:** El miembro puede reemplazar el comprobante mientras el cobro esté `en_revision` (el anterior se conserva en el historial del cobro).
- **RF-002-09:** El sistema muestra al miembro los datos de pago que el titular configuró (texto y/o imagen de QR), configurados en la suscripción (spec 001, RF-001-20). Si no los configuró, se muestra un aviso _(decidido 2026-10-17)_.

### Confirmación
- **RF-002-10:** El titular puede **confirmar** un cobro `en_revision` → `pagado` (se guarda quién y cuándo).
- **RF-002-11:** El titular puede **rechazar** un cobro `en_revision` indicando un motivo obligatorio (5–200 caracteres); el cobro vuelve a `pendiente` (o `atrasado` si ya venció) y el miembro puede volver a subir.
- **RF-002-12:** El titular puede registrar un **pago manual** (efectivo) sobre un cobro `pendiente` o `atrasado` → `pagado`, con nota opcional.
- **RF-002-13:** El titular puede **cancelar** un cobro `pendiente` o `atrasado` → `cancelado`, con motivo.

### Atrasos
- **RF-002-14:** Pasada la fecha de vencimiento, el sistema marca como `atrasado` todo cobro que siga en `pendiente`. Los cobros `en_revision` **no** se marcan atrasados.

### Consulta e historial
- **RF-002-15:** Cada miembro ve **sus cobros** con filtro por estado y período.
- **RF-002-16:** Todos los miembros ven el **resumen del mes** del grupo: por cada miembro, estado del cobro y monto (sin ver comprobantes de otros).
- **RF-002-17:** Todos los miembros ven el **historial** del grupo (cobros pasados, estados, fechas de pago). Cada cobro registra una línea de tiempo de eventos (generado, comprobante subido, rechazado, confirmado, atrasado, cancelado) con fecha y autor.
- **RF-002-18:** El titular ve un resumen: total esperado, total cobrado, total pendiente y total atrasado del período.

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
  | `pendiente` | `en_revision` | Miembro | Sube comprobante |
  | `atrasado` | `en_revision` | Miembro | Sube comprobante |
  | `pendiente` | `atrasado` | Sistema | Pasa fecha de vencimiento |
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
- **RN-002-06:** Los comprobantes de cobros `pagado` o `cancelado` se conservan mientras exista el grupo.
- **RN-002-08 (Datos para reputación):** cada cobro registra `primera_subida_en` (primera vez que el miembro subió un comprobante) y `pagado_en` (momento en que pasó a `pagado`; en un pago manual, la fecha indicada por el titular, por defecto la actual). La spec 007 los usa para medir la puntualidad.
- **RN-002-09 (Ciclo de cobro):** al generar los cobros de un período, el sistema registra un **ciclo** del grupo con: período, total en Bs, tipo de cambio, número de miembros, cuota base, cuota del titular (referencia) y fecha de corte. Los cobros de los miembros referencian ese ciclo. El panel (spec 006) y la reputación (spec 007) leen de aquí.
- **RN-002-07:** Si un miembro es quitado o abandona, sus cobros históricos se conservan; los no pagados pasan a `cancelado` solo por decisión del titular (RF-002-13).

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
| Miembro se une el mismo día de la fecha de corte, después de la generación | Primer cobro en el siguiente período |
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

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] Días de gracia: 3 (RF-002-03).
- [RESUELTO 2026-10-17] Datos de pago: texto + imagen de QR en la suscripción (RF-002-09, spec 001 RF-001-20).
- [NECESITA ACLARACIÓN] ¿El titular debe poder ver el comprobante de un miembro ya quitado del grupo? (propuesta: sí).
- [NECESITA ACLARACIÓN] ¿Cuánto tiempo se conservan los comprobantes tras cerrar el grupo? (propuesta: 12 meses).
- [NECESITA ACLARACIÓN] **Atrasos prolongados y cobros que nunca se pagan** (P33). La spec no fija un plazo máximo: un cobro `atrasado` sigue así hasta que se paga, el titular registra el pago manual o lo cancela, y cada mes se genera un cobro nuevo mientras la persona siga en el grupo. **Propuesta:** sin acciones automáticas sobre la cuenta ni los cobros; la decisión es del titular. El titular recibe un aviso cuando un miembro cumple 30 días de atraso o acumula 2 cobros atrasados, con la sugerencia de cancelar o quitar al miembro; el resumen del grupo muestra el total adeudado por miembro; al quitar a un miembro, sus cobros sin pagar siguen visibles como deuda hasta que se paguen o el titular los cancele.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Leonardo Guzman |
| 2026-10-17 | Se resuelven: 3 días de gracia y datos de pago en la suscripción | Equipo (ronda 1 de preguntas) |
| 2026-10-17 | Se fija `403` (miembro sin permiso) y `404` (no pertenece al grupo) para comprobantes ajenos: CA-002-13 y CA-002-23 | Equipo |
| 2026-10-17 | Se registra la pregunta abierta sobre atrasos prolongados y cobros impagos | Equipo |
