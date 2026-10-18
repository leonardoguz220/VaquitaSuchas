# Investigación — Spec 001: Suscripciones compartidas

- **Fecha:** 2026-10-18
- **Para:** `plan.md` de la spec 001 (y, por extensión, 002 y 010, que dependen de estas definiciones)

Esta investigación fija cuatro definiciones que la spec deja implícitas y que las specs 002, 006 y 010 necesitan para ser coherentes. Las definiciones R1 y R2 fueron aprobadas por el equipo el 2026-10-18.

---

## R1. Períodos, cortes y ciclo inicial

**Qué dice la spec.** El cobro se genera en la fecha de corte (RF-002-01); cada cobro lleva un período `AAAA-MM` (RF-002-02); el cobro de ingreso es el "del período que empezó en el último corte" (RN-010-03); un grupo nuevo tiene la ventana de ingreso desde su creación, y "la fecha de creación cuenta como corte inicial" (spec 001, sección 11 y spec 010, sección 11). La spec 006 afirma que "todos los grupos tienen ciclo desde su creación" (caso borde de la sección 9).

**Hueco.** La spec 002 (RN-002-09) crea el ciclo "al generar los cobros", así que no dice qué período y qué ciclo existen entre la creación del grupo y el primer corte regular, y ahí es justo donde ingresan los primeros miembros.

**Definición (aprobada por el equipo el 2026-10-18).**

1. **Período de un corte** = año y mes de la fecha de corte ya ajustada (`2026-02` para el día 31 ajustado al 28).
2. Al crear un grupo se crea un **ciclo inicial** (`cycle_type = 'inicial'`) cuyo período es el año y mes de la fecha de creación en La Paz. No genera cobros (el único miembro es el titular).
3. El primer corte regular del grupo es la primera fecha de corte **posterior a la creación**. Si el período de ese corte es el mismo del ciclo inicial (por ejemplo, se creó el día 3 y el corte es el día 5 del mismo mes), **no se crea otro ciclo ni otros cobros**: quienes entraron en la ventana inicial ya pagaron ese período con su cuota de ingreso.
4. Los cobros de ingreso de la ventana inicial pertenecen al período del ciclo inicial (no al del primer corte regular), y el primer cobro regular de esos miembros llega en el corte del período siguiente. Así nadie paga dos veces el mismo período ni queda un período sin cobrar.
5. En los cortes regulares siguientes, las cuotas de los miembros que entran durante la ventana (días 1 a 3) las calcula la spec 010 con `floor(total / (miembros + 1))`; los cobros ya generados para los demás no cambian.

**Consecuencia para el modelo.** El ciclo inicial guarda los mismos campos que uno regular. Mientras no llegue el siguiente ciclo, su `member_count` y sus cuotas de referencia se recalculan con cada ingreso o salida (columna `finalized_at` nula); al crearse el ciclo siguiente se fija. Los ciclos regulares son inmutables desde su creación.

**Alternativas descartadas.** No tener ciclo inicial (rompe la afirmación de la spec 006 y deja sin período a los cobros de ingreso). Considerar que el primer período empieza en el primer corte regular (obliga a cobrar el ingreso del grupo nuevo en un período que no ha empezado).

## R2. Vencimiento y plazo de atraso

**Qué dice la spec.** Vencimiento = fecha de corte + 3 días (RF-002-03). La puntualidad compara con el vencimiento y "el último día del plazo cuenta hasta las 23:59:59" (RN-007-06, CA-007-03/04: vencimiento el día 18, 23:30 es puntual, 00:05 del 19 no lo es). El miembro es retirado cuando "pasa la fecha de vencimiento" (RF-002-14, RF-001-23: "dentro de los 3 días siguientes al corte").

**Definición.** `due_date = cut_date + 3 días` (fecha de calendario en La Paz). El cobro vence al terminar ese día: `due_at` = inicio del día `due_date + 1` en La Paz (instante exclusivo). Un cobro está atrasado cuando `now >= due_at`. Un corte el día 15 deja los días 15, 16, 17 y 18 para pagar (el 18 hasta las 23:59:59).

**Excepción por emisión tardía (aprobada 2026-10-18, ver spec 002 `research.md` R1).** `due_at` de un cobro es el mayor entre el instante anterior y `issued_at + 3 días`; así una caída del servicio no retira a nadie. Con ticks de 5 minutos coincide con la fórmula normal.

**Distinto de la ventana de ingreso** (RF-001-22): la ventana dura los días 1 a 3 desde el corte y termina el día 17 a las 23:59:59, es decir, **un día antes** de que venza el cobro. La spec lo dice así y se respeta.

## R3. Cómo se comunican los módulos sin importarse en círculo

`context/arquitectura.md` prohíbe que los módulos se importen entre sí de forma circular y que un módulo use los repositorios de otro. Las dependencias reales sí forman ciclos: `subscriptions` necesita saber si un miembro debe cobros (módulo de cobros), y los cobros necesitan quitar miembros (grupos).

**Decisión.** Dos mecanismos, ambos con el contrato definido por el módulo "de abajo" y la implementación registrada en `AppModule`:

1. **Puertos** (interfaces con *token* de inyección) para consultas síncronas: `OpenChargesPort` (definido por `subscriptions`, implementado por `billing`), `HostEligibilityPort` (definido por `subscriptions`, implementado por un adaptador en `app-adapters/` que compone `reputation` y `admin`), `OwnershipBlockersPort` (definido por `subscriptions`, implementado por `join-requests`).
2. **Bus de eventos transaccional** (`TxEventBus`, en `shared/events`): `publish(tx, event)` ejecuta los manejadores registrados **dentro de la misma transacción** y propaga cualquier error para revertirla. Sirve para reacciones que deben ser atómicas con el cambio: crear el ciclo inicial al crear un grupo, rechazar solicitudes al cerrar un grupo, congelar los grupos de un titular baneado. Los tipos de evento viven en `shared/events/` para que ningún módulo importe a otro solo por un tipo.

**Alternativas descartadas.** `@nestjs/event-emitter` (sus manejadores no comparten la transacción de forma garantizada). `forwardRef` entre módulos (oculta el ciclo en lugar de eliminarlo).

## R4. Aritmética de fechas en La Paz y del tipo de cambio

- **Zona:** America/La_Paz es UTC−4 fijo, sin horario de verano. `laPazStartOfDay(y, m, d)` es `Date.UTC(y, m−1, d, 4, 0, 0)`. Una sola función de `shared/domain/la-paz.ts` hace toda conversión; no se usa `toLocaleString` en el dominio.
- **Día de corte ajustado:** `min(billingDay, díasDelMes)`; los años bisiestos se calculan con la regla gregoriana.
- **Total en Bs:** con el tipo de cambio como texto de 4 decimales se convierte a entero (`"6.9600"` → `69600`) y se calcula `floor((priceCents × rate + 5000) / 10000)`, es decir, redondeo del centavo con la mitad hacia arriba, sin números de punto flotante. La base lo repite con una columna generada (`round(price_cents * exchange_rate)`); una prueba compara ambos resultados con miles de combinaciones.
