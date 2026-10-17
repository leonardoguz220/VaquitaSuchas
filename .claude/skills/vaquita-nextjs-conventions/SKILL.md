---
name: vaquita-nextjs-conventions
description: Convenciones de Vaquita para el frontend Next.js + React + TypeScript + Tailwind: proxy /api con cookie httpOnly, rutas por rol, componentes ui reutilizables, estados vacío/carga/error, diseño celular primero, formato Bs y fechas de La Paz. Úsalo al crear o cambiar pantallas, formularios, llamadas a la API o pruebas E2E (capa Frontend).
---

# Vaquita — Next.js (Frontend)

Esta skill es **de apoyo**. Si contradice `CLAUDE.md`, la constitución o una spec, mandan ellos.
Stack acordado: Next.js + React + TypeScript + Tailwind CSS, sobre el patrón de `proyectoFrontend1` (`CLAUDE.md` §4). Complementa a la skill genérica `frontend-ui-engineering`.

## Cuándo usarla

- Crear o cambiar una pantalla, formulario o componente.
- Consumir un endpoint de la API.
- Escribir pruebas E2E.

## Reglas

1. **El frontend no calcula cuotas, montos ni estados** (`CLAUDE.md` §2.8). Solo muestra lo que entrega la API. Si falta un dato en la respuesta, se pide al Backend por PR sobre el contrato, no se reconstruye en el cliente.
2. **Sesión y proxy:** las llamadas al backend pasan por la ruta `/api/[...path]` de Next, que reenvía y guarda el token en **cookie httpOnly**. El token nunca se lee desde JavaScript del navegador ni se guarda en `localStorage`.
3. **Rutas por rol:** las pantallas de administración y de titular se protegen en el servidor (`proxy.ts` / layouts) y además la API responde `403`. Ocultar un menú **no** es seguridad.
4. **Componentes `ui/` reutilizables** (button, card, modal, field, select, badge): se usan y se extienden antes de crear uno nuevo. Estilos con Tailwind, sin CSS suelto duplicado.
5. **Celular primero.** Cada pantalla se diseña y prueba primero a ~360 px de ancho y luego se amplía (spec 000 y 003).
6. **Cuatro estados en toda vista con datos:** cargando, vacío (con mensaje y siguiente acción), error (con reintento) y con datos. Las specs listan los casos borde de cada pantalla; cada uno es un caso de prueba.
7. **Formato:** dinero como `Bs 25,50` (coma decimal) a partir de los centavos que entrega la API, con una única función de formato compartida. Fechas guardadas en UTC se muestran en **America/La_Paz (UTC-4)**.
8. **Idioma de la interfaz:** español (Bolivia). Nombres de variables, componentes y ramas en inglés.
9. **Accesibilidad:** etiquetas en campos, foco visible, contraste suficiente, y los estados (`pendiente`, `atrasado`...) **no dependen solo del color** (texto o ícono además). Los gráficos tienen alternativa en tabla (RF-006-10, RF-009-16).
10. **Formularios:** validación de UX en el cliente (ayuda), pero el servidor valida siempre; muestra los errores que devuelve la API junto al campo.
11. **Subida de comprobantes:** previsualización, avisos de tipo (JPG/PNG/PDF) y tamaño (5 MB) para ayudar al usuario; la validación real es del servidor (RF-002-06).
12. **Sin datos sensibles en el cliente:** no se registran tokens ni datos personales en consola; sin `console.log` de depuración.

## Procedimiento para cada pantalla

1. Lee la spec: historias de usuario, tabla de permisos, casos borde y criterios `CA-xxx` que afectan la pantalla.
2. Comprueba que la API (Swagger / contrato del plan) ofrece todo lo que la pantalla necesita. Si no, abre el PR de contrato **antes** de programar.
3. Mientras el backend no esté listo, trabaja con datos simulados que respeten exactamente el contrato congelado.
4. Construye con los componentes `ui/` y cubre los cuatro estados.
5. Revisa en 360 px, en pantalla ancha y con teclado.
6. Escribe la prueba E2E si la pantalla forma parte del flujo del MVP (crear → invitar → cobrar → pagar → confirmar), con el `CA-xxx` en el nombre.

## Errores comunes (rechazar en la revisión)

- Sumar o repartir montos en el cliente.
- Calcular si un cobro está atrasado comparando fechas en el navegador.
- Guardar el token en `localStorage` o leerlo desde el cliente.
- Mostrar botones de titular a un miembro confiando en que "el backend lo rechaza" sin manejar el error.
- Pantallas sin estado vacío o sin manejo de error.
- Estados diferenciados solo por color.
- Mostrar fechas en UTC o en la zona del navegador sin convertir a La Paz.

## Antes de terminar

- [ ] Los cuatro estados están cubiertos y probados.
- [ ] Funciona a 360 px y con teclado.
- [ ] Ningún cálculo de negocio en el cliente.
- [ ] Sin `console.log`, sin secretos; criterios `CA-xxx` con su prueba.
