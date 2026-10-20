# Spec 006 — Panel y reportes

- **Estado:** aprobada
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Revisión por capa:** Camila Fuentes (BD): aprobada · Leonardo Guzman (Backend): aprobada · Adrian Vargas (Frontend): aprobada
- **Prioridad:** P1 (importante)
- **Depende de:** 001, 002, 004
- **Módulo cubierto:** 7 (Panel y reportes)
- **Última actualización:** 2026-10-18

## 1. Contexto y problema

Quien comparte varias suscripciones pierde de vista cuánto gasta al mes, cuánto ahorra por compartir y qué le falta pagar o cobrar. El panel responde esas preguntas de un vistazo y los reportes dejan exportar el historial para quien necesite conciliar cuentas.

## 2. Objetivos

- Mostrar el **gasto mensual** del usuario en suscripciones y su evolución.
- Mostrar cuánto **ahorra** por compartir.
- Mostrar **deudas pendientes** (lo que debe) y **por cobrar** (lo que le deben).
- Mostrar un **calendario de cobros** con las próximas fechas.
- Dar al titular una vista de cobranza de sus grupos y permitir exportar el historial.

## 3. Fuera de alcance

- Proyecciones o predicciones de gasto.
- Reportes contables o tributarios.
- Comparación entre usuarios.
- Panel de administración general (spec 009).
- Gráficos configurables por el usuario.

## 4. Actores y permisos

| Actor | Puede ver |
|---|---|
| Usuario | Su propio gasto, ahorro, deudas y calendario; el estado de sus grupos |
| Titular | Además, el estado de cobranza por miembro de **sus** grupos (nombres, montos y estados, sin comprobantes) |
| Miembro | El resumen del mes del grupo con estados y montos (spec 002, RF-002-16) |

## 5. Historias de usuario

- **HU-006-01:** Como usuario, quiero ver cuánto gasto al mes en suscripciones para controlar mi presupuesto.
- **HU-006-02:** Como usuario, quiero ver cuánto me ahorro compartiendo.
- **HU-006-03:** Como miembro, quiero ver mis deudas pendientes y pagarlas desde ahí.
- **HU-006-04:** Como titular, quiero ver cuánto me falta cobrar y quién está atrasado.
- **HU-006-05:** Como usuario, quiero un calendario con mis próximas fechas de cobro y vencimiento.
- **HU-006-06:** Como usuario, quiero ver la evolución de mi gasto en los últimos meses.
- **HU-006-07:** Como titular o miembro, quiero exportar el historial a un archivo CSV.

## 6. Requisitos funcionales

### Resumen del período
- **RF-006-01:** El panel permite elegir el **mes** (por defecto el actual) y, opcionalmente, filtrar por una suscripción.
- **RF-006-02 (Gasto del mes):** muestra el total de las cuotas propias del usuario en el mes, con el desglose por suscripción. Se muestra además cuánto de ese total ya está `pagado`.
- **RF-006-03 (Ahorro del mes):** muestra el ahorro estimado: suma, por suscripción con precio individual de referencia, de `precio individual − cuota`. Si una suscripción no tiene ese dato, se indica "sin dato" y no se incluye.
- **RF-006-04 (Debo):** muestra el total y la lista de cobros propios `pendiente` y `atrasado`, y por separado los que están `en_revision`. Cada fila lleva a subir el comprobante.
- **RF-006-05 (Me deben):** para el titular, muestra el total y la lista por grupo de cobros `pendiente`, `atrasado` y `en_revision` de sus miembros, con acceso a revisar.
- **RF-006-06 (Cobranza del grupo):** para el titular, por grupo y mes: monto esperado, cobrado y pendiente, porcentaje cobrado y lista de miembros atrasados.

### Gráficos
- **RF-006-07:** Gráfico de barras del **gasto mensual de los últimos 12 meses** (o desde el primer mes con datos).
- **RF-006-08:** Gráfico de barras horizontales del gasto del mes **por servicio**.
- **RF-006-09:** Gráfico del **ahorro acumulado** de los últimos 12 meses.
- **RF-006-10:** Cada gráfico tiene una alternativa en **tabla** con los mismos datos y no depende solo del color para distinguir series.

### Calendario
- **RF-006-11:** El calendario muestra, para el mes elegido, las **fechas de corte** de los grupos del usuario y los **vencimientos** de sus cobros abiertos. Hay también una lista "Próximos 30 días".
- **RF-006-12:** Cada evento indica servicio, monto (si ya existe el cobro o como estimado) y rol del usuario (miembro o titular).

### Historial y exportación
- **RF-006-13:** El usuario puede ver su historial de cobros (mes, servicio, monto, estado, fecha de pago) con filtros por mes, servicio y estado.
- **RF-006-14:** El usuario puede **exportar a CSV** su historial. El titular puede exportar además el historial completo de un grupo.
- **RF-006-15:** El CSV usa codificación UTF-8 con BOM (para abrirse bien en Excel), separador coma, montos con punto decimal y fechas en formato `AAAA-MM-DD` en hora de La Paz.

### Estados vacíos
- **RF-006-16:** Si el usuario no tiene grupos o no hay datos del período, el panel muestra un estado vacío con una acción clara (crear o unirse a un grupo).

## 7. Requisitos no funcionales

- **RNF-006-01 (Rendimiento):** el panel carga en menos de 1 segundo (percentil 95) con hasta 20 suscripciones y 12 meses de datos.
- **RNF-006-02 (Frescura):** los datos reflejan un cambio de estado de cobro en menos de 1 minuto.
- **RNF-006-03 (Seguridad):** un usuario solo ve datos de sus grupos; el titular no ve comprobantes en los reportes.
- **RNF-006-04 (Seguridad del CSV):** las celdas de texto que empiecen con `=`, `+`, `-` o `@` se escapan para evitar inyección de fórmulas.
- **RNF-006-05 (Usabilidad):** diseño pensado primero para celular; los gráficos se adaptan al ancho y son legibles.
- **RNF-006-06 (Exactitud):** los totales se calculan con enteros en centavos, en la base de datos, y la suma de las partes coincide con el total mostrado.

## 8. Reglas de negocio

- **RN-006-01 (Período):** un cobro pertenece al mes de su período (`AAAA-MM`, fecha de corte en hora de La Paz), no al mes en que se pagó.
- **RN-006-02 (Gasto):** el gasto propio de un **miembro** es la suma de sus cobros del período distintos de `cancelado`. El de un **titular** es su **cuota de referencia** del ciclo (RN-001-10, RN-002-09). Esto es el gasto "comprometido"; "pagado" es la parte en estado `pagado`.
- **RN-006-03 (Ahorro):** `ahorro = precio_individual_en_Bs − cuota`, usando el precio individual de referencia copiado en la suscripción (RN-001-12) y su tipo de cambio. Se muestra como **estimado** y puede ser cero o negativo si el plan compartido no conviene.
- **RN-006-04 (Debo):** suma de cobros propios en `pendiente` y `atrasado`. Los `en_revision` se muestran aparte y no se suman a la deuda.
- **RN-006-05 (Me deben):** suma de cobros de los miembros en `pendiente`, `atrasado` y `en_revision` de grupos donde el usuario es titular.
- **RN-006-06:** Los datos históricos usan siempre las copias (precio, tipo de cambio, cuota) guardadas en cada cobro y ciclo, no los valores actuales de la suscripción.
- **RN-006-07:** Los cobros `cancelado` no cuentan en gasto, deudas ni cobranza, pero aparecen en el historial.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Usuario nuevo sin grupos | Estado vacío con acciones de crear o unirse |
| Mes sin cobros | Valores en cero y gráfico sin barra, no un error |
| Suscripción sin precio individual de referencia | El ahorro la excluye y se avisa "sin dato" |
| Ahorro negativo | Se muestra con signo y una nota explicativa |
| Cuota de titular en un mes anterior a que el sistema guardara ciclos | No aplica: todos los grupos tienen ciclo desde su creación |
| Grupo cerrado | Aparece en historial y en meses pasados; no en calendario futuro |
| Titular con 20 grupos | El panel agrupa y pagina las listas |
| Cambió el tipo de cambio de una suscripción | Los meses pasados no cambian; el mes actual usa el valor vigente al generar el cobro |
| Exportación con nombres que empiezan con `=` | La celda se escapa |
| Meses de 28 a 31 días | El calendario ubica la fecha de corte ajustada (RN-001-06) |
| Dos estados cambian mientras se carga el panel | Se muestra el último estado consistente al recargar |

## 10. Criterios de aceptación

- **CA-006-01:** Dado un miembro con cobros de Bs 30,00 y Bs 25,50 en el mes, cuando abre el panel, entonces el gasto del mes es Bs 55,50.
- **CA-006-02:** Dado un cobro `cancelado` en el mes, cuando se calcula el gasto, entonces no se suma.
- **CA-006-03:** Dado un titular con una cuota de referencia de Bs 33,34 en un ciclo, cuando ve su gasto, entonces incluye Bs 33,34.
- **CA-006-04:** Dado un plan con precio individual de USD 10,00, tipo de cambio 6,96 y cuota de Bs 20,00, cuando se calcula el ahorro, entonces es Bs 49,60.
- **CA-006-05:** Dada una suscripción sin precio individual, cuando se calcula el ahorro, entonces se excluye y se muestra "sin dato".
- **CA-006-06:** Dados cobros `pendiente` por Bs 10,00 y `atrasado` por Bs 15,00, cuando se calcula "Debo", entonces es Bs 25,00.
- **CA-006-07:** Dado un cobro `en_revision`, cuando se calcula "Debo", entonces no se suma y aparece en la sección "En revisión".
- **CA-006-08:** Dado un titular con 3 cobros `pendiente`, 1 `atrasado` y 1 `en_revision` de miembros, cuando abre "Me deben", entonces el total suma los 5 y se listan por grupo.
- **CA-006-09:** Dado un grupo con esperado Bs 90,00 y cobrado Bs 60,00, cuando el titular ve la cobranza, entonces muestra 67 % cobrado (redondeado) y Bs 30,00 pendiente.
- **CA-006-10:** Dado un cambio de tipo de cambio hoy, cuando se consulta un mes anterior, entonces los montos del mes anterior no cambian.
- **CA-006-11:** Dado un usuario con 14 meses de datos, cuando ve el gráfico de evolución, entonces muestra los últimos 12.
- **CA-006-12:** Dado cualquier gráfico, cuando el usuario cambia a "ver tabla", entonces ve los mismos valores.
- **CA-006-13:** Dado el mes de febrero y un grupo con día de cobro 31, cuando se abre el calendario, entonces el evento aparece el 28 (o 29).
- **CA-006-14:** Dado un usuario sin grupos, cuando abre el panel, entonces ve el estado vacío con las acciones disponibles.
- **CA-006-15:** Dado el historial exportado, cuando se abre en una hoja de cálculo, entonces los acentos se ven bien y los montos son numéricos.
- **CA-006-16:** Dado un nombre de miembro `=CMD()`, cuando se exporta, entonces la celda se escapa y no se interpreta como fórmula.
- **CA-006-17:** Dado un miembro, cuando intenta exportar el historial completo de un grupo, entonces recibe `403`; solo puede exportar el suyo.
- **CA-006-18:** Dado un usuario, cuando consulta el panel de otro mediante una URL manipulada, entonces recibe `404`.
- **CA-006-19:** Dado un panel con 20 suscripciones y 12 meses, cuando se carga, entonces responde en menos de 1 segundo (p95) en el entorno de pruebas.
- **CA-006-20:** Dado un cobro que pasa a `pagado`, cuando pasa menos de 1 minuto, entonces el panel lo refleja al recargar.
- **CA-006-21:** Dado un ahorro negativo, cuando se muestra, entonces tiene signo menos y la nota explicativa.
- **CA-006-22:** Dada la suma del desglose por suscripción, cuando se compara con el total, entonces coinciden exactamente en centavos.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] **Cálculo del ahorro** (P24). **Decidido:** precio individual de referencia del catálogo (spec 004) vs. cuota; "estimado".
- [RESUELTO 2026-10-17] **Gráficos imprescindibles** (P25). **Decidido:** los tres de RF-006-07 a RF-006-09.
- [RESUELTO 2026-10-17] **Librería de gráficos.** **Decidido:** Recharts (se define en el plan de esta spec).
- [RESUELTO 2026-10-17] ¿El titular necesita ver cobranza por miembro a lo largo del tiempo (historial por persona)? **Decidido:** sí, dentro del historial del grupo con filtro por miembro.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Equipo |
| 2026-10-17 | Ronda 2 de decisiones: se aceptan las propuestas de la sección 11 | Equipo |
| 2026-10-18 | Spec aprobada por las tres capas (BD, Backend y Frontend) | Equipo |
| 2026-10-20 | Convergencia: excepción de lectura de vistas sin rol `0102`; límites de paginación, nombre del CSV de grupo y archivo de rendimiento | Equipo (`/speckit-converge`) |
