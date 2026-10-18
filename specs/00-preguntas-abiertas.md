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
| P8 | ¿La materia pide diagramas o documentos específicos (ER, casos de uso, UML)? | Todos | Pendiente: confirmar con el profesor |

## Reglas de cobro (specs 001 y 002)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P1 | ¿El titular tiene cobro propio? | BD, BE | Decidida. No (spec 001, RN-001-10) |
| P2 | ¿Cuándo empieza a pagar quien entra a mitad de mes? | BE, BD | Decidida y reemplazada el 2026-10-17. Paga la cuota del período en curso al ingresar y desde el siguiente corte recibe cobros regulares (spec 001, RN-001-11; spec 010, RN-010-01 y RN-010-03) |
| P3 | ¿Cuántos días de gracia hay antes de marcar atrasado? | BE | Decidida. 3 días (spec 002, RF-002-03) |
| P4 | ¿Cómo comparte el titular sus datos de pago? | BD, BE, FE | Decidida. Texto + imagen de QR (spec 001, RF-001-20) |
| P15 | ¿Una persona puede ser titular de varias suscripciones? ¿Hay límite de grupos por usuario? | BE | Pendiente (la spec 001 no define límite) |
| P16 | ¿Otras monedas además de USD/Bs? ¿Un tipo de cambio por suscripción? | BD, BE | Propuesta. Solo USD y Bs; tipo de cambio por suscripción (spec 001) |
| P17 | ¿El titular puede "saltar" un mes sin cobrar? | BE | Pendiente |
| P18 | ¿Cuotas desiguales entre miembros? | BE, FE | Propuesta. No en esta versión: división equitativa (spec 001, fuera de alcance) |
| P19 | ¿Cuánto tiempo se guardan los comprobantes? | BD, BE | Propuesta. 12 meses tras cerrar el grupo (spec 002, §11) |
| P20 | ¿Se puede pagar por adelantado o en partes? | BE | Propuesta. No (spec 002, fuera de alcance) |
| P33 | ¿Hay un plazo máximo de atraso y qué pasa si un miembro nunca paga? | BE, BD, FE | Propuesta. Sin acciones automáticas; aviso al titular a los 30 días o con 2 cobros atrasados, y total adeudado por miembro visible (spec 002, sección 11) |
| P23 | ¿El titular ve el historial de miembros que ya salieron? | BD | Propuesta. Sí (spec 002, §11) |

## Usuarios y catálogo (specs 003 y 004)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P9 | ¿Cómo se registra el usuario? | BE, FE | Propuesta. Correo y contraseña; Google fuera de alcance (spec 003) |
| P10 | ¿Se verifica el correo? ¿Cómo se recupera la contraseña? | BE | Propuesta. Sin verificación obligatoria; recuperación por enlace al correo (spec 003) |
| P11 | ¿Qué datos tiene el perfil? | BD, FE | Propuesta. Nombre, correo y celular opcional (spec 003) |
| P12 | ¿Qué ven los miembros unos de otros? | BE, FE | Propuesta. Nombre; celular si fue ingresado; nunca el correo (spec 003, RN-003-03) |
| P13 | ¿Qué plataformas y planes entran al catálogo inicial? | BD | Propuesta. Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video (spec 004); Camila verifica precios |
| P14 | ¿Se permite un servicio fuera del catálogo? | BD, BE | Propuesta. Sí, con nombre libre (spec 001/004) |

## Notificaciones, panel y extras (specs 005 a 009)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P21 | ¿Qué canal de recordatorio? | BE, FE | Propuesta. En la app + correo; WhatsApp solo con enlace manual (spec 005) |
| P22 | ¿Cuántos días antes se avisa y cada cuánto si hay atraso? | BE | Propuesta. 2 días antes del corte, 1 antes del vencimiento, cada 3 días hasta 3 veces (spec 005) |
| P24 | ¿Cómo se calcula el ahorro? | BD, BE | Propuesta. Precio individual de referencia del catálogo vs. cuota (spec 006) |
| P25 | ¿Qué gráficos son imprescindibles? | FE | Propuesta. Gasto 12 meses, gasto por servicio y ahorro acumulado (spec 006) |
| P26 | ¿Cómo se calcula la reputación y quién la ve? | BD, BE | Propuesta. Calificación de 0 a 5 estrellas según pagos puntuales sobre total en 12 meses; ranking visible en el grupo (spec 007) |
| P27 | ¿Cupos libres: quién ve, cómo se pide unirse y quién aprueba? | BD, BE, FE | Propuesta. Usuarios autenticados; la solicitud sigue el flujo de la spec 010 con pago previo y confirmación del titular (spec 008) |
| P28 | ¿Quién administra el sistema y qué necesita? | BE, FE | Propuesta. El equipo; catálogo, usuarios, moderación y estadísticas (spec 009) |

## Ingreso con pago previo, chat y sanciones (spec 010)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P34 | ¿Cómo entra una persona a un grupo? | BD, BE, FE | Decidida el 2026-10-17. Solicitud con chat, pago previo y confirmación del titular (spec 010) |
| P35 | ¿Cuánto paga al ingresar? | BE, BD | Decidida el 2026-10-17. La cuota del mes dividida entre los miembros del grupo, contando a la persona (spec 010, RN-010-01) |
| P36 | ¿Qué plazos hay? | BE, FE | Decidida el 2026-10-17. 15 minutos para pagar y 60 para que el titular confirme, con recordatorio a los 30 (spec 010, RF-010-17) |
| P37 | ¿Qué admite el chat? | BE, FE | Decidida el 2026-10-17. Texto y fotos, por solicitud (spec 010, RF-010-05) |
| P38 | ¿Cuántos tipos de reclamo hay? | BE | Decidida el 2026-10-17. Uno solo por ahora (spec 010, RF-010-21) |
| P39 | ¿Se pagan por adelantado los meses siguientes? | BE | Decidida el 2026-10-17. No; se mantienen los cobros de la spec 002 |
| P40 | ¿Qué pasa con el titular que estafa? | BE, BD | Decidida el 2026-10-17 en lo general: baneo de la cuenta sin poder crear otra con los mismos datos. Falta definir qué datos se bloquean y cómo se revisa (specs 003 y 009) |
| P41 | ¿Quién puede ser titular? | BE, BD | Decidida el 2026-10-17 en lo general: usuarios con muy buena reputación. Falta el umbral y cómo arrancan los primeros titulares (spec 001, RF-001-21; spec 007) |
| P42 | ¿Cómo se define el período en curso del pago de ingreso y qué pasa si se ingresa cerca del corte? | BE, BD | Propuesta. La fecha de creación del grupo cuenta como corte inicial; aceptar el doble pago cercano al corte y avisarlo (spec 010, sección 11) |
| P43 | ¿Hay prórroga del plazo de pago, referencia obligatoria y única, y reclamo del titular contra un comprobante falso? | BE | Propuesta. Una prórroga de 15 minutos; referencia obligatoria y única por grupo; sin reclamo del titular por ahora (spec 010, sección 11) |

## Calidad y operación

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P29 | ¿Cuántos usuarios se esperan en la demo? | BE, BD | Pendiente |
| P30 | ¿Debe funcionar sin conexión? ¿Prioridad celular o escritorio? | FE | Propuesta. Requiere internet; diseño celular primero (spec 000 y 003) |
| P31 | ¿Hay requisitos de privacidad (política de datos, borrado de cuenta)? | BD, BE | Pendiente (eliminar cuenta está abierto en la spec 003) |
| P32 | ¿Habrá marca propia (logo, colores)? | FE | Pendiente |

## Seguimiento

Las preguntas propuestas y pendientes se revisan en reunión y cada respuesta se escribe en la spec correspondiente. Al resolverse una pregunta, su estado pasa a decidida y se anota en qué parte de la spec quedó. Lo que detecta `/speckit-clarify` en cada spec se suma a este banco o directamente a la spec.
