# Spec 004 — Catálogo de servicios

- **Estado:** borrador
- **Líder de la spec:** Camila Fuentes (BD)
- **Revisión por capa:** Leonardo Guzman (Backend): pendiente · Adrian Vargas (Frontend): pendiente · Camila Fuentes (BD): pendiente
- **Prioridad:** P0 (MVP)
- **Depende de:** 000 (Setup del proyecto)
- **Módulo cubierto:** 2 (Servicios)
- **Última actualización:** 2026-10-17

## 1. Contexto y problema

Al crear una suscripción compartida, el titular no debería escribir a mano el nombre de la plataforma, su plan ni cuántas personas admite. Un catálogo de servicios con sus planes, precios de referencia y cupos máximos acelera la creación del grupo, evita errores (por ejemplo, invitar a más personas de las que permite el plan) y habilita el cálculo del ahorro (spec 006).

## 2. Objetivos

- Ofrecer un catálogo de plataformas y planes consultable desde la app.
- Sugerir precio y cupos al crear una suscripción (el titular puede modificarlos).
- Mantener el historial de los grupos aunque el catálogo cambie.
- Permitir que el catálogo se actualice sin tocar código (por seed y, más adelante, por administración en la spec 009).

## 3. Fuera de alcance

- Obtención automática de precios desde las plataformas.
- Imágenes subidas por usuarios (el logo es una dirección URL o un color/inicial).
- Edición del catálogo por usuarios normales.
- Pantallas de administración del catálogo (spec 009).

## 4. Actores y permisos

| Actor | Puede | No puede |
|---|---|---|
| Usuario autenticado | Listar, buscar y ver servicios y planes activos | Crear, editar ni desactivar |
| Administrador | (spec 009) crear, editar y desactivar | — |
| Sistema (seed) | Cargar y actualizar el catálogo inicial | — |

## 5. Historias de usuario

- **HU-004-01:** Como titular, quiero elegir un servicio y un plan de una lista para crear mi suscripción sin escribir todo a mano.
- **HU-004-02:** Como titular, quiero ver los cupos máximos del plan para no invitar de más.
- **HU-004-03:** Como usuario, quiero buscar un servicio por nombre o categoría.
- **HU-004-04:** Como equipo, queremos actualizar precios y planes sin romper los grupos existentes.

## 6. Requisitos funcionales

- **RF-004-01:** El catálogo tiene **servicios** (nombre, categoría, logo opcional, color de marca opcional) y **planes** de cada servicio.
- **RF-004-02:** Cada plan tiene: nombre, precio de referencia mensual, moneda del precio (`USD` o `BS`), **cupos máximos** (cantidad de personas, titular incluido), y opcionalmente un **precio individual de referencia** (lo que costaría el plan para una sola persona, usado para calcular el ahorro).
- **RF-004-03:** Las categorías iniciales son: video, música, juegos, educación, almacenamiento y otras.
- **RF-004-04:** El usuario puede **listar** servicios con filtro por categoría y **buscar** por nombre (sin distinguir mayúsculas ni tildes).
- **RF-004-05:** El usuario puede ver el detalle de un servicio con sus planes activos ordenados por precio.
- **RF-004-06:** Los servicios y planes tienen un estado `activo`/`inactivo`. Solo los activos se ofrecen para crear nuevas suscripciones; los inactivos nunca se borran físicamente.
- **RF-004-07:** El **seed** inicial carga los servicios y planes de las plataformas principales (por ejemplo Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video). El seed es **idempotente**: volver a ejecutarlo actualiza sin duplicar (se identifica cada servicio y plan por un código único, `slug`).
- **RF-004-08:** Al crear una suscripción (spec 001) se guarda una **copia** del nombre del servicio, nombre del plan, logo y cupos, para que el historial no cambie si el catálogo se modifica.
- **RF-004-09:** Si el catálogo no tiene un servicio, el titular puede crear una suscripción **personalizada** (nombre libre, sin plan), definida en la spec 001.

## 7. Requisitos no funcionales

- **RNF-004-01 (Rendimiento):** listar y buscar responde en menos de 300 ms con hasta 200 servicios.
- **RNF-004-02 (Usabilidad):** la búsqueda se puede hacer escribiendo y devuelve resultados en la misma pantalla; funciona bien en celular.
- **RNF-004-03 (Integridad):** el seed se ejecuta dentro de una transacción; si falla, no queda un catálogo a medias.
- **RNF-004-04 (Mantenibilidad):** los datos del seed viven en archivos versionados (`database/seeds/`) y se pueden revisar en un PR.

## 8. Reglas de negocio

- **RN-004-01:** El precio del catálogo es **solo una sugerencia**. El precio real de cada suscripción lo define el titular (spec 001).
- **RN-004-02:** Los montos del catálogo se guardan en centavos enteros (`context/dominio.md`).
- **RN-004-03:** Los cupos máximos de un plan son un número entero entre 2 y 20. La suscripción no puede definir más cupos que los del plan elegido [NECESITA ACLARACIÓN: ¿se puede superar?].
- **RN-004-04:** Un `slug` de servicio y de plan es único, en minúsculas y sin espacios (ej. `netflix`, `netflix-premium`).
- **RN-004-05:** Un servicio sin planes activos no aparece en el listado de creación.
- **RN-004-06:** Los precios y cupos del seed deben **verificarse con la fuente oficial** de cada plataforma al momento de cargarlos y se registra la fecha de verificación.

## 9. Casos borde y errores

| Situación | Comportamiento esperado |
|---|---|
| Búsqueda sin resultados | Mensaje claro y sugerencia de crear una suscripción personalizada |
| Se desactiva un plan que ya usan suscripciones | Las suscripciones existentes no cambian; el plan deja de ofrecerse |
| Se cambia el precio de referencia de un plan | Las suscripciones existentes conservan su precio (copia) |
| Se ejecuta el seed dos veces | No hay duplicados; se actualizan los datos |
| Búsqueda con tildes o mayúsculas ("música", "MUSICA") | Encuentra el mismo resultado |
| Plan con cupos máximos menores a 2 | Se rechaza en el seed o la administración |
| Logo con URL rota | Se muestra la inicial del servicio sobre su color |
| Un servicio con nombre duplicado en distinto `slug` | Se rechaza por nombre duplicado (ignorando mayúsculas) |

## 10. Criterios de aceptación

- **CA-004-01:** Dado el catálogo sembrado, cuando un usuario autenticado lista servicios, entonces ve solo los activos con al menos un plan activo.
- **CA-004-02:** Dado un filtro de categoría "música", cuando se lista, entonces solo aparecen servicios de esa categoría.
- **CA-004-03:** Dada la búsqueda "musica" (sin tilde), cuando se busca, entonces aparecen resultados de "música" y servicios cuyo nombre coincida.
- **CA-004-04:** Dado un servicio, cuando se abre su detalle, entonces se listan sus planes activos con precio, moneda y cupos máximos, ordenados por precio.
- **CA-004-05:** Dado el seed ya ejecutado, cuando se vuelve a ejecutar, entonces no se duplica ningún servicio ni plan.
- **CA-004-06:** Dado un seed con un error en un plan, cuando se ejecuta, entonces no se aplica ningún cambio.
- **CA-004-07:** Dada una suscripción creada con el plan X, cuando luego cambia el precio del plan X, entonces la suscripción conserva su precio y su copia de nombre.
- **CA-004-08:** Dado un plan desactivado, cuando un titular crea una suscripción, entonces ese plan no se ofrece.
- **CA-004-09:** Dado un usuario sin sesión, cuando consulta el catálogo, entonces recibe `401`.
- **CA-004-10:** Dado un usuario normal, cuando intenta crear o editar un servicio, entonces recibe `403`.
- **CA-004-11:** Dado un plan con precio individual de referencia, cuando se consulta, entonces la respuesta lo incluye para el cálculo del ahorro; sin él, el campo viene vacío.
- **CA-004-12:** Dado un servicio con logo roto, cuando se muestra, entonces la interfaz usa la inicial y el color de marca.

## 11. Preguntas abiertas

- [NECESITA ACLARACIÓN] **Plataformas y planes del seed inicial** (P13). **Propuesta:** Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video, con los planes familiares/premium; Camila los carga y verifica precios vigentes.
- [NECESITA ACLARACIÓN] ¿Se puede superar el cupo máximo del plan? **Propuesta:** no, porque rompe las condiciones del servicio y la cuota perdería sentido.
- [NECESITA ACLARACIÓN] ¿Se muestran precios en USD y se convierten con el tipo de cambio del titular? **Propuesta:** sí, el catálogo guarda la moneda original del plan.
- [NECESITA ACLARACIÓN] **Origen del logo.** **Propuesta:** URL pública definida en el seed; sin subida de archivos.

## 12. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-17 | Primer borrador | Claude, a pedido del equipo |
