# Banco de preguntas para afinar Vaquita

Preguntas para especificar mejor la app. Cada una indica dónde quedó reflejada o qué falta.

Estados:

- **Decidida:** el equipo respondió y la spec ya lo refleja.
- **Propuesta:** hay una propuesta escrita en la spec que el equipo todavía debe confirmar o cambiar.
- **Pendiente:** no hay propuesta en ninguna spec.

Capas afectadas: BD (Camila), BE (Leonardo) y FE (Adrian).

## Decisiones generales

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P5 | ¿Qué stack usa cada capa? | BD, BE, FE | Decidida. Stack final en `context/stack.md` (Next.js, NestJS, PostgreSQL, TypeScript) |
| P6 | ¿Dónde se despliega la demo? | BE | Decidida en parte. Frontend en Vercel, backend y PostgreSQL en Render; falta definir cómo se cubren los límites del plan gratuito (spec 000) |
| P7 | ¿Plazo y alcance? | Todos | Decidida. Sin recorte por tiempo: entran los 10 módulos, en orden P0 → P1 → P2 |
| P8 | ¿La materia pide diagramas o documentos específicos (ER, casos de uso, UML)? | Todos | Decidida el 2026-10-17. El profesor no pidió diagramas, solo documentos; no se hacen diagramas |

## Reglas de cobro (specs 001 y 002)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P1 | ¿El titular tiene cobro propio? | BD, BE | Decidida. No (spec 001, RN-001-10) |
| P2 | ¿Cuándo empieza a pagar quien entra a mitad de mes? | BE, BD | Decidida y reemplazada el 2026-10-17. Nadie entra a mitad de período: el ingreso solo se abre durante los 3 primeros días y se paga el período que empezó (spec 001, RF-001-22; spec 010, RN-010-12) |
| P3 | ¿Cuántos días de gracia hay antes de marcar atrasado? | BE | Decidida. 3 días (spec 002, RF-002-03) |
| P4 | ¿Cómo comparte el titular sus datos de pago? | BD, BE, FE | Decidida. Texto + imagen de QR (spec 001, RF-001-20) |
| P15 | ¿Una persona puede ser titular de varias suscripciones? ¿Hay límite de grupos por usuario? | BE | Decidida el 2026-10-17. Hasta 5 grupos como titular y sin límite como miembro (spec 001, RN-001-14) |
| P16 | ¿Otras monedas además de USD/Bs? ¿Un tipo de cambio por suscripción? | BD, BE | Decidida el 2026-10-17. Solo USD y Bs; tipo de cambio por suscripción (spec 001) |
| P17 | ¿El titular puede "saltar" un mes sin cobrar? | BE | Decidida el 2026-10-17. No: el titular no puede saltar un mes |
| P18 | ¿Cuotas desiguales entre miembros? | BE, FE | Decidida el 2026-10-17. No en esta versión: división equitativa (spec 001, fuera de alcance) |
| P19 | ¿Cuánto tiempo se guardan los comprobantes? | BD, BE | Decidida el 2026-10-17. 2 meses tras cerrar el grupo (spec 002, RN-002-06); el chat y los comprobantes de una solicitud también se conservan 2 meses (spec 010, RF-010-07) |
| P20 | ¿Se puede pagar por adelantado o en partes? | BE | Decidida el 2026-10-17. No (spec 002, fuera de alcance) |
| P33 | ¿Hay un plazo máximo de atraso y qué pasa si un miembro nunca paga? | BE, BD, FE | Decidida el 2026-10-17. El miembro tiene 3 días para pagar y si no lo hace se lo retira del grupo; su cobro queda como deuda visible (spec 002, RF-002-14; spec 001, RF-001-23) |
| P23 | ¿El titular ve el historial de miembros que ya salieron? | BD | Decidida el 2026-10-17. Sí (spec 002, §11) |

## Usuarios y catálogo (specs 003 y 004)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P9 | ¿Cómo se registra el usuario? | BE, FE | Decidida el 2026-10-17. Correo, celular verificado, CI y contraseña; Google fuera de alcance (spec 003) |
| P10 | ¿Se verifica el correo? ¿Cómo se recupera la contraseña? | BE | Decidida el 2026-10-17. Sin verificación del correo; se verifica el celular con un código; recuperación por enlace al correo (spec 003) |
| P11 | ¿Qué datos tiene el perfil? | BD, FE | Decidida el 2026-10-17. Nombre, correo, celular verificado y CI, ambos obligatorios y únicos (spec 003) |
| P12 | ¿Qué ven los miembros unos de otros? | BE, FE | Decidida el 2026-10-17. Nombre y celular entre titular y miembros; nunca el correo ni la CI (spec 003, RN-003-03) |
| P13 | ¿Qué plataformas y planes entran al catálogo inicial? | BD | Decidida el 2026-10-17. Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video (spec 004); Camila verifica precios |
| P14 | ¿Se permite un servicio fuera del catálogo? | BD, BE | Decidida el 2026-10-17. Sí, con nombre libre (spec 001/004) |

## Notificaciones, panel y extras (specs 005 a 009)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P21 | ¿Qué canal de recordatorio? | BE, FE | Decidida el 2026-10-17. En la app + correo; Telegram opcional en P1; WhatsApp solo con enlace manual (spec 005) |
| P22 | ¿Cuántos días antes se avisa y cada cuánto si hay atraso? | BE | Decidida el 2026-10-17. 2 días antes del corte y 1 antes del vencimiento; sin recordatorios de atraso porque a los 3 días se retira al miembro (spec 005) |
| P24 | ¿Cómo se calcula el ahorro? | BD, BE | Decidida el 2026-10-17. Precio individual de referencia del catálogo vs. cuota, como estimado (spec 006) |
| P25 | ¿Qué gráficos son imprescindibles? | FE | Decidida el 2026-10-17. Gasto 12 meses, gasto por servicio y ahorro acumulado (spec 006) |
| P26 | ¿Cómo se calcula la reputación y quién la ve? | BD, BE | Decidida el 2026-10-17. Calificación de 0 a 5 estrellas según pagos puntuales sobre total en 12 meses, calculada y no votada; ranking visible en el grupo (spec 007) |
| P27 | ¿Cupos libres: quién ve, cómo se pide unirse y quién aprueba? | BD, BE, FE | Decidida el 2026-10-17. Usuarios autenticados; la solicitud sigue el flujo de la spec 010 y solo se abre durante la ventana de ingreso (spec 008) |
| P28 | ¿Quién administra el sistema y qué necesita? | BE, FE | Decidida el 2026-10-17. El equipo funciona como administrador; catálogo, usuarios, moderación, reclamos y estadísticas (spec 009) |

## Ingreso con pago previo, chat y sanciones (spec 010)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P34 | ¿Cómo entra una persona a un grupo? | BD, BE, FE | Decidida el 2026-10-17. Solicitud con chat, pago previo y confirmación del titular (spec 010) |
| P35 | ¿Cuánto paga al ingresar? | BE, BD | Decidida el 2026-10-17. La cuota del mes dividida entre los miembros del grupo, contando a la persona (spec 010, RN-010-01) |
| P36 | ¿Qué plazos hay? | BE, FE | Decidida el 2026-10-17. 15 minutos para pagar y 60 para que el titular confirme, con recordatorio a los 30 (spec 010, RF-010-17) |
| P37 | ¿Qué admite el chat? | BE, FE | Decidida el 2026-10-17. Texto y fotos, por solicitud (spec 010, RF-010-05) |
| P38 | ¿Cuántos tipos de reclamo hay? | BE | Decidida el 2026-10-17. Dos: pago sin ingreso (lo abre el solicitante) y comprobante falso (lo abre el titular), con imagen de evidencia opcional (spec 010, RF-010-21) |
| P39 | ¿Se pagan por adelantado los meses siguientes? | BE | Decidida el 2026-10-17. No; se mantienen los cobros de la spec 002 |
| P40 | ¿Qué pasa con el titular que estafa? | BE, BD | Decidida el 2026-10-17. Baneo de la cuenta decidido por un administrador; se bloquean correo, celular y CI, y rige para titulares y solicitantes (specs 003, 009 y 010) |
| P41 | ¿Quién puede ser titular? | BE, BD | Decidida el 2026-10-17. Titular habilitado con 4,5 estrellas y al menos 6 cobros considerados, o habilitado por un administrador; vale para todos los grupos (spec 001, RF-001-21; spec 007, RF-007-15) |
| P42 | ¿Cómo se define el período en curso del pago de ingreso y qué pasa si se ingresa cerca del corte? | BE, BD | Decidida el 2026-10-17. Con la ventana de ingreso se paga siempre el período que acaba de empezar. Abierto: confirmar que los "3 primeros días" cuentan desde el corte de cada grupo y la ventana inicial de un grupo nuevo (spec 010, sección 11) |
| P43 | ¿Hay prórroga del plazo de pago, referencia obligatoria y única, y reclamo del titular contra un comprobante falso? | BE | Decidida el 2026-10-17. Una prórroga de 15 minutos; referencia obligatoria y única por grupo; el titular puede reclamar un comprobante falso (spec 010) |
| P44 | ¿Quién puede entrar y cuándo? | BE, BD, FE | Decidida el 2026-10-17. Solo durante los 3 primeros días de cada período de cobro (spec 001, RF-001-22) |
| P45 | ¿Qué datos de identidad se piden y se bloquean? | BD, BE | Decidida el 2026-10-17. Celular verificado con código y CI, únicos; se bloquean correo, celular y CI (spec 003, `context/decisiones/0005-identidad-con-cedula-y-celular-verificado.md`). Abierto: canal SMS o WhatsApp, formato de la CI y alias de correo |
| P46 | ¿Qué ve un grupo cuyo titular fue baneado? | FE, BE | Decidida el 2026-10-17. El texto "titular baneado" y la opción de buscar otro grupo (spec 009, RF-009-22). Abierto: qué pasa con los cobros abiertos (propuesta: congelarlos) |
| P47 | ¿Quién revisa los reclamos y cómo se apela? | BE, FE | Decidida el 2026-10-17. El equipo funciona como administrador y la apelación es por un correo de contacto; otro administrador puede revisar un baneo (spec 009) |
| P48 | ¿Qué pasa si un miembro retirado por falta de pago quiere volver? | BE | Propuesta. No puede abrir una solicitud al mismo grupo mientras tenga el cobro atrasado (spec 010, RN-010-13; spec 002, RN-002-11) |

## Calidad y operación

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P29 | ¿Cuántos usuarios se esperan en la demo? | BE, BD | Decidida el 2026-10-17. Menos de 100 usuarios (spec 000, RNF-000-05) |
| P30 | ¿Debe funcionar sin conexión? ¿Prioridad celular o escritorio? | FE | Decidida el 2026-10-17. Requiere internet; diseño celular primero (spec 000 y 003) |
| P31 | ¿Hay requisitos de privacidad (política de datos, borrado de cuenta)? | BD, BE | Decidida el 2026-10-17. Política de datos corta aceptada al registrarse; eliminar cuenta queda fuera de alcance por ahora (spec 003, RF-003-23) |
| P32 | ¿Habrá marca propia (logo, colores)? | FE | Decidida el 2026-10-17. Marca simple, a cargo de Adrian |

## Seguimiento

Las preguntas propuestas y pendientes se revisan en reunión y cada respuesta se escribe en la spec correspondiente. Al resolverse una pregunta, su estado pasa a decidida y se anota en qué parte de la spec quedó. Lo que detecta `/speckit-clarify` en cada spec se suma a este banco o directamente a la spec.
