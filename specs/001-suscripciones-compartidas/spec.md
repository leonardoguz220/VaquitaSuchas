# Spec 001 — Suscripciones compartidas

- **Estado:** borrador
- **Líder de la spec:** Camila Fuentes (BD)
- **Revisión por capa:** Leonardo Guzman (Backend): pendiente · Adrian Vargas (Frontend): pendiente · Camila Fuentes (BD): pendiente
- **Prioridad:** P0 (MVP)
- **Depende de:** 003 (Usuarios y autenticación), 004 (Catálogo de servicios)
- **Módulos cubiertos:** 3 (Suscripciones compartidas) y 4 (División y moneda)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Los grupos de amigos, familias o compañeros de departamento comparten cuentas de plataformas como Netflix o Spotify. Hoy una persona (el titular) paga el total y debe recordar quién le debe cuánto, convertir de dólares a bolivianos y perseguir a cada miembro. Sin un registro claro hay confusiones y conflictos.

Esta spec define cómo se **crea una suscripción compartida**, cómo se **invita y administra a los miembros** y cómo se **calcula la cuota de cada uno en bolivianos**. Es la base sobre la que la spec 002 genera los cobros mensuales.

## 2. Objetivos

- Que un usuario registrado cree una suscripción compartida y quede como titular.
- Que otros usuarios se unan mediante un código de invitación.
- Que cada miembro vea cuánto le toca pagar en Bs, calculado de forma automática, justa y reproducible.
- Que el titular gestione a los miembros (quitar, transferir titularidad, cerrar el grupo).

## 3. Fuera de alcance

- Generación de cobros, comprobantes y confirmaciones (spec 002).
- Envío de invitaciones por correo o notificaciones push (spec 005; aquí solo se comparte un código/enlace).
- Publicación y búsqueda de cupos libres (spec 008).
- Obtención automática del tipo de cambio desde una API externa.
- Cuotas desiguales entre miembros (en el MVP la división es **equitativa**).
- Pagos reales dentro de la app.

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Usuario autenticado | Crear suscripciones; unirse con un código; ver sus grupos | Ver grupos a los que no pertenece |
| Titular | Editar datos y tipo de cambio; regenerar el código; quitar miembros; transferir la titularidad; cerrar el grupo | Abandonar el grupo sin transferir la titularidad o cerrarlo |
| Miembro | Ver datos del grupo, lista de miembros y su cuota; abandonar el grupo | Editar el grupo; quitar a otros; ver otros grupos |

## 5. Historias de usuario

- **HU-001-01:** Como titular, quiero crear una suscripción con su precio, moneda, tipo de cambio y día de cobro, para que el sistema calcule las cuotas.
- **HU-001-02:** Como titular, quiero un código de invitación para compartirlo con mis amigos.
- **HU-001-03:** Como invitado, quiero unirme con un código y ver cuánto me toca pagar en bolivianos.
- **HU-001-04:** Como titular, quiero quitar a un miembro o regenerar el código, para controlar quién participa.
- **HU-001-05:** Como miembro, quiero ver quiénes están en el grupo y cuánto paga cada uno, para tener claridad.
- **HU-001-06:** Como miembro, quiero abandonar un grupo, para dejar de compartir una suscripción.
- **HU-001-07:** Como titular, quiero actualizar el tipo de cambio o el precio, para reflejar cambios reales.
- **HU-001-08:** Como titular, quiero transferir la titularidad o cerrar el grupo, para poder retirarme.

## 6. Requisitos funcionales

### Creación
- **RF-001-01:** El sistema debe permitir crear una suscripción eligiendo un servicio y plan del catálogo (spec 004) o ingresando un servicio personalizado con nombre.
- **RF-001-02:** Datos obligatorios: servicio (o nombre personalizado), precio total mensual, moneda del precio (`USD` o `BS`), día de cobro (1–31) y cupos totales (incluido el titular, mínimo 2).
- **RF-001-03:** Si la moneda es `USD`, el tipo de cambio (Bs por 1 USD) es obligatorio. Si es `BS`, no se solicita.
- **RF-001-04:** Al crear, el usuario queda como titular y primer miembro, y el sistema genera un código de invitación único.
- **RF-001-05:** El precio por defecto del plan del catálogo se propone, pero el titular puede modificarlo.

### Invitación y unión
- **RF-001-06:** El código de invitación es único, de 8 caracteres alfanuméricos sin caracteres ambiguos (sin `0/O`, `1/I/L`).
- **RF-001-07:** Un usuario autenticado puede unirse ingresando el código, siempre que existan cupos libres, el grupo esté activo y no sea ya miembro.
- **RF-001-08:** El titular puede regenerar el código; el código anterior deja de funcionar de inmediato.
- **RF-001-09:** El titular puede activar o pausar la recepción de nuevos miembros.

### División y moneda
- **RF-001-10:** La cuota se calcula dividiendo el precio total entre el **número de miembros actuales**, no entre los cupos totales (ver RN-001-02).
- **RF-001-11:** Si el precio está en `USD`, el total en Bs se calcula como `precio_usd × tipo_de_cambio`, redondeado al centavo.
- **RF-001-12:** El sistema debe recalcular las cuotas cuando cambia el número de miembros, el precio o el tipo de cambio.
- **RF-001-13:** Cada miembro ve su cuota estimada actual en Bs y el desglose (total, nº de miembros, tipo de cambio).

### Gestión
- **RF-001-14:** El titular puede editar nombre, precio, tipo de cambio, día de cobro y cupos totales (no puede reducir cupos por debajo del número de miembros actuales).
- **RF-001-15:** El titular puede quitar a un miembro. Los cobros ya generados de ese miembro se conservan en el historial.
- **RF-001-16:** Un miembro puede abandonar el grupo. Si tiene cobros `pendiente`, `en_revision` o `atrasado`, debe saldarlos antes o el titular debe cancelarlos (ver CA-001-14).
- **RF-001-17:** El titular puede transferir la titularidad a otro miembro; el cambio requiere que el destinatario sea miembro activo.
- **RF-001-18:** El titular puede cerrar el grupo; un grupo cerrado no genera nuevos cobros y queda en modo solo lectura.
- **RF-001-19:** Cada usuario puede ver la lista de sus grupos (como titular y como miembro) con su rol, cuota y estado.
- **RF-001-20 (Datos de pago):** el titular puede configurar en la suscripción sus datos de pago: un **texto** (banco, cuenta, nombre; máx. 500 caracteres) y/o una **imagen de QR** (JPG/PNG, máx. 2 MB) [NECESITA ACLARACIÓN: confirmar el límite de 2 MB]. Los miembros del grupo los ven en la pantalla de cobro. Si el titular no los configuró, se muestra el aviso "El titular aún no configuró sus datos de pago". _(Decidido 2026-10-17)_

## 7. Requisitos no funcionales

- **RNF-001-01 (Seguridad):** Todos los permisos se validan en el servidor. Un usuario nunca recibe datos de grupos ajenos (respuesta `404`, no `403`, para no revelar existencia).
- **RNF-001-02 (Seguridad):** El código de invitación se genera con una fuente aleatoria criptográfica y la consulta de códigos tiene límite de intentos (máx. 10 intentos fallidos por usuario cada 15 minutos).
- **RNF-001-03 (Precisión):** Todos los montos se almacenan en centavos enteros (ver `context/dominio.md`).
- **RNF-001-04 (Usabilidad):** El flujo de unirse con código debe completarse en máximo 3 pasos desde el celular.
- **RNF-001-05 (Rendimiento):** Listar los grupos de un usuario responde en menos de 500 ms con hasta 50 grupos.

## 8. Reglas de negocio

- **RN-001-01:** Un grupo tiene exactamente **un titular**, que siempre es miembro.
- **RN-001-02 (Reparto):** `cuota_base = floor(total_bs_centavos / n_miembros)`. El resto `total − cuota_base × n` (0 a n−1 centavos) se suma a la cuota **del titular**, de modo que `Σ cuotas == total` siempre.
- **RN-001-03:** El cobro usa las cuotas calculadas **al momento de generarse el cobro** (spec 002). Cambios posteriores no alteran cobros ya generados.
- **RN-001-04:** El tipo de cambio es un valor decimal positivo con hasta 4 decimales (ej. `6.9600`).
- **RN-001-05:** Un usuario no puede pertenecer dos veces al mismo grupo.
- **RN-001-06:** El día de cobro 29, 30 o 31 en meses más cortos se ajusta al último día del mes.
- **RN-001-07:** Un grupo cerrado no admite nuevos miembros ni cambios, salvo lectura.
- **RN-001-08:** Un titular no puede abandonar el grupo: debe transferir la titularidad o cerrarlo.
- **RN-001-09:** Límites: precio total entre Bs 1,00 y Bs 5.000,00 (equivalente), cupos entre 2 y 20.
- **RN-001-10 (Titular sin cobro propio):** el titular cuenta como miembro en la división (RF-001-10), pero **no genera cobro**: ya paga la plataforma. Su cuota se muestra solo como referencia y para calcular el ahorro. _(Decidido 2026-10-17)_
- **RN-001-12 (Copia del catálogo):** al crear la suscripción se guarda una copia del nombre del servicio, nombre del plan, logo, cupos y precio individual de referencia del catálogo (spec 004, RF-004-08); el historial no depende de cambios posteriores del catálogo.
- **RN-001-13:** si la suscripción se crea desde un plan del catálogo, los cupos totales no pueden superar los cupos máximos del plan (spec 004, RN-004-03).
- **RN-001-11 (Alta a mitad de mes):** un miembro que se une después de generado el cobro del período en curso **no paga ese período**; su primer cobro es el del siguiente período. _(Decidido 2026-10-17)_

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Código inexistente, regenerado o de grupo cerrado | Error genérico "Código inválido" (sin revelar cuál de los casos) |
| Grupo lleno | Error "No hay cupos disponibles" |
| Usuario ya es miembro | Error "Ya eres parte de este grupo" |
| Precio en USD sin tipo de cambio | Error de validación en el campo |
| Tipo de cambio ≤ 0 o con más de 4 decimales | Error de validación |
| Total no divisible entre miembros (ej. Bs 100,00 entre 3) | Cuotas 33,33 / 33,33 / 33,34; el centavo extra lo asume el titular |
| Titular intenta reducir cupos por debajo del nº de miembros | Error indicando el mínimo permitido |
| Titular quiere abandonar | Error con la instrucción de transferir o cerrar |
| Se quita a un miembro con cobros sin pagar | Se advierte al titular; los cobros se conservan y solo pasan a `cancelado` si el titular lo decide (RF-002-13, RN-002-07) |
| Dos usuarios se unen al mismo tiempo al último cupo | Solo uno lo logra; el otro recibe "No hay cupos disponibles" (control de concurrencia) |
| Día de cobro 31 en febrero | Se usa el 28 (o 29 en bisiesto) |
| Miembro se une el mismo día de la fecha de corte, después de generados los cobros | Su primer cobro es el del siguiente período (RN-001-11) |
| QR de pago con formato o tamaño inválido | Error de validación; se conserva el QR anterior si había |
| Usuario con sesión expirada intenta unirse | Se redirige a iniciar sesión y se conserva el código para reintentar |

## 10. Criterios de aceptación

- **CA-001-01:** Dado un usuario autenticado, cuando crea una suscripción válida, entonces queda como titular y miembro y se genera un código de 8 caracteres único.
- **CA-001-02:** Dado un precio en USD sin tipo de cambio, cuando intenta crear la suscripción, entonces recibe un error de validación y no se crea nada.
- **CA-001-03:** Dado un precio en BS, cuando crea la suscripción, entonces no se solicita ni guarda tipo de cambio.
- **CA-001-04:** Dado un precio de USD 10,00 y tipo de cambio 6,96, cuando se calcula el total, entonces es Bs 69,60.
- **CA-001-05:** Dado un total de Bs 100,00 y 3 miembros, cuando se calculan las cuotas, entonces son 33,34 (titular) + 33,33 + 33,33 = 100,00.
- **CA-001-06:** Dado un grupo con cupos libres, cuando un usuario ingresa un código válido, entonces se une y ve su cuota recalculada.
- **CA-001-07:** Dado un grupo lleno, cuando otro usuario intenta unirse, entonces recibe "No hay cupos disponibles".
- **CA-001-08:** Dado que un usuario ya es miembro, cuando intenta unirse otra vez, entonces el sistema lo rechaza sin duplicarlo.
- **CA-001-09:** Dado un código regenerado, cuando alguien usa el código anterior, entonces recibe "Código inválido".
- **CA-001-10:** Dado un usuario que no es miembro, cuando consulta el detalle del grupo, entonces recibe `404`.
- **CA-001-11:** Dado un miembro (no titular), cuando intenta editar el grupo o quitar a otro, entonces recibe `403`.
- **CA-001-12:** Dado que se une un nuevo miembro, cuando se recalculan las cuotas, entonces la suma de cuotas coincide exactamente con el total.
- **CA-001-13:** Dado un titular, cuando transfiere la titularidad a otro miembro, entonces el anterior pasa a miembro y el nuevo es titular, con un único titular en todo momento.
- **CA-001-14:** Dado un miembro con cobros sin pagar, cuando intenta abandonar el grupo, entonces el sistema se lo impide hasta que los salde o el titular los cancele.
- **CA-001-15:** Dado un titular, cuando intenta abandonar el grupo, entonces recibe el error indicando transferir o cerrar.
- **CA-001-16:** Dado un grupo cerrado, cuando alguien intenta unirse o editar, entonces el sistema lo rechaza.
- **CA-001-17:** Dado un día de cobro 31, cuando se calcula la fecha en febrero, entonces resulta el 28 (29 en bisiesto).
- **CA-001-18:** Dado un usuario con 10 intentos fallidos de código en 15 minutos, cuando intenta de nuevo, entonces recibe un bloqueo temporal.
- **CA-001-19:** Dados dos usuarios uniéndose simultáneamente al último cupo, entonces exactamente uno se une.
- **CA-001-20:** Dado un usuario con varios grupos, cuando abre "Mis suscripciones", entonces ve solo los suyos, con su rol y su cuota.
- **CA-001-21:** Dado un grupo de 3 miembros (incluido el titular), cuando la cuota total es Bs 90,00, entonces el titular ve su cuota como referencia (Bs 30,00) y no se le genera ningún cobro.
- **CA-001-22:** Dado un miembro que se une después de que se generó el cobro del mes, cuando llega la siguiente fecha de corte, entonces recibe su primer cobro y del mes anterior no tiene ninguno.
- **CA-001-23:** Dado un titular que configuró texto y QR de pago, cuando un miembro abre su cobro, entonces ve ambos; si no los configuró, ve el aviso correspondiente.

## 11. Preguntas abiertas

- [RESUELTO 2026-10-17] Alta a mitad de mes: paga desde el siguiente cobro (RN-001-11).
- [RESUELTO 2026-10-17] El titular no tiene cobro propio (RN-001-10).
- [RESUELTO] Cobros de un miembro quitado: se conservan; el titular decide si cancelarlos (alineado con spec 002, RN-002-07).
- [NECESITA ACLARACIÓN] ¿El servicio personalizado (fuera del catálogo) es posible en el MVP? **Propuesta:** sí, solo con nombre libre.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Camila Fuentes |
| 2026-10-17 | Se agregan RN-001-12 y RN-001-13 por el catálogo (spec 004) | Equipo |
| 2026-10-17 | Se resuelven: titular sin cobro propio, alta a mitad de mes y datos de pago (RN-001-10, RN-001-11, RF-001-20, CA-001-21 a 23) | Equipo (ronda 1 de preguntas) |
