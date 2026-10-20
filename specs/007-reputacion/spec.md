# Spec 007 — Reputación

- **Estado:** aprobada
- **Líder de la spec:** Camila Fuentes (BD)
- **Revisión por capa:** Leonardo Guzman (Backend): aprobada · Adrian Vargas (Frontend): aprobada · Camila Fuentes (BD): aprobada
- **Prioridad:** P2 (extra). La calificación básica (RF-007-01 a RF-007-05, RF-007-12, RF-007-13 y RF-007-15 a RF-007-17) se construye junto con el MVP, porque la spec 001 la usa para habilitar titulares (RF-001-21); las insignias y el ranking quedan en P2
- **Depende de:** 002 (datos de puntualidad), 001 (grupos)
- **Módulo cubierto:** 8 (Reputación)
- **Última actualización:** 2026-10-18

## 1. Contexto y problema

Compartir una suscripción es un acto de confianza: el titular adelanta el dinero y espera que cada miembro pague a tiempo. Hoy esa confianza se basa en la memoria o en la amistad. Una calificación de puntualidad en estrellas, insignias y un ranking dentro del grupo hacen visible quién cumple, motivan a pagar a tiempo y ayudan al titular a decidir a quién aceptar (spec 008).

## 2. Objetivos

- Calcular una calificación de puntualidad en estrellas, **justa, explicable y reproducible**, para cada usuario.
- Reconocer buenos hábitos con insignias.
- Mostrar un ranking de puntualidad dentro de cada grupo.
- Que el usuario entienda **por qué** tiene su calificación y cómo mejorarla.

## 3. Fuera de alcance

- Penalizaciones económicas o bloqueos automáticos por mala calificación.
- Reseñas escritas entre usuarios y votos de estrellas de unos usuarios a otros: la calificación se calcula a partir de los pagos, no de opiniones.
- Reputación pública fuera de la app.
- Reputación del titular por rapidez de confirmación. La spec 010 registra las solicitudes que expiran por falta de respuesta del titular, dato que esta spec podrá usar más adelante.

## 4. Actores y permisos

| Actor | Puede ver |
|---|---|
| Usuario | Su calificación detallada, su historial de puntualidad y sus insignias |
| Miembro de un grupo | El ranking del grupo con calificación y nivel de los demás miembros |
| Titular | Lo anterior, y la calificación y el nivel de quienes soliciten unirse a sus grupos (specs 008 y 010) |
| Administrador | Estadísticas agregadas (spec 009) |

## 5. Historias de usuario

- **HU-007-01:** Como usuario, quiero ver mi calificación de puntualidad en estrellas y entender cómo se calcula.
- **HU-007-02:** Como usuario, quiero ganar insignias por pagar a tiempo.
- **HU-007-03:** Como miembro, quiero ver el ranking de mi grupo.
- **HU-007-04:** Como titular, quiero conocer la puntualidad de quien quiere entrar a mi grupo.
- **HU-007-05:** Como usuario, quiero que un rechazo injusto o un error no me quite puntos para siempre.

## 6. Requisitos funcionales

### Calificación
- **RF-007-01:** Cada usuario tiene una **calificación de puntualidad de 0 a 5 estrellas**, que se muestra en pasos de media estrella (por ejemplo 4,5 de 5) y se calcula sobre sus cobros de los últimos 12 meses (ver RN-007-01 a RN-007-04).
- **RF-007-02:** Si el usuario tiene menos de 3 cobros considerados, se muestra el nivel **"Nuevo"** en lugar de las estrellas.
- **RF-007-03:** La calificación mostrada se asigna a un **nivel**: Excelente (5 estrellas), Bueno (4 a 4,5), Regular (3 a 3,5) y En riesgo (2,5 o menos).
- **RF-007-04:** El usuario ve el detalle: cobros considerados, puntuales, tardíos, y la lista de los últimos cobros con su resultado.
- **RF-007-05:** La calificación se actualiza al cambiar el estado de un cobro a `pagado` o `atrasado` y se verifica con un proceso de reconciliación diario.

### Insignias
- **RF-007-06:** El sistema otorga insignias, por ejemplo: **Primer pago** (primer cobro puntual), **Racha 3 / 6 / 12** (pagos puntuales consecutivos), **Sin atrasos 6 meses**, y **Grupo completo** (todos los miembros de un grupo pagaron a tiempo un mes).
- **RF-007-07:** Cada insignia tiene nombre, descripción, condición y fecha en que se obtuvo. El usuario ve las obtenidas y las que le faltan con su avance.
- **RF-007-08:** Una insignia obtenida se conserva aunque luego se rompa la racha (la racha actual sí se reinicia).

### Ranking del grupo
- **RF-007-09:** Cada grupo muestra un ranking de sus miembros ordenado por calificación exacta, sin redondear (desempate: racha actual, luego antigüedad en el grupo). Los usuarios en nivel "Nuevo" aparecen al final sin posición.
- **RF-007-10:** El ranking muestra posición, nombre, nivel, calificación en estrellas y racha. No muestra montos ni comprobantes.
- **RF-007-11:** El titular aparece en el ranking solo si tiene cobros como miembro en otros grupos; en su propio grupo no tiene cobros (RN-001-10).

### Correcciones
- **RF-007-12:** Si el titular **rechaza** un comprobante, la puntualidad se mide con la fecha de la **primera** subida (RN-007-02), de modo que un rechazo no penaliza a quien pagó a tiempo. Excepción: si el titular marca el rechazo como **«comprobante inválido»** (spec 002, RF-002-11), el cobro se mide con la fecha de la **última** subida, para que nadie "congele" su puntualidad con comprobantes falsos.
- **RF-007-13:** Un cobro `cancelado` no cuenta. Si el titular cancela un cobro atrasado porque el miembro salió, no afecta su calificación.
- **RF-007-14:** El usuario puede **reportar** un cobro que cree mal calificado; el titular del grupo lo revisa y puede marcar el cobro como "excluido de reputación" con un motivo. Queda registrado quién y cuándo.

### Habilitación para ser titular
- **RF-007-15:** Un usuario queda **habilitado como titular** (spec 001, RF-001-21) cuando su calificación mostrada alcanza el umbral y tiene la cantidad mínima de cobros considerados. El umbral es de **4,5 estrellas o más y al menos 6 cobros considerados** _(decidido 2026-10-17)_.
- **RF-007-16:** Si la calificación baja del umbral, el usuario deja de poder crear nuevas suscripciones. Los grupos que ya tiene no cambian.
- **RF-007-17:** La habilitación manual que hace un administrador (spec 009, RF-009-21) es independiente de la calificación y no se pierde al bajar de ella.

## 7. Requisitos no funcionales

- **RNF-007-01 (Transparencia):** la fórmula, con un ejemplo, se documenta en la app y es la misma para todos.
- **RNF-007-02 (Reproducibilidad):** recalcular la calificación desde los cobros produce siempre el mismo resultado.
- **RNF-007-03 (Rendimiento):** consultar el ranking de un grupo responde en menos de 300 ms con hasta 20 miembros.
- **RNF-007-04 (Privacidad):** la calificación se muestra solo a las personas indicadas en la sección de actores; no se publica en listas abiertas.
- **RNF-007-05 (Anti-manipulación):** la puntualidad se calcula en el servidor con fechas del servidor; el cliente no puede enviar fechas de pago.
- **RNF-007-06 (Accesibilidad):** las estrellas se acompañan del valor numérico (por ejemplo 4,5 de 5) y del nivel en texto; niveles e insignias se distinguen por texto e icono, no solo por color.

## 8. Reglas de negocio

- **RN-007-01 (Cobros considerados):** cobros de los últimos 12 meses en estado `pagado` o `atrasado` (incluye atrasados que luego se pagaron). No cuentan `pendiente`, `en_revision`, `cancelado` ni los excluidos por RF-007-14.
- **RN-007-02 (Puntual):** un cobro es **puntual** si `primera_subida_en <= fecha_de_vencimiento` (RN-002-08). En un pago manual del titular, si `pagado_en <= fecha_de_vencimiento`.
- **RN-007-03 (Calificación):** `estrellas_exactas = 5 × cobros_puntuales / cobros_considerados`. La calificación mostrada es `estrellas_exactas` redondeada al múltiplo de 0,5 más cercano, con la mitad hacia arriba. El nivel se determina con la calificación mostrada. Equivale a: Excelente desde 95 % de cobros puntuales, Bueno desde 75 %, Regular desde 55 % y En riesgo por debajo de 55 %.
- **RN-007-04:** Un cobro que sigue `atrasado` cuenta como **no puntual** desde que pasa a ese estado, aunque aún no se haya pagado.
- **RN-007-05 (Racha):** número de cobros puntuales consecutivos más recientes, ordenados por fecha de vencimiento. Un cobro no puntual la reinicia a 0.
- **RN-007-06:** La comparación de fechas usa la zona America/La_Paz: el último día del plazo cuenta hasta las 23:59:59.
- **RN-007-07:** Las reglas de niveles y de insignias son configuración versionada; si cambian, se recalcula a todos.
- **RN-007-08:** La reputación de un usuario nunca se calcula a partir de datos de otros usuarios.
- **RN-007-09 (Cobros de ingreso):** los cobros de origen `ingreso` (spec 002, RN-002-10) no cuentan para la calificación ni para la habilitación como titular: el pago es previo al ingreso y no mide puntualidad. Así no se puede subir la calificación entrando y pagando en varios grupos.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Usuario con 2 cobros | Nivel "Nuevo", sin estrellas |
| Pagó 1 minuto después de las 23:59:59 del vencimiento | No puntual |
| Subió a tiempo, el titular rechazó y volvió a subir tarde | Puntual (fecha de la primera subida) |
| Subió un comprobante inválido a propósito para ganar tiempo | El titular rechaza marcando «comprobante inválido»; el cobro se mide con la fecha de la última subida (RF-007-12) |
| Cobro cancelado por salida del miembro | No cuenta |
| Miembro retirado por falta de pago (spec 002, RF-002-14) | Su cobro sigue `atrasado` y cuenta como no puntual mientras el titular no lo cancele; si lo paga después, sigue siendo no puntual |
| Cobro `atrasado` que sigue sin pagarse | Cuenta como no puntual |
| Cambian las reglas de insignias | Se recalcula a todos con el proceso de reconciliación |
| Miembro con calificación alta en un grupo y baja en otro | La calificación es única por usuario; el ranking compara dentro de cada grupo |
| Un usuario es suspendido | Su reputación se conserva pero no aparece en búsquedas nuevas |
| Reporte de un cobro ya excluido | Se rechaza con mensaje |
| Cálculo con cero cobros considerados | "Nuevo", sin división por cero |

## 10. Criterios de aceptación

- **CA-007-01:** Dado un usuario con 10 cobros considerados y 9 puntuales, cuando se calcula, entonces la calificación es 4,5 estrellas y el nivel "Bueno".
- **CA-007-02:** Dado un usuario con 2 cobros considerados, cuando se consulta, entonces el nivel es "Nuevo" y no hay estrellas.
- **CA-007-03:** Dado un cobro con vencimiento el día 18 y comprobante subido el día 18 a las 23:30, cuando se evalúa, entonces es puntual.
- **CA-007-04:** Dado un cobro con vencimiento el día 18 y comprobante subido el día 19 a las 00:05, cuando se evalúa, entonces no es puntual.
- **CA-007-05:** Dado un comprobante subido a tiempo y rechazado, cuando el miembro vuelve a subir después del vencimiento y es confirmado, entonces el cobro cuenta como puntual.
- **CA-007-06:** Dado un cobro `cancelado`, cuando se calcula la calificación, entonces no cuenta.
- **CA-007-07:** Dado un cobro `atrasado` aún sin pagar, cuando se calcula la calificación, entonces cuenta como no puntual.
- **CA-007-08:** Dados 3 pagos puntuales seguidos, cuando se confirma el tercero, entonces se otorga la insignia "Racha 3".
- **CA-007-09:** Dada la insignia obtenida y luego un pago tardío, cuando se actualiza, entonces la insignia se conserva y la racha actual vuelve a 0.
- **CA-007-10:** Dado un grupo de 4 miembros con calificaciones de 5, 4,5, 4,5 y "Nuevo", cuando se muestra el ranking, entonces el desempate entre los de 4,5 usa primero el valor exacto, luego la racha y el "Nuevo" queda al final sin posición.
- **CA-007-11:** Dado un miembro de un grupo, cuando ve el ranking, entonces no ve montos ni comprobantes.
- **CA-007-12:** Dado un usuario que no pertenece a un grupo, cuando consulta su ranking, entonces recibe `404`.
- **CA-007-13:** Dado un cobro reportado, cuando el titular lo marca como excluido con motivo, entonces deja de contar y queda registrado quién y cuándo.
- **CA-007-14:** Dado un recálculo completo desde los cobros, cuando se compara con la calificación guardada, entonces son idénticos.
- **CA-007-15:** Dado un cambio de estado a `pagado`, cuando ocurre, entonces la calificación se actualiza sin esperar a la reconciliación diaria.
- **CA-007-16:** Dado el cálculo con cero cobros considerados, cuando se ejecuta, entonces no falla y devuelve "Nuevo".
- **CA-007-18:** Dados usuarios con 19 de 20, 15 de 20 y 11 de 20 cobros puntuales, cuando se calcula, entonces sus calificaciones son 5 (Excelente), 4 (Bueno) y 3 (Regular).
- **CA-007-19:** Dado un usuario con 7 de 8 cobros puntuales, cuando se calcula, entonces la calificación exacta es 4,375 y se muestra como 4,5.
- **CA-007-17:** Dado un intento de enviar una fecha de pago desde el cliente, cuando se procesa, entonces se ignora y se usa la fecha del servidor.
- **CA-007-20:** Dado un usuario con 6 cobros considerados y 4,5 estrellas, cuando se evalúa la habilitación, entonces queda habilitado como titular; con 5 cobros considerados, no.
- **CA-007-21:** Dado un titular habilitado cuya calificación baja del umbral, cuando intenta crear una suscripción nueva, entonces se rechaza y sus grupos existentes no cambian.
- **CA-007-22:** Dado un usuario cuyo único cobro pagado es un cobro de ingreso, cuando se calcula su calificación, entonces ese cobro no cuenta y su nivel es "Nuevo".
- **CA-007-23:** Dado un usuario habilitado manualmente por un administrador, cuando su calificación está por debajo del umbral, entonces puede crear suscripciones.
- **CA-007-24:** Dado un miembro retirado por falta de pago, cuando se calcula su calificación, entonces su cobro `atrasado` cuenta como no puntual y, si lo paga después, sigue sin contar como puntual.
- **CA-007-25:** Dado un rechazo marcado como «comprobante inválido», cuando el miembro vuelve a subir y es confirmado, entonces el cobro se mide con la fecha de la última subida.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] **Visibilidad de la calificación** (P26). **Decidido:** ranking visible para los miembros del grupo; calificación y nivel de un solicitante visibles para el titular al que solicita (spec 008).
- [RESUELTO 2026-10-17] **Abuso del rechazo.** ¿Cómo evitar que un miembro suba comprobantes falsos a tiempo solo para "congelar" su puntualidad? **Decidido:** el titular puede marcar un rechazo como "comprobante inválido" y en ese caso el cobro se mide con la fecha de la última subida.
- [RESUELTO 2026-10-17] **Estrellas calculadas o votadas.** **Decidido:** calculadas a partir de los pagos, sin votos entre usuarios, para evitar represalias y que la nota sea objetiva.
- [RESUELTO 2026-10-17] **Pasos y cortes de las estrellas.** **Decidido:** pasos de media estrella y niveles según RN-007-03 (los cortes pasan de 80 % y 60 % a 75 % y 55 % respecto al puntaje de 0 a 100 anterior).
- [RESUELTO 2026-10-17] **Ventana de cálculo.** **Decidido:** 12 meses.
- [RESUELTO 2026-10-17] **Catálogo final de insignias.** **Decidido:** las del RF-007-06, ampliable.
- [RESUELTO 2026-10-17] **Umbral para ser titular y arranque del sistema** (RF-007-15). El equipo pidió "muy buena reputación". Al inicio nadie tiene cobros, así que la habilitación manual del administrador cubre a los primeros titulares. **Decidido:** 4,5 estrellas y 6 cobros considerados como mínimo. Ver también la spec 001, sección 11.
- [RESUELTO 2026-10-17] **Cobros de ingreso fuera de la calificación** (RN-007-09). **Decidido:** confirmar que no cuentan.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | El puntaje de 0 a 100 pasa a una calificación de 0 a 5 estrellas en pasos de media estrella; se agregan CA-007-18 y CA-007-19 | Equipo |
| 2026-10-17 | La calificación básica se adelanta al MVP y se agrega la habilitación para ser titular y la exclusión de los cobros de ingreso (RF-007-15 a RF-007-17, RN-007-09, CA-007-20 a CA-007-23) | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: umbral de 4,5 estrellas con 6 cobros, rechazo como «comprobante inválido» (RF-007-12), miembro retirado por mora, CA-007-24 y 25; se aceptan las propuestas de la sección 11 | Equipo |
| 2026-10-18 | Spec aprobada por las tres capas (BD, Backend y Frontend) | Equipo |
| 2026-10-20 | Convergencia: nivel `Nuevo`, `recent` sin cobros de ingreso, reglas de insignias y respuestas de reporte y exclusión | Equipo (`/speckit-converge`) |
