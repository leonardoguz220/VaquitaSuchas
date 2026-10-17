# Cómo trabajamos en equipo (Grupo Suchas)

## 1. Roles fijos por capa

Cada persona es dueña de una capa del sistema durante todo el proyecto. Los roles **no rotan**; lo que rota es quién *lidera* la spec de cada feature (ver §3).

| Persona | Capa | Es dueña de |
|---|---|---|
| **Camila Fuentes** | **Base de datos** | Modelo de datos, migraciones, restricciones e índices, datos semilla (catálogo de servicios), consultas pesadas de reportes, integridad de los datos |
| **Leonardo Guzman** | **Backend** | API REST, lógica de dominio (cuotas, conversión, máquina de estados), autenticación y permisos, procesos programados (generación de cobros, atrasos), almacenamiento de comprobantes, tests de integración |
| **Adrian Vargas** | **Frontend** | Pantallas y navegación, formularios y validación de UX, consumo de la API, estados de carga/vacío/error, diseño responsive, tests E2E del flujo del MVP |

### Qué entrega cada capa

| Capa | Entregables | Lo que NO decide sola |
|---|---|---|
| BD | `plan.md` §3 (modelo de datos), migraciones, seeds, scripts de verificación de integridad | Reglas de negocio (están en la spec) y forma de la API |
| Backend | `plan.md` §4 y §5 (contrato de API y lógica de dominio), endpoints, jobs, permisos | Cambios al esquema sin avisar a BD; cambios de UX |
| Frontend | `plan.md` §6 (pantallas y estados), componentes, integración con la API, E2E | Reglas de negocio ni cálculos: **el frontend nunca calcula cuotas ni estados, solo los muestra** |

### Qué revisa cada capa en una spec ("revisión por capa")

Toda spec necesita el visto bueno de **las tres capas** antes de pasar a plan. Cada una revisa lo suyo:

- **BD (Camila):** ¿Se puede garantizar la integridad? ¿Hay unicidades, relaciones, estados finales y datos históricos bien definidos? ¿Hay consultas costosas (historial, reportes)? ¿Qué se guarda como snapshot?
- **Backend (Leonardo):** ¿Las reglas de negocio son completas y sin contradicciones? ¿Los permisos están definidos? ¿Hay casos de concurrencia o procesos programados sin definir? ¿Cada criterio es testeable?
- **Frontend (Adrian):** ¿Se entiende qué ve y qué puede hacer cada rol en cada pantalla? ¿Están los mensajes de error, los estados vacíos y los flujos en celular? ¿Hay información que la UI necesita y la API no ofrece?

## 2. Herramientas: Spec Kit

El repositorio incluye **GitHub Spec Kit** (`.specify/` y `.claude/skills/speckit-*`). Se usa desde Claude Code con estos comandos:

| Comando | Cuándo | Quién lo ejecuta |
|---|---|---|
| `/speckit-constitution` | Una sola vez (y al enmendar principios) | Todos juntos |
| `/speckit-specify` | Inicio de cada feature | Líder de la spec |
| `/speckit-clarify` | Después de specify, **antes** de plan. Hace hasta 5 preguntas y guarda las respuestas en la spec | Líder de la spec; responde todo el equipo |
| `/speckit-plan` | Con la spec aprobada | Las tres capas llenan su sección |
| `/speckit-checklist` | Después de plan, para validar la calidad de los requisitos | Revisor de cada capa |
| `/speckit-tasks` | Con el plan aprobado | Líder de la spec |
| `/speckit-analyze` | Después de tasks, antes de implementar (solo lectura: detecta conflictos) | Cualquiera |
| `/speckit-implement` | Para ejecutar tareas **de una capa** | Cada dueño de capa |
| `/speckit-converge` | Al terminar: compara código vs. spec y agrega las tareas que faltan | Líder de la spec |

> Si falta algún comando, ejecuta `specify init --here --force --integration claude` en la raíz (requiere `uv tool install specify-cli`).

## 3. Ciclo de una feature

```
1. ESPECIFICAR  /speckit-specify          Líder redacta spec.md (qué y por qué)
2. CLARIFICAR   /speckit-clarify          El equipo responde las preguntas; se actualizan las reglas
3. REVISAR      PR de la spec             Revisión por capa (BD, BE, FE) → aprobada
4. PLANIFICAR   /speckit-plan             BD: modelo · BE: API y dominio · FE: pantallas
5. CONTRATO     PR del plan               Se "congela" el contrato (ver §4)
6. TAREAS       /speckit-tasks            Tareas etiquetadas [BD] [BE] [FE]
7. ANALIZAR     /speckit-analyze          Se corrigen inconsistencias antes de programar
8. CONSTRUIR    PR por tarea              Cada quien en su capa, en paralelo
9. CERRAR       /speckit-converge         Se actualiza la spec y se hace la retro (15 min)
```

**Líder de la spec:** quien tiene la capa más cargada en esa feature. Es quien redacta, coordina las preguntas y cierra. **No decide solo**: las tres capas aprueban.

| Spec | Líder sugerido | Motivo |
|---|---|---|
| 001 Suscripciones compartidas | Camila (BD) | Muchas relaciones, unicidades y cálculo de cuotas sobre datos |
| 002 Cobros y pagos | Leonardo (BE) | Máquina de estados, procesos programados, almacenamiento |
| 003 Usuarios y autenticación | Leonardo (BE) | Seguridad y sesiones |
| 004 Catálogo de servicios | Camila (BD) | Datos semilla |
| 005 Notificaciones | Leonardo (BE) | Procesos y envíos |
| 006 Panel y reportes | Adrian (FE) | Visualización; BD aporta consultas |

## 4. Cómo trabajan en paralelo (contrato primero)

El mayor riesgo de un equipo de 3 capas es la integración. Para evitarlo:

1. **BD publica el modelo** (`plan.md` §3) antes que nadie programe sobre él.
2. **Backend publica el contrato de API** (`plan.md` §4): ruta, método, request, response, errores y permisos. Puede ser un archivo OpenAPI.
3. **Frontend arranca con datos simulados (mocks)** basados en ese contrato, sin esperar al backend.
4. **Contrato congelado:** una vez aprobado el plan, cualquier cambio al modelo o al contrato se hace con un PR que modifica `plan.md` y **avisa a las otras dos capas**. Nadie cambia un endpoint o una tabla "en silencio".
5. **Puntos de integración** marcados en `tasks.md` como hitos (ej. "Frontend conecta la pantalla X con el endpoint real").

Orden típico de dependencias: `BD (esquema) → BE (endpoint) → FE (pantalla real)`, pero el trabajo corre en paralelo gracias al contrato y a los mocks.

## 5. Ramas y PRs

- `main`: siempre estable. **Prohibido pushear directo.**
- `spec/NNN-nombre`: especificación y plan.
- `bd/NNN-tX-descripcion`, `be/NNN-tX-descripcion`, `fe/NNN-tX-descripcion`: una rama por tarea, con el prefijo de la capa.
- PRs **pequeños** (una tarea), con la plantilla de `.github/pull_request_template.md`.
- **Revisión cruzada:** un PR de una capa lo revisa **otra capa** (BD ↔ BE ↔ FE), porque así se detectan fallas de contrato. Mínimo 1 aprobación; 2 para cambios a `CLAUDE.md`, a la constitución o a specs ya aprobadas.
- Merge con *squash*.

## 6. Ritmo del equipo

| Cuándo | Qué | Duración |
|---|---|---|
| Inicio de cada feature | Responder `/speckit-clarify` y aprobar la spec los 3 juntos | 30 min |
| Al congelar el contrato | Leer el plan juntos: modelo, API y pantallas | 20 min |
| 2-3 veces por semana | Sincronización: avancé / bloqueo / cambio de contrato o spec | 10-15 min |
| Cierre de feature | Retro | 15 min |

## 7. Reglas de oro

1. Nada se programa sin spec aprobada por las tres capas.
2. Si algo no está claro, se marca `[NECESITA ACLARACIÓN]` y se resuelve **antes** de implementar.
3. Los cambios de alcance pasan por la spec; los cambios técnicos entre capas, por el contrato.
4. Las reglas de negocio viven **solo en el backend** (con la BD como red de seguridad con restricciones). El frontend no las duplica.
5. La spec se discute en el PR, no solo por chat.
6. Si se usa IA: una tarea por vez, con constitución + spec + plan como contexto, y revisión humana siempre.
7. Los 10 módulos entran en el alcance. Se construyen en orden: MVP (P0) → importantes (P1) → extras (P2); cada etapa se termina y se prueba de punta a punta antes de empezar la siguiente.

## 8. Gestión de tareas

- Las tareas de `tasks.md` tienen: ID, capa (`[BD]`, `[BE]`, `[FE]`), descripción, responsable, dependencias, criterio de "terminado" y estado.
- Se puede espejar en GitHub Projects / Trello, pero **`tasks.md` es la fuente de verdad**.
- Estados: `⬜ pendiente` · `🟦 en curso` · `🟨 en revisión` · `✅ hecha`.
