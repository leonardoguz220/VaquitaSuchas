# Cómo trabaja el equipo (Grupo Suchas)

## 1. Roles por capa

Cada persona es dueña de una capa del sistema durante todo el proyecto. Los roles no rotan; lo que rota es quién lidera la spec de cada feature.

| Persona | Capa | Responsabilidades |
|---|---|---|
| Camila Fuentes | Base de datos | Modelo de datos, migraciones, restricciones e índices, datos semilla del catálogo, consultas pesadas de reportes e integridad de los datos |
| Leonardo Guzman | Backend | API REST, lógica de dominio (cuotas, conversión, máquina de estados), autenticación y permisos, procesos programados (generación de cobros y atrasos), almacenamiento de comprobantes y tests de integración |
| Adrian Vargas | Frontend | Pantallas y navegación, formularios y validación de UX, consumo de la API, estados de carga, vacío y error, diseño adaptable a celular y tests E2E del flujo del MVP |

### Entregables por capa

| Capa | Entregables | Lo que no decide sola |
|---|---|---|
| Base de datos | Modelo de datos en `plan.md`, migraciones, seeds y scripts de verificación de integridad | Las reglas de negocio, que están en la spec, y la forma de la API |
| Backend | Contrato de API y lógica de dominio en `plan.md`, endpoints, procesos programados y permisos | Cambios al esquema sin avisar a base de datos y cambios de UX |
| Frontend | Pantallas y estados en `plan.md`, componentes, integración con la API y E2E | Reglas de negocio y cálculos: el frontend muestra cuotas y estados, no los calcula |

La estructura interna del código de cada capa está en [`context/arquitectura.md`](context/arquitectura.md).

### Revisión de una spec

Cada spec necesita el visto bueno de las tres capas antes de pasar al plan.

- **Base de datos:** que se pueda garantizar la integridad, que las unicidades, las relaciones, los estados finales y los datos históricos estén definidos, que las consultas costosas (historial y reportes) estén identificadas y que quede claro qué se guarda como copia.
- **Backend:** que las reglas de negocio estén completas y sin contradicciones, que los permisos estén definidos, que los casos de concurrencia y los procesos programados estén cubiertos y que cada criterio sea testeable.
- **Frontend:** que se entienda qué ve y qué puede hacer cada rol en cada pantalla, que estén los mensajes de error, los estados vacíos y el uso en celular, y que la API ofrezca lo que la interfaz necesita.

## 2. Spec Kit

El repositorio incluye GitHub Spec Kit (`.specify/` y `.claude/skills/speckit-*`), que se usa desde Claude Code.

| Comando | Momento | Quién lo ejecuta |
|---|---|---|
| `/speckit-constitution` | Una vez, y al enmendar principios | Todos juntos |
| `/speckit-specify` | Inicio de cada feature | Líder de la spec |
| `/speckit-clarify` | Después de specify y antes de plan; hace hasta cinco preguntas y guarda las respuestas en la spec | Líder de la spec, con respuestas de todo el equipo |
| `/speckit-plan` | Con la spec aprobada | Las tres capas completan su sección |
| `/speckit-checklist` | Después de plan, para validar la calidad de los requisitos | Un revisor de cada capa |
| `/speckit-tasks` | Con el plan aprobado | Líder de la spec |
| `/speckit-analyze` | Después de tasks y antes de implementar; solo lectura, detecta conflictos | Cualquiera |
| `/speckit-implement` | Ejecución de tareas de una capa | Cada dueño de capa |
| `/speckit-converge` | Al terminar; compara código y spec y agrega las tareas que faltan | Líder de la spec |

## 3. Ciclo de una feature

| Etapa | Comando o acción | Resultado |
|---|---|---|
| Especificar | `/speckit-specify` | El líder redacta `spec.md` (qué y por qué) |
| Clarificar | `/speckit-clarify` | El equipo responde las preguntas y se actualizan las reglas |
| Revisar | PR de la spec | Revisión por capa y aprobación |
| Planificar | `/speckit-plan` | Base de datos define el modelo, backend la API y el dominio, frontend las pantallas |
| Congelar el contrato | PR del plan | El modelo y el contrato quedan fijos |
| Dividir en tareas | `/speckit-tasks` | Tareas etiquetadas `[BD]`, `[BE]` y `[FE]` |
| Analizar | `/speckit-analyze` | Se corrigen las inconsistencias antes de programar |
| Construir | PR por tarea | Cada persona trabaja en su capa, en paralelo |
| Cerrar | `/speckit-converge` | Se actualiza la spec y se hace la retro de 15 minutos |

El líder de la spec es quien tiene la capa más cargada en esa feature. Redacta, coordina las preguntas y cierra, pero no decide solo: las tres capas aprueban.

| Spec | Líder | Motivo |
|---|---|---|
| 001 Suscripciones compartidas | Camila (BD) | Muchas relaciones, unicidades y cálculo de cuotas sobre datos |
| 002 Cobros y pagos | Leonardo (BE) | Máquina de estados, procesos programados y almacenamiento |
| 003 Usuarios y autenticación | Leonardo (BE) | Seguridad y sesiones |
| 004 Catálogo de servicios | Camila (BD) | Datos semilla |
| 005 Notificaciones | Leonardo (BE) | Procesos y envíos |
| 006 Panel y reportes | Adrian (FE) | Visualización, con consultas aportadas por base de datos |
| 007 Reputación | Camila (BD) | Cálculo sobre datos históricos |
| 008 Cupos libres | Adrian (FE) | Búsqueda y publicaciones |
| 009 Administración | Adrian (FE) | Panel de gestión |
| 010 Solicitudes de ingreso y chat | Leonardo (BE) | Máquina de estados con plazos, chat y reserva de cupos |

## 4. Trabajo en paralelo

La integración entre capas se resuelve con el contrato primero:

1. Base de datos publica el modelo en `plan.md` antes de que alguien programe sobre él.
2. Backend publica el contrato de API en `plan.md`: ruta, método, request, response, errores y permisos. Puede ser un archivo OpenAPI.
3. Frontend arranca con datos simulados basados en ese contrato, sin esperar al backend.
4. Una vez aprobado el plan, cualquier cambio al modelo o al contrato se hace con un PR que modifica `plan.md` y avisa a las otras dos capas.
5. Los puntos de integración quedan marcados en `tasks.md` como hitos, por ejemplo cuando frontend conecta una pantalla con el endpoint real.

El orden de dependencia es base de datos, backend y frontend, pero el trabajo corre en paralelo gracias al contrato y a los datos simulados.

## 5. Ramas y PRs

- `main` se mantiene estable y no recibe pushes directos.
- `spec/NNN-nombre` contiene la especificación y el plan.
- `bd/NNN-tX-descripcion`, `be/NNN-tX-descripcion` y `fe/NNN-tX-descripcion` contienen una tarea cada una, con el prefijo de su capa.
- Los PRs son pequeños (una tarea) y usan la plantilla de `.github/pull_request_template.md`.
- Un PR de una capa lo revisa otra capa (base de datos, backend y frontend se revisan entre sí). Se necesita una aprobación como mínimo, y dos para cambios en `CLAUDE.md`, en la constitución o en specs ya aprobadas.
- El merge es con squash.

## 6. Ritmo del equipo

| Momento | Actividad | Duración |
|---|---|---|
| Inicio de cada feature | Responder `/speckit-clarify` y aprobar la spec entre los tres | 30 min |
| Al congelar el contrato | Leer el plan juntos: modelo, API y pantallas | 20 min |
| Dos o tres veces por semana | Sincronización: avance, bloqueos y cambios de contrato o spec | 10 a 15 min |
| Cierre de feature | Retro | 15 min |

## 7. Acuerdos del equipo

1. No se programa sin una spec aprobada por las tres capas.
2. Lo que no está claro se marca `[NECESITA ACLARACIÓN]` y se resuelve antes de implementar.
3. Los cambios de alcance pasan por la spec y los cambios técnicos entre capas, por el contrato.
4. Las reglas de negocio viven solo en el backend, con la base de datos como respaldo mediante restricciones.
5. La spec se discute en el PR, no solo por chat.
6. Al trabajar con IA se pide una tarea por vez, con la constitución, la spec y el plan como contexto, y siempre hay revisión humana.
7. Los diez módulos entran en el alcance y se construyen en orden: MVP (P0), importantes (P1) y extras (P2). Cada etapa se termina y se prueba de punta a punta antes de empezar la siguiente.

## 8. Gestión de tareas

Las tareas de `tasks.md` llevan identificador, capa (`[BD]`, `[BE]` o `[FE]`), descripción, responsable, dependencias, criterio de terminado y estado. Se pueden reflejar en GitHub Projects o Trello, pero `tasks.md` es la fuente de verdad.

Los estados son: pendiente, en curso, en revisión y hecha.
