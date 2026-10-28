# Spec 011 — Faltante de grupo (cubrir la diferencia o pedir devolución)

- **Estado:** propuesta (pendiente de aprobación de las tres capas)
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Revisión por capa:** Camila Fuentes (BD): pendiente · Adrian Vargas (Frontend): pendiente · Leonardo Guzman (Backend): pendiente
- **Prioridad:** P1
- **Depende de:** 001 (grupos y miembros), 002 (cobros y ciclos), 005 (avisos), 010 (reclamos entre pares)
- **Última actualización:** 2026-10-28

## 1. Contexto y problema

La cuota de un período se calcula dividiendo el total entre los miembros del grupo al momento del corte (RN-001-02). Si después de que varios miembros pagaron alguien se va (abandona, es retirado por mora o pide salir), el total del servicio ya no se cubre con lo cobrado y hoy el titular absorbe la diferencia sin que nadie lo sepa.

El titular debe poder **avisar al grupo** y que cada miembro que ya pagó elija entre **cubrir** lo que falta (la diferencia se reparte en partes iguales entre los miembros que se quedan) o **pedir su devolución** y salir del grupo.

Vaquita no custodia dinero (spec 002 §3, spec 010 §3). La devolución es entre personas y fuera de la app: aquí solo se **registra** que el titular la hizo y que el miembro la recibió, con plazos y un estado de disputa.

## 2. Objetivos

- Que el titular pueda abrir una ronda de regularización con una cotización exacta calculada por el servidor.
- Que cada miembro afectado decida con claridad cuánto debe agregar y hasta cuándo.
- Que quien no quiere pagar más pueda salir y recuperar lo que pagó, con constancia.
- Que nadie quede sin respuesta: al vencer los plazos, el silencio se trata como pedido de devolución.

## 3. Fuera de alcance

- Mover, retener o devolver dinero desde Vaquita.
- Subir archivos de comprobante en esta spec: el pago adicional y la devolución se registran con **método y referencia** (el titular verifica en su banco). Los comprobantes con imagen quedan para una versión posterior.
- Detección automática del faltante: la ronda la abre el titular.
- Resolución de disputas por un administrador: la disputa queda registrada y avisada; su resolución se integra a la cola de reclamos (spec 009) en una iteración posterior.
- Pagos parciales o intereses.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Titular | Ver la cotización, abrir y cancelar la ronda, confirmar o rechazar el pago adicional, registrar la devolución | Cambiar la cotización abierta; participar como pagador (no tiene cobro propio, RN-001-10) |
| Miembro afectado | Ver su fila (lo que pagó, lo que debe agregar), elegir cubrir o devolución, informar su pago adicional, confirmar o disputar la devolución | Ver las filas de otros miembros |
| Otro miembro o ajeno | Nada (`403` / `404`) | — |
| Sistema | Vencer plazos, tratar el silencio como devolución, cerrar la ronda | — |

## 5. Historias de usuario

- **HU-011-01:** Como titular, quiero avisar al grupo cuánto falta y cómo se repartiría, para no absorber la diferencia en silencio.
- **HU-011-02:** Como miembro, quiero ver cuánto pagué, cuánto debo agregar y hasta cuándo, para decidir.
- **HU-011-03:** Como miembro, quiero poder cubrir mi parte sin salir del grupo.
- **HU-011-04:** Como miembro, quiero pedir mi devolución y salir si no quiero pagar más.
- **HU-011-05:** Como titular, quiero confirmar los pagos adicionales y registrar las devoluciones, para dejar constancia.
- **HU-011-06:** Como miembro, quiero confirmar o disputar que recibí mi devolución.

## 6. Requisitos funcionales

### Cotización
- **RF-011-01:** El titular puede consultar la **cotización** del último período del grupo: total `T` (copia del ciclo), miembros que se quedan `m'` (miembros activos, titular incluido), cuota nueva, la parte del titular y, por cada miembro afectado, lo pagado y lo que debe agregar.
- **RF-011-02:** Son **afectados** los miembros activos, distintos del titular, cuyo cobro del último período está `pagado` y cuyo pago es menor que la cuota nueva.
- **RF-011-03:** Solo se puede abrir una ronda si la suma de los montos a agregar es mayor que cero. Si no hay diferencia, se rechaza con `NO_SHORTFALL`.

### Ronda
- **RF-011-04:** El titular **abre** una ronda: el servidor fija la cotización (inmutable mientras está abierta), crea una fila por afectado y avisa a cada uno. Plazo para responder: 48 horas; plazo para pagar: hasta 48 horas después de responder, con tope en 96 horas desde la apertura (valores de configuración).
- **RF-011-05:** Hay a lo más una ronda abierta por grupo y a lo más 2 rondas por período.
- **RF-011-06:** El titular puede **cancelar** la ronda mientras ningún afectado haya respondido.
- **RF-011-07:** Un grupo cerrado o congelado no admite abrir ni avanzar rondas (`GROUP_CLOSED`, `GROUP_FROZEN`).

### Respuesta del miembro
- **RF-011-08:** El miembro afectado responde **cubrir** o **devolucion** dentro del plazo. Al cubrir, queda con un pago adicional pendiente por el monto exacto cotizado.
- **RF-011-09:** Al elegir **devolucion**, el miembro sale del grupo (como `abandono`) y se abre un registro de devolución por lo que pagó, sin recargo.
- **RF-011-10:** El miembro informa su pago adicional con método (`qr` o `transferencia`) y una referencia (hasta 100 caracteres). El titular lo **confirma** o lo **rechaza** con motivo (vuelve a pendiente de pago mientras haya plazo).
- **RF-011-11:** Al vencer el plazo de respuesta sin respuesta, o el de pago sin pago confirmado, la fila pasa a **devolución** por el sistema (el miembro sale del grupo). Un pago informado y aún sin decisión del titular no vence.

### Devolución
- **RF-011-12:** El titular registra la devolución hecha con método y referencia. El miembro la **confirma** o la **disputa** (con motivo). Si el titular no la registra en 5 días, el miembro puede disputar.
- **RF-011-13:** Una disputa deja la devolución en estado `disputada` y avisa al titular. Vaquita no devuelve dinero ni obliga a hacerlo (RF-010-25).

### Cierre
- **RF-011-14:** La ronda se **cierra** cuando todas las filas están resueltas (pago adicional confirmado o devolución abierta) y vencieron los plazos pendientes; al cerrarse se avisa a todos.
- **RF-011-15:** Toda acción queda en una línea de tiempo de solo anexado, con autor, fecha y motivo.

## 7. Reglas de negocio

- **RN-011-01 (Cotización):** `cuota_nueva = floor(T / m')`; el resto lo absorbe el titular (RN-001-02). A cada afectado le corresponde `max(cuota_nueva − pagado, 0)`. `T` es el total del ciclo; no se relee el tipo de cambio ni el precio vigentes.
- **RN-011-02 (Dinero):** todo en centavos enteros. Σ (pagos de afectados + extras) + parte del titular = T cuando todos cubren.
- **RN-011-03 (Devolución):** igual a lo efectivamente pagado y confirmado por esa persona en el período, sin comisión.
- **RN-011-04 (Silencio):** callar equivale a pedir devolución (RF-011-11).
- **RN-011-05 (Sin estados nuevos de cobro):** la ronda y las filas tienen estados propios; los cobros de la spec 002 no cambian.
- **RN-011-06 (Concurrencia):** las acciones validan la versión de la fila (409 `STALE_STATE`) y una transición inválida devuelve 409 `INVALID_TRANSITION`.
- **RN-011-07:** el pago adicional **no** cuenta para la calificación de puntualidad.

### Máquina de estados de la ronda
`abierta → cerrada | cancelada` (finales).

### Máquina de estados del pago adicional (`extra_status`)
`no_aplica → pendiente_pago` (cubrir) `→ informado → confirmado`; `informado → pendiente_pago` (rechazo); `pendiente_pago → vencido` (sistema, pasa a devolución). `confirmado` y `vencido` son finales.

### Máquina de estados de la devolución (`refund_status`)
`no_aplica → pendiente → enviada → confirmada | disputada`; `pendiente → disputada` (pasados 5 días sin registro). `confirmada` y `disputada` son finales en esta spec.

## 8. Casos borde

| Situación | Comportamiento |
|---|---|
| Nadie pagó de más ni falta nada | `NO_SHORTFALL`, no se abre |
| El miembro ya pagó más que la cuota nueva | No es afectado |
| Solo queda el titular (`m' = 1`) | No hay afectados; no se abre |
| Un afectado abandona el grupo durante la ronda | Su fila pasa a devolución |
| Cambia el precio o el tipo de cambio | La cotización abierta no cambia |
| Dos acciones a la vez | Una se aplica; la otra recibe error de estado |
| Cierra el plazo con un pago informado sin decidir | La ronda espera la decisión del titular |
| El titular cancela con respuestas | Se rechaza |

## 9. Criterios de aceptación

- **CA-011-01:** Dado T = Bs 100,00, titular + 3 miembros que pagaron Bs 25,00 y 1 miembro que sale, cuando se cotiza, entonces `m' = 3`, la cuota nueva es Bs 33,33, el titular absorbe el centavo y cada afectado debe agregar Bs 8,33.
- **CA-011-02:** Dada una cotización sin diferencia, cuando el titular intenta abrir, entonces recibe `NO_SHORTFALL`.
- **CA-011-03:** Dado un titular, cuando abre la ronda, entonces la cotización queda fija y cada afectado recibe un aviso.
- **CA-011-04:** Dado un grupo con ronda abierta, cuando el titular intenta abrir otra, entonces se rechaza.
- **CA-011-05:** Dado un afectado, cuando elige cubrir, entonces queda con un pago adicional pendiente por el monto cotizado.
- **CA-011-06:** Dado un afectado, cuando elige devolución, entonces sale del grupo y se abre una devolución por lo que pagó.
- **CA-011-07:** Dado un pago adicional informado, cuando el titular confirma, entonces queda `confirmado`; si rechaza con motivo, vuelve a `pendiente_pago`.
- **CA-011-08:** Dado un plazo de respuesta vencido sin respuesta, cuando corre la tarea, entonces la fila pasa a devolución y el miembro sale del grupo.
- **CA-011-09:** Dado un pago adicional pendiente que vence, cuando corre la tarea, entonces la fila pasa a devolución.
- **CA-011-10:** Dada una devolución pendiente, cuando el titular registra método y referencia, entonces pasa a `enviada` y el miembro es avisado.
- **CA-011-11:** Dada una devolución `enviada`, cuando el miembro la confirma, entonces queda `confirmada`; si la disputa, queda `disputada` y el titular es avisado.
- **CA-011-12:** Dada una ronda con todas las filas resueltas y sin plazos pendientes, cuando corre la tarea, entonces se cierra y se avisa a todos.
- **CA-011-13:** Un miembro no afectado, ajeno al grupo o que no es el titular no puede ver ni accionar sobre filas ajenas (`403`/`404`).
- **CA-011-14:** Un grupo cerrado o congelado no admite abrir ni avanzar rondas.
- **CA-011-15:** Cualquier transición no listada en las máquinas de estado se rechaza.

## 10. Supuestos tomados (a confirmar por el equipo al aprobar la spec)

- [SUPUESTO 2026-10-28] El silencio equivale a devolución y salida del grupo (RN-011-04).
- [SUPUESTO 2026-10-28] El titular entra en el reparto del faltante (`m'` lo incluye).
- [SUPUESTO 2026-10-28] Una sola ronda abierta por grupo; hasta 2 por período.
- [SUPUESTO 2026-10-28] El pago adicional y la devolución se registran con referencia, sin archivo (sección 3).

## 11. Historial de cambios

| Fecha | Cambio | Quién |
|---|---|---|
| 2026-10-28 | Primera versión | Leonardo (con Claude) |
