# Investigación — Spec 002: Cobros y pagos

- **Fecha:** 2026-10-18
- Las definiciones de período, ciclo inicial, vencimiento y comunicación entre módulos están en `specs/001-suscripciones-compartidas/research.md` (R1 a R4) y valen para esta spec.

## R1. Generación de cobros y recuperación tras una caída

**Decisión.** La tarea `billing.generate` corre en cada tick (cada 5 minutos, ver spec 000). En cada tick evalúa **todos los grupos activos y no congelados** (cientos, no miles): calcula el último corte regular `≤ ahora` y, si el grupo no tiene el ciclo de ese período, ejecuta `generateForGroup` en una transacción propia con `pg_try_advisory_xact_lock(hash(groupId))`. La misma función la invoca la spec 010 al aceptar un ingreso, de modo que el ciclo exista aunque la tarea no haya corrido (caso «el mismo día del corte», spec 002 sección 9).

**Por qué no «una tarea por día a las 00:00».** El servicio gratuito de Render se duerme; una tarea de una sola oportunidad se pierde. Evaluar el estado esperado en cada tick es idempotente y se recupera solo (RNF-002-05, CA-002-22).

**Caídas largas (aprobado 2026-10-18).** Si faltan varios períodos (más de un mes sin ejecución), se genera **solo el más reciente** y se deja una advertencia en `job_runs`. Es una decisión de simplicidad: la caída de más de un mes no es un escenario del MVP. Se anota como riesgo.

**Fecha de emisión real (decisión aprobada 2026-10-18).** `issued_at` es el momento en que se creó. `due_at = max(inicio del día corte+4 en La Paz, issued_at + 3 días)`: si el cobro se genera con más de un día de retraso por una caída, el plazo se corre para que nadie sea marcado `atrasado` ni retirado sin haber tenido sus 3 días. Con ticks de 5 minutos coincide con la fórmula normal (RF-002-03).

**Alternativas descartadas.** `@nestjs/schedule` con `@Cron('0 0 * * *')` como único disparador (se pierde si el servicio duerme); una cola de trabajos con Redis (servicio extra y de pago).

## R2. Atrasos evaluados al actuar, no solo por tarea

**Decisión.** `billing.overdue` corre en cada tick, y además toda **acción o lectura sobre los cobros de un grupo** ejecuta antes `sweepGroup(groupId)`: una consulta indexada (`charges_overdue_idx`) que, si encuentra cobros `pendiente` vencidos, los procesa en la misma operación. Así un miembro que sube su comprobante a las 00:05 del día siguiente al vencimiento ya está `atrasado` (y retirado) aunque la tarea no haya corrido, igual que en las solicitudes de ingreso (RNF-010-03).

**Consecuencia.** Un `GET` puede escribir (marcar atrasos). Se acepta porque es una transición del sistema, idempotente y protegida por bloqueo.

## R3. Referencias de pago únicas por grupo

**Problema.** La referencia debe ser única por grupo entre comprobantes de cobros **y** de solicitudes de ingreso (RN-010-14), y liberarse al rechazar.

**Decisión.** Tabla `payment_references` con índice único parcial `(group_id, reference_key) WHERE released_at IS NULL`. `reference_key` = referencia en mayúsculas, sin espacios en los extremos, con espacios internos colapsados. No se eliminan guiones ni ceros: `A-001` y `A001` son distintas (se prefiere aceptar un duplicado dudoso antes que rechazar un pago legítimo; el titular verifica en su banco).

**Liberación.** Al rechazar el titular el comprobante (cobro o solicitud) y al reemplazar el miembro su propio comprobante. Un comprobante `confirmado` conserva su reserva para siempre.

## R4. Subida segura de comprobantes

**Decisión.** Flujo de la subida:

1. Validar tamaño (≤ 5 MB, `multer` con `limits`) y tipo real por **firma binaria** (JPG `FF D8 FF`, PNG `89 50 4E 47`, PDF `%PDF-`) antes de tocar nada.
2. Escribir en el almacén con una clave generada por el servidor (`receipts/<groupId>/<chargeId>/<uuid>.<ext>`). Si falla → `503`, sin cambios en la base.
3. Transacción: bloquear el cobro (`SELECT … FOR UPDATE`), revalidar estado y versión, reservar la referencia, insertar el comprobante, pasar el cobro a `en_revision` y registrar el evento.
4. Si la transacción falla, borrar el archivo recién escrito (compensación; un archivo huérfano ocasional es inofensivo porque es privado y no tiene fila).

**Descarga.** Nunca se sirve el archivo por el backend ni por una ruta pública: se entrega una URL firmada de ≤ 10 min (`FileStorage.signedUrl`). El PDF se sirve con `Content-Disposition: attachment` para evitar ejecución en el navegador del titular.

## R5. Cobro de grupos cerrados y congelados

La spec dice que un grupo cerrado «queda en solo lectura» (RF-001-18) y que no genera cobros, pero no dice qué pasa con los cobros ya abiertos. Dejarlos intocables atraparía al titular con comprobantes `en_revision` que no puede confirmar.

**Decisión (aprobada 2026-10-18).** En un grupo **cerrado**, los cobros existentes se pueden seguir saldando (subir, confirmar, rechazar, pago manual, cancelar), pero la tarea de atrasos no actúa sobre ellos (nadie es retirado de un grupo cerrado). La retención de comprobantes (RN-002-06) solo borra los de cobros `pagado` o `cancelado`: si borrara el de un cobro `en_revision`, el titular no podría revisarlo; se borra en la corrida diaria posterior a su cierre. En un grupo **congelado** por titular baneado, todo queda quieto (RF-002-05).
