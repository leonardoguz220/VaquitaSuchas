# Spec 007 — Reputación

- **Estado:** borrador
- **Líder de la spec:** Camila Fuentes (BD)
- **Revisión por capa:** Leonardo Guzman (Backend) ⬜ · Adrian Vargas (Frontend) ⬜ · Camila Fuentes (BD) ⬜
- **Prioridad:** P2 (extra)
- **Depende de:** 002 (datos de puntualidad), 001 (grupos)
- **Módulo cubierto:** 8 (Reputación)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Compartir una suscripción es un acto de confianza: el titular adelanta el dinero y espera que cada miembro pague a tiempo. Hoy esa confianza se basa en la memoria o en la amistad. Un puntaje de puntualidad, insignias y un ranking dentro del grupo hacen visible quién cumple, motivan a pagar a tiempo y ayudan al titular a decidir a quién aceptar (spec 008).

## 2. Objetivos

- Calcular un puntaje de puntualidad **justo, explicable y reproducible** para cada usuario.
- Reconocer buenos hábitos con insignias.
- Mostrar un ranking de puntualidad dentro de cada grupo.
- Que el usuario entienda **por qué** tiene su puntaje y cómo mejorarlo.

## 3. Fuera de alcance

- Penalizaciones económicas o bloqueos automáticos por mal puntaje.
- Reseñas escritas entre usuarios.
- Reputación pública fuera de la app.
- Reputación del titular por rapidez de confirmación (se deja como mejora futura).

## 4. Actores y permisos

| Actor | Puede ver |
|---|---|
| Usuario | Su puntaje detallado, su historial de puntualidad y sus insignias |
| Miembro de un grupo | El ranking del grupo con puntaje y nivel de los demás miembros |
| Titular | Lo anterior, y el puntaje y nivel de quienes soliciten unirse a sus grupos (spec 008) |
| Administrador | Estadísticas agregadas (spec 009) |

## 5. Historias de usuario

- **HU-007-01:** Como usuario, quiero ver mi puntaje de puntualidad y entender cómo se calcula.
- **HU-007-02:** Como usuario, quiero ganar insignias por pagar a tiempo.
- **HU-007-03:** Como miembro, quiero ver el ranking de mi grupo.
- **HU-007-04:** Como titular, quiero conocer la puntualidad de quien quiere entrar a mi grupo.
- **HU-007-05:** Como usuario, quiero que un rechazo injusto o un error no me quite puntos para siempre.

## 6. Requisitos funcionales

### Puntaje
- **RF-007-01:** Cada usuario tiene un **puntaje de puntualidad de 0 a 100**, calculado sobre sus cobros de los últimos 12 meses (ver RN-007-01 a RN-007-04).
- **RF-007-02:** Si el usuario tiene menos de 3 cobros considerados, se muestra el nivel **"Nuevo"** en lugar de un puntaje.
- **RF-007-03:** El puntaje se asigna a un **nivel**: Excelente (95 a 100), Bueno (80 a 94), Regular (60 a 79) y En riesgo (menos de 60).
- **RF-007-04:** El usuario ve el detalle: cobros considerados, puntuales, tardíos, y la lista de los últimos cobros con su resultado.
- **RF-007-05:** El puntaje se actualiza al cambiar el estado de un cobro a `pagado` o `atrasado` y se verifica con un proceso de reconciliación diario.

### Insignias
- **RF-007-06:** El sistema otorga insignias, por ejemplo: **Primer pago** (primer cobro puntual), **Racha 3 / 6 / 12** (pagos puntuales consecutivos), **Sin atrasos 6 meses**, y **Grupo completo** (todos los miembros de un grupo pagaron a tiempo un mes).
- **RF-007-07:** Cada insignia tiene nombre, descripción, condición y fecha en que se obtuvo. El usuario ve las obtenidas y las que le faltan con su avance.
- **RF-007-08:** Una insignia obtenida se conserva aunque luego se rompa la racha (la racha actual sí se reinicia).

### Ranking del grupo
- **RF-007-09:** Cada grupo muestra un ranking de sus miembros ordenado por puntaje (desempate: racha actual, luego antigüedad en el grupo). Los usuarios en nivel "Nuevo" aparecen al final sin posición.
- **RF-007-10:** El ranking muestra posición, nombre, nivel, puntaje y racha. No muestra montos ni comprobantes.
- **RF-007-11:** El titular aparece en el ranking solo si tiene cobros como miembro en otros grupos; en su propio grupo no tiene cobros (RN-001-10).

### Correcciones
- **RF-007-12:** Si el titular **rechaza** un comprobante, la puntualidad se mide con la fecha de la **primera** subida (RN-007-02), de modo que un rechazo no penaliza a quien pagó a tiempo.
- **RF-007-13:** Un cobro `cancelado` no cuenta. Si el titular cancela un cobro atrasado porque el miembro salió, no afecta su puntaje.
- **RF-007-14:** El usuario puede **reportar** un cobro que cree mal calificado; el titular del grupo lo revisa y puede marcar el cobro como "excluido de reputación" con un motivo. Queda registrado quién y cuándo.

## 7. Requisitos no funcionales

- **RNF-007-01 (Transparencia):** la fórmula se documenta en la app y es la misma para todos.
- **RNF-007-02 (Reproducibilidad):** recalcular el puntaje desde los cobros produce siempre el mismo resultado.
- **RNF-007-03 (Rendimiento):** consultar el ranking de un grupo responde en menos de 300 ms con hasta 20 miembros.
- **RNF-007-04 (Privacidad):** el puntaje se muestra solo a las personas indicadas en la sección de actores; no se publica en listas abiertas.
- **RNF-007-05 (Anti-manipulación):** la puntualidad se calcula en el servidor con fechas del servidor; el cliente no puede enviar fechas de pago.
- **RNF-007-06 (Accesibilidad):** niveles e insignias se distinguen por texto e icono, no solo por color.

## 8. Reglas de negocio

- **RN-007-01 (Cobros considerados):** cobros de los últimos 12 meses en estado `pagado` o `atrasado` (incluye atrasados que luego se pagaron). No cuentan `pendiente`, `en_revision`, `cancelado` ni los excluidos por RF-007-14.
- **RN-007-02 (Puntual):** un cobro es **puntual** si `primera_subida_en <= fecha_de_vencimiento` (RN-002-08). En un pago manual del titular, si `pagado_en <= fecha_de_vencimiento`.
- **RN-007-03 (Puntaje):** `puntaje = redondear(100 × cobros_puntuales / cobros_considerados)`.
- **RN-007-04:** Un cobro que sigue `atrasado` cuenta como **no puntual** desde que pasa a ese estado, aunque aún no se haya pagado.
- **RN-007-05 (Racha):** número de cobros puntuales consecutivos más recientes, ordenados por fecha de vencimiento. Un cobro no puntual la reinicia a 0.
- **RN-007-06:** La comparación de fechas usa la zona America/La_Paz: el último día del plazo cuenta hasta las 23:59:59.
- **RN-007-07:** Las reglas de niveles y de insignias son configuración versionada; si cambian, se recalcula a todos.
- **RN-007-08:** La reputación de un usuario nunca se calcula a partir de datos de otros usuarios.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Usuario con 2 cobros | Nivel "Nuevo", sin puntaje numérico |
| Pagó 1 minuto después de las 23:59:59 del vencimiento | No puntual |
| Subió a tiempo, el titular rechazó y volvió a subir tarde | Puntual (fecha de la primera subida) |
| Subió un comprobante inválido a propósito para ganar tiempo | El titular puede excluir el cobro o reportar [NECESITA ACLARACIÓN] |
| Cobro cancelado por salida del miembro | No cuenta |
| Cobro `atrasado` que sigue sin pagarse | Cuenta como no puntual |
| Cambian las reglas de insignias | Se recalcula a todos con el proceso de reconciliación |
| Miembro con puntaje alto en un grupo y bajo en otro | El puntaje es único por usuario; el ranking compara dentro de cada grupo |
| Un usuario es suspendido | Su reputación se conserva pero no aparece en búsquedas nuevas |
| Reporte de un cobro ya excluido | Se rechaza con mensaje |
| Cálculo con cero cobros considerados | "Nuevo", sin división por cero |

## 10. Criterios de aceptación

- **CA-007-01:** Dado un usuario con 10 cobros considerados y 9 puntuales, cuando se calcula, entonces el puntaje es 90 y el nivel "Bueno".
- **CA-007-02:** Dado un usuario con 2 cobros considerados, cuando se consulta, entonces el nivel es "Nuevo" y no hay puntaje.
- **CA-007-03:** Dado un cobro con vencimiento el día 18 y comprobante subido el día 18 a las 23:30, cuando se evalúa, entonces es puntual.
- **CA-007-04:** Dado un cobro con vencimiento el día 18 y comprobante subido el día 19 a las 00:05, cuando se evalúa, entonces no es puntual.
- **CA-007-05:** Dado un comprobante subido a tiempo y rechazado, cuando el miembro vuelve a subir después del vencimiento y es confirmado, entonces el cobro cuenta como puntual.
- **CA-007-06:** Dado un cobro `cancelado`, cuando se calcula el puntaje, entonces no cuenta.
- **CA-007-07:** Dado un cobro `atrasado` aún sin pagar, cuando se calcula el puntaje, entonces cuenta como no puntual.
- **CA-007-08:** Dados 3 pagos puntuales seguidos, cuando se confirma el tercero, entonces se otorga la insignia "Racha 3".
- **CA-007-09:** Dada la insignia obtenida y luego un pago tardío, cuando se actualiza, entonces la insignia se conserva y la racha actual vuelve a 0.
- **CA-007-10:** Dado un grupo de 4 miembros con puntajes 100, 90, 90 y "Nuevo", cuando se muestra el ranking, entonces el desempate entre los de 90 usa la racha y el "Nuevo" queda al final sin posición.
- **CA-007-11:** Dado un miembro de un grupo, cuando ve el ranking, entonces no ve montos ni comprobantes.
- **CA-007-12:** Dado un usuario que no pertenece a un grupo, cuando consulta su ranking, entonces recibe `404`.
- **CA-007-13:** Dado un cobro reportado, cuando el titular lo marca como excluido con motivo, entonces deja de contar y queda registrado quién y cuándo.
- **CA-007-14:** Dado un recálculo completo desde los cobros, cuando se compara con el puntaje guardado, entonces son idénticos.
- **CA-007-15:** Dado un cambio de estado a `pagado`, cuando ocurre, entonces el puntaje se actualiza sin esperar a la reconciliación diaria.
- **CA-007-16:** Dado el cálculo con cero cobros considerados, cuando se ejecuta, entonces no falla y devuelve "Nuevo".
- **CA-007-17:** Dado un intento de enviar una fecha de pago desde el cliente, cuando se procesa, entonces se ignora y se usa la fecha del servidor.

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Visibilidad del puntaje** (P26). **Propuesta:** ranking visible para los miembros del grupo; puntaje y nivel de un solicitante visibles para el titular al que solicita (spec 008).
- [NECESITA ACLARACIÓN] **Abuso del rechazo.** ¿Cómo evitar que un miembro suba comprobantes falsos a tiempo solo para "congelar" su puntualidad? **Propuesta:** el titular puede marcar un rechazo como "comprobante inválido" y en ese caso el cobro se mide con la fecha de la última subida.
- [NECESITA ACLARACIÓN] **Ventana de cálculo.** **Propuesta:** 12 meses.
- [NECESITA ACLARACIÓN] **Catálogo final de insignias.** **Propuesta:** las del RF-007-06, ampliable.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Claude, a pedido del equipo |
