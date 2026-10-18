# Mockups del MVP (referencia visual)

Pantallas de escritorio de todas las specs (MVP, P1 y P2), hechas a partir del plan §6 de cada una. Se ven navegables (con Play) en el lienzo de diseño del equipo: <https://claude.ai/artifact/SvDoR7wjCFuFbe19iXLAV1> (privado: pedir acceso a Adrian).

Los archivos `.dc.html` de esta carpeta son una copia del lienzo para que cualquier persona o agente los lea como texto. No se abren solos en el navegador: necesitan el editor del lienzo.

**Son una guía, no un contrato.** Si un mockup contradice la spec, el plan §6 o `contracts/api.md`, mandan estos últimos. Los datos de ejemplo (nombres, montos, fechas) son inventados.

## Cómo usarlos al implementar

1. Busca en la tabla el mockup de la pantalla que vas a construir y léelo: estructura, jerarquía, textos y estados que muestra.
2. Reconstrúyelo con los componentes de `src/components/ui/` y Tailwind, siguiendo `context/arquitectura.md`. No copies el HTML ni los estilos en línea: son de maqueta.
3. Los textos de la interfaz se pueden tomar tal cual (están en español de Bolivia). Los montos y fechas salen siempre de la API, formateados con `lib/money.ts` y `lib/dates.ts`.
4. Lo que el mockup no muestra (cargando, vacío, error, error de conexión) se diseña con el mismo estilo; es obligatorio igual (frontend/CLAUDE.md).

## Pantallas

41 pantallas en tres páginas del lienzo: MVP (P0), P1 y P2. Las del MVP se construyen primero.

### MVP (P0)

| Archivo | Pantalla | Ruta | Spec |
|---|---|---|---|
| `Main.dc.html` | Ingresar | `/ingresar` | 003 |
| `Registro.dc.html` | Registro, paso 1 de 2 | `/registro` | 003 |
| `Verificar.dc.html` | Verificar celular con Telegram, paso 2 de 2 | `/registro/verificar` | 003 |
| `Recuperar.dc.html` | Recuperar contraseña (pedir enlace y crear la nueva) | `/recuperar`, `/recuperar/[token]` | 003 |
| `Perfil.dc.html` | Mi perfil | `/perfil` | 003 |
| `Reputacion.dc.html` | Mi reputación y habilitación como titular | `/perfil/reputacion` | 007 (parte MVP) |
| `Grupos.dc.html` | Mis suscripciones | `/grupos` | 001 |
| `NuevoGrupoServicio.dc.html` | Crear suscripción, pasos 1 y 2 (servicio y plan) | `/grupos/nuevo` | 001, 004 |
| `NuevoGrupo.dc.html` | Crear suscripción, paso 3 de 3 | `/grupos/nuevo` | 001 |
| `Grupo.dc.html` | Detalle del grupo, pestaña Cobros (titular) | `/grupos/[id]` | 001, 002 |
| `GrupoMiembro.dc.html` | Detalle del grupo, pestaña Resumen (miembro) | `/grupos/[id]` | 001 |
| `GrupoMiembros.dc.html` | Detalle del grupo, pestaña Miembros (titular) | `/grupos/[id]` | 001 |
| `GrupoAjustes.dc.html` | Detalle del grupo, pestaña Ajustes (titular) | `/grupos/[id]` | 001 |
| `Unirse.dc.html` | Unirme con un código | `/unirse` | 010 |
| `Solicitudes.dc.html` | Mis solicitudes | `/solicitudes` | 010 |
| `SolicitudAbierta.dc.html` | Solicitud abierta: enviar datos de pago, prórroga y efectivo (titular) | `/solicitudes/[id]` | 010 |
| `Solicitud.dc.html` | Solicitud: chat, pago y comprobante (solicitante) | `/solicitudes/[id]` | 010 |
| `SolicitudTitular.dc.html` | Solicitud: confirmar ingreso (titular) | `/solicitudes/[id]` | 010 |
| `GrupoSolicitudes.dc.html` | Detalle del grupo, pestaña Solicitudes (titular) | `/grupos/[id]` | 010 |
| `Reclamo.dc.html` | Reclamo por pago sin ingreso (solicitante) | `/solicitudes/[id]` | 010 |
| `MisCobros.dc.html` | Mis cobros | `/cobros` | 002 |
| `Cobro.dc.html` | Mi cobro: subir comprobante | `/cobros/[id]` | 002 |
| `Revisar.dc.html` | Revisar comprobante (titular) | `/cobros/[id]` | 002 |
| `AdminUsuarios.dc.html` | Admin: usuarios y ficha con acciones | `/admin/usuarios`, `/admin/usuarios/[id]` | 009 |
| `AdminReclamo.dc.html` | Admin: cola de reclamos, evidencia y resolución | `/admin/reclamos/[id]` | 009, 010 |
| `AdminTitulares.dc.html` | Admin: habilitación de titulares | `/admin/titulares` | 009 |
| `AdminAuditoria.dc.html` | Admin: auditoría | `/admin/auditoria` | 009 |

### P1

| Archivo | Pantalla | Ruta | Spec |
|---|---|---|---|
| `Notificaciones.dc.html` | Notificaciones | `/notificaciones` | 005 |
| `AjustesAvisos.dc.html` | Ajustes de avisos (correo y Telegram) | `/ajustes/avisos` | 005 |
| `Invitar.dc.html` | Invitar al grupo (modal del titular) | `/grupos/[id]` | 005 |
| `Panel.dc.html` | Panel: resumen, deudas, cobranza y gráfico de 12 meses | `/panel` | 006 |
| `Calendario.dc.html` | Calendario de cortes y vencimientos | `/panel/calendario` | 006 |
| `Historial.dc.html` | Historial con filtros y exportación CSV | `/panel/historial` | 006 |

### P2

| Archivo | Pantalla | Ruta | Spec |
|---|---|---|---|
| `Cupos.dc.html` | Cupos libres | `/cupos` | 008 |
| `Cupo.dc.html` | Detalle de un cupo y solicitud | `/cupos/[id]` | 008 |
| `PublicarCupos.dc.html` | Detalle del grupo, pestaña Publicar cupos (titular) | `/grupos/[id]` | 008 |
| `Insignias.dc.html` | Mis insignias | `/perfil/insignias` | 007 |
| `Ranking.dc.html` | Detalle del grupo, pestaña Ranking (miembro) | `/grupos/[id]` | 007 |
| `AdminPanel.dc.html` | Admin: tablero de estadísticas | `/admin` | 009 |
| `AdminCatalogo.dc.html` | Admin: catálogo de servicios e importación | `/admin/catalogo` | 009, 004 |
| `AdminModeracion.dc.html` | Admin: moderación de publicaciones | `/admin/moderacion` | 009, 008 |

Las rutas son las del plan §6 de cada spec. Pantallas sin mockup propio (perfil del titular suspendido, banner de «titular baneado», página pública para dejar de recibir correos): se diseñan con el mismo estilo.

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
| `field-border` | `#C9CFC8` | Borde de campos |
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
