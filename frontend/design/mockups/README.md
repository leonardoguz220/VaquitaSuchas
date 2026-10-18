# Mockups del MVP (referencia visual)

Pantallas de escritorio del flujo principal, hechas a partir del plan §6 de las specs 003, 001, 010 y 002. Se ven navegables (con Play) en el lienzo de diseño del equipo: <https://claude.ai/artifact/SvDoR7wjCFuFbe19iXLAV1> (privado: pedir acceso a Adrian).

Los archivos `.dc.html` de esta carpeta son una copia del lienzo para que cualquier persona o agente los lea como texto. No se abren solos en el navegador: necesitan el editor del lienzo.

**Son una guía, no un contrato.** Si un mockup contradice la spec, el plan §6 o `contracts/api.md`, mandan estos últimos. Los datos de ejemplo (nombres, montos, fechas) son inventados.

## Cómo usarlos al implementar

1. Busca en la tabla el mockup de la pantalla que vas a construir y léelo: estructura, jerarquía, textos y estados que muestra.
2. Reconstrúyelo con los componentes de `src/components/ui/` y Tailwind, siguiendo `context/arquitectura.md`. No copies el HTML ni los estilos en línea: son de maqueta.
3. Los textos de la interfaz se pueden tomar tal cual (están en español de Bolivia). Los montos y fechas salen siempre de la API, formateados con `lib/money.ts` y `lib/dates.ts`.
4. Lo que el mockup no muestra (cargando, vacío, error, error de conexión) se diseña con el mismo estilo; es obligatorio igual (frontend/CLAUDE.md).

## Pantallas

| Archivo | Pantalla | Ruta | Spec |
|---|---|---|---|
| `Main.dc.html` | Ingresar | `/ingresar` | 003 |
| `Registro.dc.html` | Registro, paso 1 de 2 | `/registro` | 003 |
| `Verificar.dc.html` | Verificar celular con Telegram, paso 2 de 2 | `/registro/verificar` | 003 |
| `Grupos.dc.html` | Mis suscripciones | `/grupos` | 001 |
| `NuevoGrupo.dc.html` | Crear suscripción, paso 3 de 3 | `/grupos/nuevo` | 001 |
| `Grupo.dc.html` | Detalle del grupo, pestaña Cobros (titular) | `/grupos/[id]` | 001, 002 |
| `Unirse.dc.html` | Unirme con un código | `/unirse` | 010 |
| `Solicitudes.dc.html` | Mis solicitudes | `/solicitudes` | 010 |
| `Solicitud.dc.html` | Solicitud: chat, pago y comprobante (solicitante) | `/solicitudes/[id]` | 010 |
| `SolicitudTitular.dc.html` | Solicitud: confirmar ingreso (titular) | `/solicitudes/[id]` | 010 |
| `Cobro.dc.html` | Mi cobro: subir comprobante | `/cobros/[id]` | 002 |
| `Revisar.dc.html` | Revisar comprobante (titular) | `/cobros/[id]` | 002 |

Faltan, y se diseñan con el mismo estilo: reclamo de una solicitud, pestaña Solicitudes del grupo, prórroga y pago en efectivo (spec 010), perfil y recuperar contraseña (spec 003), y todo P1 y P2.

## Estilo

Propuesta de marca simple (P32, a cargo de Adrian). Para llevarla a Tailwind, en `tailwind.config` o en variables CSS.

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#1E6B4E` | Botón principal, enlaces, elemento activo del menú |
| `primary-hover` | `#14503A` | Hover de enlaces y texto sobre `primary-soft` |
| `primary-soft` | `#E3F1EA` | Fondo del elemento activo del menú, insignia "Titular" |
| `ink` | `#17201C` | Texto principal, paneles oscuros |
| `muted` | `#4F5A55` | Texto secundario (contraste AA sobre blanco) |
| `bg` | `#F5F6F2` | Fondo de la página |
| `surface` | `#FFFFFF` | Tarjetas y formularios |
| `line` | `#D9DDD7` | Bordes de tarjetas |
| `field-border` | `#858E88` | Borde de campos (era `#C9CFC8`, 1,59:1; se oscureció a 3,38:1 sobre blanco para cumplir WCAG 1.4.11, T036) |
| `danger` | `#9B1C12` | Rechazar, cancelar |

Estados de un cobro (siempre color **y** texto, plan §6 de la spec 002):

| Estado | Fondo | Texto |
|---|---|---|
| `pendiente` | `#FCEBC7` | `#7A4B00` |
| `en_revision` | `#DCE6FB` | `#1C3F94` |
| `pagado` | `#D7EFE2` | `#17573F` |
| `atrasado` | `#FBDCD8` | `#9B1C12` |
| `cancelado` | `#E6E7E9` | `#3F4650` |

Las solicitudes de ingreso usan los mismos colores: `abierta` y `pago_informado` en azul, `esperando_pago` en ámbar, `aceptada` en verde, y `rechazada`, `cancelada` y `expirada` en gris o rojo según el caso.

- **Tipografías:** títulos y montos en *Bricolage Grotesque* (600 y 700); texto en *Atkinson Hyperlegible* (400 y 700). Ambas de Google Fonts, con `next/font`.
- **Formas:** tarjetas con radio de 18 a 20 px, campos y botones de 12 px, insignias en forma de píldora.
- **Tamaños:** campos de 48 a 52 px de alto, área táctil mínima de 44 px, texto base de 16 a 17 px.
- **Diseño:** contenedor centrado de hasta 1180 px. Columnas con flex y `flex-wrap`, que se apilan en el celular (móvil primero).
