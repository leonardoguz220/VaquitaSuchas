# Banco de preguntas para afinar Vaquita

Preguntas para especificar mejor la app. Cada una indica **dónde quedó reflejada** o qué falta.

- ✅ **Decidida:** el equipo respondió y la spec ya lo refleja.
- 🟡 **Propuesta:** hay una propuesta escrita en la spec; falta que el equipo la confirme o la cambie.
- ⬜ **Pendiente:** todavía no hay propuesta en ninguna spec.

Capa afectada: **BD** (Camila) · **BE** (Leonardo) · **FE** (Adrian)

## Decisiones generales

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P5 | ¿Qué stack usa cada capa? | BD, BE, FE | ✅ Stack final en `CLAUDE.md` §4 (Next.js, NestJS, PostgreSQL, TypeScript) |
| P6 | ¿Dónde se despliega la demo? | BE | 🟡 Frontend Vercel, backend Render, PostgreSQL gestionado por definir (spec 000) |
| P7 | ¿Plazo y alcance? | Todos | ✅ Sin recorte por tiempo: entran los 10 módulos, en orden P0 → P1 → P2 |
| P8 | ¿La materia pide diagramas o documentos específicos (ER, casos de uso, UML)? | Todos | ⬜ Pendiente: confirmar con el profesor |

## Reglas de cobro (specs 001 y 002)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P1 | ¿El titular tiene cobro propio? | BD, BE | ✅ No (spec 001, RN-001-10) |
| P2 | ¿Cuándo empieza a pagar quien entra a mitad de mes? | BE, BD | ✅ Desde el siguiente cobro (spec 001, RN-001-11) |
| P3 | ¿Cuántos días de gracia hay antes de marcar atrasado? | BE | ✅ 3 días (spec 002, RF-002-03) |
| P4 | ¿Cómo comparte el titular sus datos de pago? | BD, BE, FE | ✅ Texto + imagen de QR (spec 001, RF-001-20) |
| P15 | ¿Una persona puede ser titular de varias suscripciones? ¿Hay límite de grupos por usuario? | BE | ⬜ Pendiente (la spec 001 no define límite) |
| P16 | ¿Otras monedas además de USD/Bs? ¿Un tipo de cambio por suscripción? | BD, BE | 🟡 Solo USD y Bs; tipo de cambio por suscripción (spec 001) |
| P17 | ¿El titular puede "saltar" un mes sin cobrar? | BE | ⬜ Pendiente |
| P18 | ¿Cuotas desiguales entre miembros? | BE, FE | 🟡 No en esta versión: división equitativa (spec 001, fuera de alcance) |
| P19 | ¿Cuánto tiempo se guardan los comprobantes? | BD, BE | 🟡 12 meses tras cerrar el grupo (spec 002, §11) |
| P20 | ¿Se puede pagar por adelantado o en partes? | BE | 🟡 No (spec 002, fuera de alcance) |
| P23 | ¿El titular ve el historial de miembros que ya salieron? | BD | 🟡 Sí (spec 002, §11) |

## Usuarios y catálogo (specs 003 y 004)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P9 | ¿Cómo se registra el usuario? | BE, FE | 🟡 Correo y contraseña; Google fuera de alcance (spec 003) |
| P10 | ¿Se verifica el correo? ¿Cómo se recupera la contraseña? | BE | 🟡 Sin verificación obligatoria; recuperación por enlace al correo (spec 003) |
| P11 | ¿Qué datos tiene el perfil? | BD, FE | 🟡 Nombre, correo y celular opcional (spec 003) |
| P12 | ¿Qué ven los miembros unos de otros? | BE, FE | 🟡 Nombre; celular si fue ingresado; nunca el correo (spec 003, RN-003-03) |
| P13 | ¿Qué plataformas y planes entran al catálogo inicial? | BD | 🟡 Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video (spec 004); Camila verifica precios |
| P14 | ¿Se permite un servicio fuera del catálogo? | BD, BE | 🟡 Sí, con nombre libre (spec 001/004) |

## Notificaciones, panel y extras (specs 005 a 009)

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P21 | ¿Qué canal de recordatorio? | BE, FE | 🟡 En la app + correo; WhatsApp solo con enlace manual (spec 005) |
| P22 | ¿Cuántos días antes se avisa y cada cuánto si hay atraso? | BE | 🟡 2 días antes del corte, 1 antes del vencimiento, cada 3 días hasta 3 veces (spec 005) |
| P24 | ¿Cómo se calcula el ahorro? | BD, BE | 🟡 Precio individual de referencia del catálogo vs. cuota (spec 006) |
| P25 | ¿Qué gráficos son imprescindibles? | FE | 🟡 Gasto 12 meses, gasto por servicio y ahorro acumulado (spec 006) |
| P26 | ¿Cómo se calcula la reputación y quién la ve? | BD, BE | 🟡 Pagos puntuales / total en 12 meses; ranking visible en el grupo (spec 007) |
| P27 | ¿Cupos libres: quién ve, cómo se pide unirse y quién aprueba? | BD, BE, FE | 🟡 Usuarios autenticados; solicitud con aprobación del titular (spec 008) |
| P28 | ¿Quién administra el sistema y qué necesita? | BE, FE | 🟡 El equipo; catálogo, usuarios, moderación y estadísticas (spec 009) |

## Calidad y operación

| # | Pregunta | Capas | Estado |
|---|---|---|---|
| P29 | ¿Cuántos usuarios se esperan en la demo? | BE, BD | ⬜ Pendiente |
| P30 | ¿Debe funcionar sin conexión? ¿Prioridad celular o escritorio? | FE | 🟡 Requiere internet; diseño celular primero (spec 000 y 003) |
| P31 | ¿Hay requisitos de privacidad (política de datos, borrado de cuenta)? | BD, BE | ⬜ Pendiente (eliminar cuenta está abierto en la spec 003) |
| P32 | ¿Habrá marca propia (logo, colores)? | FE | ⬜ Pendiente |

## Cómo usar este archivo

1. Se revisan en reunión las preguntas 🟡 y ⬜; cada respuesta se escribe en la spec correspondiente.
2. Cuando una pregunta queda resuelta, se marca ✅ y se anota en qué parte de la spec quedó.
3. Lo que `/speckit-clarify` detecte al trabajar cada spec se suma aquí o directamente a la spec.
