---
name: vaquita-money-and-billing
description: Reglas y procedimiento de Vaquita para dinero, cuotas, conversión USD a Bs, redondeo, fechas de cobro, generación de cobros y máquina de estados. Úsalo al escribir o revisar cualquier cálculo de cuota, tipo de cambio, ciclo de cobro, vencimiento o transición de estado de un cobro (specs 001 y 002).
---

# Vaquita — Dinero y cobros (Backend)

Esta skill es **de apoyo**. Si contradice `context/dominio.md`, la constitución o la spec 001/002, mandan ellos.
Fuentes: `context/dominio.md`, `specs/001-suscripciones-compartidas/spec.md` (RN-001-02, 03, 04, 06, 10, 11) y `specs/002-cobros-y-pagos/spec.md` (RF-002-01 a 04, RN-002-01 a 09).

## Cuándo usarla

- Calcular o mostrar una cuota, un total o un ahorro.
- Convertir un precio en USD a Bs.
- Generar cobros del período (proceso programado).
- Cambiar el estado de un cobro.
- Calcular fecha de corte o de vencimiento.

## Reglas que no se negocian

1. **Dinero = entero en centavos de Bs.** Nunca `number` con decimales, `float` ni `Math.round(x * 100) / 100` sobre decimales. Un monto de Bs 25,50 es `2550`.
2. **Tipo de cambio:** decimal positivo con hasta 4 decimales (RN-001-04). Para convertir, usa aritmética de enteros o una librería decimal; deja el redondeo explícito y en un solo lugar.
3. **Reparto (RN-001-02):** `cuota_base = floor(total_bs_centavos / n_miembros)`. El resto (`total − cuota_base × n`, entre 0 y n−1 centavos) se suma a la cuota **del titular**. Siempre `Σ cuotas == total`.
4. **El titular cuenta en la división pero no genera cobro** (RN-001-10). Su cuota es solo referencia.
5. **Snapshot:** cada cobro guarda monto, precio original y moneda, tipo de cambio, nº de miembros, período `AAAA-MM`, emisión y vencimiento (RF-002-02). El monto es **inmutable** (RN-002-02). Cambiar la suscripción después no altera cobros ya generados.
6. **Vencimiento = fecha de corte + 3 días** (RF-002-03).
7. **Día de cobro 29, 30 o 31** en un mes más corto se ajusta al último día del mes (RN-001-06). La fecha de corte es a las 00:00 **America/La_Paz**; en base de datos se guarda en **UTC**.
8. **Ingreso con pago previo (RN-001-11, spec 010):** quien entra, siempre durante la ventana de ingreso de los 3 primeros días del período (RF-001-22), paga primero la cuota del período que acaba de empezar, `floor(total / (miembros_actuales + 1))`, que queda registrada como su cobro de ese período en estado `pagado` y origen `ingreso` (RN-010-01 y RN-010-03). Desde el siguiente corte recibe cobros regulares. La generación no duplica ese cobro (RF-002-04).
9. **Retiro por mora (RF-002-14):** al vencer el plazo, el cobro `pendiente` pasa a `atrasado` y el miembro es retirado del grupo; el cobro queda como deuda. Un cobro `en_revision` no se marca ni retira a nadie. Los grupos de un titular baneado se congelan (spec 009, RF-009-22).
   La referencia del comprobante es obligatoria y única por grupo (RN-010-14).
10. **Generación idempotente (RF-002-04):** a lo más un cobro por (grupo, miembro, período). Debe soportar que el proceso corra dos veces, y la base de datos refuerza esto con una restricción única.
11. **Grupos cerrados no generan cobros** (RF-002-05).

## Máquina de estados (RN-002-01)

Estados: `pendiente`, `en_revision`, `pagado`, `atrasado`, `cancelado`. `pagado` y `cancelado` son finales.

| Desde | Hacia | Quién |
|---|---|---|
| (nuevo) | pendiente | Sistema |
| (nuevo) | pagado | Sistema (el titular confirma una solicitud de ingreso, spec 010) |
| pendiente / atrasado | en_revision | Miembro (sube comprobante) |
| pendiente | atrasado | Sistema (pasa el vencimiento) |
| en_revision | pagado | Titular (confirma) |
| en_revision | pendiente / atrasado | Titular (rechaza; según vigente o vencido) |
| pendiente / atrasado | pagado | Titular (pago manual) |
| pendiente / atrasado | cancelado | Titular (con motivo) |

Cualquier otra transición se rechaza. **No se inventan estados** sin actualizar antes la spec. El miembro nunca confirma su propio pago (RN-002-03).

## Procedimiento

1. **Funciones puras primero.** Pon el cálculo en un módulo sin dependencias de NestJS ni de base de datos, por ejemplo `calculateShares(totalCents, memberCount)`, `convertUsdToBsCents(...)`, `computeDueDate(...)`, `nextStatus(current, action, actor)`.
2. **Escribe los tests antes o junto con el código**, con el ID del criterio en el nombre (`CA-001-xx`, `CA-002-xx`).
3. **Casos de prueba mínimos:**
   - División exacta e inexacta (por ejemplo 1000 centavos entre 3 miembros).
   - Propiedad: para muchos totales y n entre 2 y 20, `Σ cuotas == total` y el resto del titular está en `0..n−1`.
   - Tipo de cambio con 4 decimales y redondeo en el borde (medio centavo).
   - Precio en Bs (sin conversión) y en USD.
   - Día de cobro 31 en febrero, año bisiesto y no bisiesto, y paso de mes.
   - Cambio de horario: la fecha de corte a las 00:00 de La Paz se guarda en UTC correctamente.
   - Miembro que ingresa el mismo día del corte, antes o después de generados los cobros: el cobro del período no se duplica.
   - Retiro por mora: cobro `pendiente` vencido pasa a `atrasado` y retira al miembro; `en_revision` no; rechazo tardío deja `atrasado` sin retiro.
   - Ventana de ingreso: el día 3 a las 23:59:59 de La Paz admite solicitudes y el día 4 a las 00:00 no.
   - Cuota de ingreso con centavos sobrantes: la persona paga `cuota_base` y el titular absorbe la diferencia.
   - Generación ejecutada dos veces: no duplica.
   - Cambiar el precio o el tipo de cambio después: los cobros ya generados no cambian.
   - **Transiciones:** test exhaustivo sobre todas las combinaciones estado × acción × actor; todo lo no listado se rechaza (CA-002-21).
4. **Los datos de reputación** (`primera_subida_en`, `pagado_en`, RN-002-08) se registran en el mismo paso que la transición, dentro de la misma transacción.
5. **Transacciones:** generar cobros y registrar el ciclo del período (RN-002-09) ocurre en una sola transacción.

## Errores comunes (rechazar en la revisión)

- Usar `float` o `Number` con decimales para montos.
- Calcular la cuota en el frontend.
- Dar el resto a un miembro distinto del titular.
- Dividir entre los cupos totales en vez de entre los miembros actuales (RF-001-10).
- Cambiar un estado desde un controlador sin pasar por la función de transición.
- Comparar fechas sin considerar la zona America/La_Paz.
- Leer el tipo de cambio actual de la suscripción en vez del snapshot del cobro.

## Antes de terminar

- [ ] Cada criterio `CA-xxx` tocado tiene su test con el ID.
- [ ] No hay `float` en montos (buscar `parseFloat`, `toFixed`, `* 1.0`).
- [ ] La spec sigue reflejando el comportamiento; si no, se actualizó primero.
