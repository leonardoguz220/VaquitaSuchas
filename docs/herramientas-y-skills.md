# Herramientas, skills y MCPs del proyecto

Este documento registra **qué herramientas de terceros usa el equipo, por qué, y cuáles se descartaron**. Las decisiones se cambian por PR, igual que las specs.

## 1. Regla de precedencia

Los skills de terceros **ayudan a trabajar mejor, pero no mandan**. Si hay un conflicto, gana siempre este orden:

1. `CLAUDE.md` y `.specify/memory/constitution.md`
2. La `spec.md` y el `plan.md` de la feature
3. `CONTRIBUTING.md`
4. Los skills de terceros (`.claude/skills/`, `.claude/agents/`, `references/`)

Ejemplo: `references/definition-of-done.md` es una guía general; la definición de "terminado" del proyecto es la de `CLAUDE.md` §8.

## 2. Skills de agent-skills instalados

- **Origen:** [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), commit `aeac41d`.
- **Licencia:** MIT, © 2025 Addy Osmani. Copia en [`third-party/agent-skills-LICENSE`](third-party/agent-skills-LICENSE).
- **Revisión previa:** se leyó el contenido de cada skill antes de copiarlo. Los instalados son solo archivos Markdown, sin scripts ni hooks.
- **Fijados:** están copiados dentro del repositorio (no se actualizan solos), para que todos usen la misma versión.

| Skill | Para qué sirve en Vaquita | Capa | Cuándo |
|---|---|---|---|
| `interview-me` | Entrevistar de a una pregunta para afinar una idea antes de escribir la spec | Todas | Antes de `/speckit-specify` |
| `api-and-interface-design` | Diseñar el contrato de la API (endpoints, errores, paginación, versiones) | BE | Al escribir el `plan.md` y el contrato |
| `test-driven-development` | Ciclo rojo-verde-refactor; un test por criterio `CA-xxx` | BE, FE | En cada tarea de código |
| `incremental-implementation` | Entregar en rebanadas pequeñas y verificables | Todas | En cada tarea de `tasks.md` |
| `security-and-hardening` | Autenticación, validación de entradas, subida de comprobantes, secretos | BE, FE | Specs 003 y 002 en especial |
| `code-review-and-quality` | Revisión de PR en varios ejes (corrección, legibilidad, arquitectura, seguridad, rendimiento) | Todas | Revisión cruzada entre capas |
| `frontend-ui-engineering` | Interfaces accesibles, responsivas y con estados vacío/error/carga | FE | Pantallas de las specs |
| `ci-cd-and-automation` | GitHub Actions: lint, tests y puertas de calidad | Todas | Spec 000 |
| `debugging-and-error-recovery` | Encontrar la causa raíz cuando algo falla | Todas | Cuando un test o build falla |
| `performance-optimization` | Consultas SQL, índices, tiempos de carga (RNF de las specs 006 y 009) | BD, BE, FE | Specs 006 y 009 |
| `documentation-and-adrs` | Registrar decisiones de arquitectura (ADR) | Todas | Cuando se toma una decisión técnica |
| `source-driven-development` | Verificar contra la documentación oficial antes de implementar | Todas | Al usar NestJS, Next.js, `pg`, Firebase |

### Agentes (`.claude/agents/`)

- `code-reviewer`: revisión de cambios antes del merge.
- `security-auditor`: auditoría de vulnerabilidades (autenticación, comprobantes, permisos por grupo).
- `test-engineer`: diseño de estrategia y casos de prueba a partir de los criterios `CA-xxx`.

### Listas de referencia (`references/`)

`security-checklist.md`, `performance-checklist.md`, `accessibility-checklist.md`, `testing-patterns.md` y `definition-of-done.md` (esta última es solo de apoyo; manda `CLAUDE.md` §8).

## 3. Lo que NO se instaló, y por qué

| Elemento | Motivo |
|---|---|
| `spec-driven-development`, `planning-and-task-breakdown` | Duplican el flujo de **Spec Kit** (`/speckit-specify`, `-plan`, `-tasks`). Tener dos flujos de spec confunde al equipo y a la IA. |
| `idea-refine` | Lo cubre `/speckit-clarify` junto con `interview-me`. |
| `git-workflow-and-versioning` | Choca con las ramas, PR y squash merge definidos en `CONTRIBUTING.md`. |
| `context-engineering`, `constraint-driven-development`, `doubt-driven-development` | Útiles pero opcionales; su contenido ya está cubierto por `CLAUDE.md` §9. Se pueden sumar por PR si el equipo los pide. |
| `code-simplification`, `deprecation-and-migration`, `shipping-and-launch`, `observability-and-instrumentation` | Se pueden agregar más adelante (lanzamiento, observabilidad); hoy no hay código ni producción. |
| `browser-testing-with-devtools` | Depende de un MCP externo (Chrome DevTools). Se evalúa junto con ese MCP (§4). |
| `using-agent-skills` | Es un meta-skill de la librería. |
| `commands/*.toml` y `hooks/*.sh` | Los comandos duplican `/speckit-*`. Los hooks ejecutan scripts en la máquina de cada integrante: no se instalan sin revisión del equipo. |

## 4. MCPs recomendados

Un MCP conecta a Claude con un servicio externo. **Ninguno está conectado todavía**: cada integrante decide si lo activa, y nadie comparte credenciales ni tokens por el repositorio (`CLAUDE.md` §5).

### Prioridad alta

| MCP | Para qué | Capa | Cómo / nota |
|---|---|---|---|
| **GitHub** (`github/github-mcp-server`) | Issues, PR y revisiones desde Claude; encaja con `/speckit-taskstoissues` | Todas | Requiere un token personal de cada integrante, con permisos mínimos. |
| **Context7** (Upstash, MIT) | Documentación actualizada de NestJS, Next.js, Tailwind, `pg`; apoya `source-driven-development` | Todas | `npx -y @upstash/context7-mcp`. La clave de API es opcional. La documentación es aportada por la comunidad: contrastar con la oficial. |
| **Playwright** (Microsoft) | Pruebas E2E del flujo crear → invitar → cobrar → pagar → confirmar | FE, BE | Trabaja con instantáneas de accesibilidad. Complementa los tests de Playwright del proyecto, no los reemplaza. |
| **PostgreSQL gestionado** (**Neon** o **Supabase**) | Ver el esquema, probar consultas y ramas de base de datos | BD | Solo se justifica si la spec 000 elige ese proveedor. Neon ofrece ramas de base de datos; útil para probar migraciones. Usar solo con datos de prueba. |

### Prioridad media

| MCP | Para qué | Capa | Cómo / nota |
|---|---|---|---|
| **Firebase** (oficial, `firebase-tools`) | Reglas de Storage, URLs de descarga y despliegue (comprobantes y QR) | BE | `claude mcp add firebase npx -- -y firebase-tools@latest mcp --only storage`. Limitar a `storage` para exponer menos herramientas. |
| **Vercel** | Ver proyectos, despliegues y logs del frontend | FE | Conector disponible en el registro de claude.ai. |
| **Render** | Ver despliegues, logs y métricas del backend | BE | Conector disponible en el registro de claude.ai. |
| **Figma** | Leer diseños y variables si Adrian hace los diseños allí (spec 000 / marca P32) | FE | Solo si el equipo usa Figma. |
| **Chrome DevTools** (Google) | Depurar el frontend: consola, red, rendimiento | FE | Permite usar el skill `browser-testing-with-devtools`. Opcional. |

### Prioridad baja (después de la demo)

- **Sentry**: seguimiento de errores en producción.
- **Linear**: solo si el equipo deja GitHub Issues; hoy no hace falta.

### Reglas de seguridad para MCPs

1. Un MCP con escritura puede modificar servicios reales; empezar con permisos de **solo lectura** donde se pueda.
2. Nunca conectar un MCP a datos reales de usuarios; solo datos de prueba (seed).
3. Los tokens viven en variables de entorno o en la configuración local de cada persona, **nunca** en el repositorio. `.claude/settings.local.json` ya está ignorado por Git.
4. Todo MCP nuevo se propone por PR editando esta tabla.

## 5. Cómo actualizar los skills

1. Revisar los cambios en el repositorio de origen (`git log`/`git diff` desde el commit `aeac41d`).
2. Leer los archivos modificados; no copiar scripts sin revisión.
3. Copiar solo lo que cambió, actualizar el commit fijado en este documento y abrir un PR revisado por dos capas.
