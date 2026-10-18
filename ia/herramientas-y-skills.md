# Herramientas de IA del proyecto

Registro de las herramientas de apoyo que usa el equipo con Claude Code: skills, agentes, listas de referencia y MCPs. Incluye el origen de cada una, las que se descartaron y el motivo. Los cambios se hacen por PR, igual que las specs.

## 1. Precedencia

Las skills de terceros ayudan al trabajo, pero no mandan. Ante un conflicto se aplica este orden:

1. `CLAUDE.md` y `.specify/memory/constitution.md`
2. La `spec.md` y el `plan.md` de la feature
3. `CONTRIBUTING.md`
4. Las skills, agentes y listas de terceros de `.claude/`

Por ejemplo, `.claude/references/definition-of-done.md` es una guía general, mientras que la definición de terminado del proyecto es la de `CLAUDE.md` §8.

## 2. Skills de agent-skills instaladas

- **Origen:** [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), commit `aeac41d`.
- **Licencia:** MIT, copyright 2025 Addy Osmani. La copia está en [`licencias/agent-skills-LICENSE`](licencias/agent-skills-LICENSE).
- **Revisión previa:** se leyó el contenido de cada skill antes de copiarla. Las instaladas son solo archivos Markdown, sin scripts ni hooks.
- **Versión fija:** las skills están copiadas dentro del repositorio y no se actualizan solas, de modo que todo el equipo usa la misma versión.

| Skill | Uso en Vaquita | Capa | Momento |
|---|---|---|---|
| `interview-me` | Entrevista de una pregunta por vez para afinar una idea antes de escribir la spec | Todas | Antes de `/speckit-specify` |
| `api-and-interface-design` | Diseño del contrato de la API: endpoints, errores, paginación y versiones | BE | Plan y contrato |
| `test-driven-development` | Ciclo rojo, verde y refactor, con un test por criterio `CA-xxx` | BE, FE | Cada tarea de código |
| `incremental-implementation` | Entregas en rebanadas pequeñas y verificables | Todas | Cada tarea de `tasks.md` |
| `security-and-hardening` | Autenticación, validación de entradas, subida de comprobantes y secretos | BE, FE | Specs 003 y 002 en especial |
| `code-review-and-quality` | Revisión de PR en varios ejes: corrección, legibilidad, arquitectura, seguridad y rendimiento | Todas | Revisión cruzada entre capas |
| `frontend-ui-engineering` | Interfaces accesibles y adaptables, con estados de vacío, error y carga | FE | Pantallas de las specs |
| `ci-cd-and-automation` | GitHub Actions con lint, tests y puertas de calidad | Todas | Spec 000 |
| `debugging-and-error-recovery` | Búsqueda de la causa raíz cuando algo falla | Todas | Tests o builds que fallan |
| `performance-optimization` | Consultas SQL, índices y tiempos de carga (requisitos de las specs 006 y 009) | BD, BE, FE | Specs 006 y 009 |
| `documentation-and-adrs` | Registro de decisiones de arquitectura | Todas | Decisiones técnicas |
| `source-driven-development` | Verificación contra la documentación oficial antes de implementar | Todas | Uso de NestJS, Next.js, `pg` y Supabase |

### Agentes (`.claude/agents/`)

- `code-reviewer`: revisión de cambios antes del merge.
- `security-auditor`: auditoría de vulnerabilidades en autenticación, comprobantes y permisos por grupo.
- `test-engineer`: diseño de la estrategia y de los casos de prueba a partir de los criterios `CA-xxx`.

Agentes propios de Vaquita, escritos por el equipo (en español y limitados a su capa):

| Agente | Capa | Qué hace | Escribe |
|---|---|---|---|
| `db-engineer` | BD | Implementa una tarea `[BD]`: migraciones, seeds y pruebas de integridad | Solo `database/` y `tasks.md` |
| `backend-engineer` | BE | Implementa una tarea `[BE]`: módulos NestJS por capas y tests | Solo `backend/` y `tasks.md` |
| `frontend-engineer` | FE | Implementa una tarea `[FE]`: pantallas, componentes, proxy y tests | Solo `frontend/` y `tasks.md` |
| `contract-checker` | Todas | Compara el código con `contracts/api.md` y `data-model.md` | Nada (solo lectura) |
| `ca-traceability-checker` | Todas | Verifica que cada `CA-xxx` tenga su test y la definición de terminado | Nada (solo lectura) |

### Listas de referencia (`.claude/references/`)

`security-checklist.md`, `performance-checklist.md`, `accessibility-checklist.md`, `testing-patterns.md` y `definition-of-done.md`. Esta última es de apoyo; la definición vigente es la de `CLAUDE.md` §8.

## 3. Skills propias de Vaquita

Están escritas por el equipo a partir de `CLAUDE.md`, `context/` y las specs. No agregan reglas: citan las que ya existen. Si una regla cambia en la spec, la skill se actualiza en el mismo PR.

| Skill | Capa | Contenido |
|---|---|---|
| `vaquita-money-and-billing` | BE | Centavos, reparto de cuotas con el resto al titular, conversión, fechas de corte y vencimiento, generación idempotente y máquina de estados (RN-002-01) |
| `vaquita-postgres-migrations` | BD | Migraciones numeradas, restricciones de integridad, tipos para dinero y fechas, seed y una prueba de integridad por restricción |
| `vaquita-nestjs-conventions` | BE | Módulos por capas, DTO, permisos por rol y por grupo, errores, Swagger, tareas programadas, subida de comprobantes y tests con supertest |
| `vaquita-nextjs-conventions` | FE | Capas del frontend, proxy `/api` con cookie httpOnly, rutas por rol, componentes `ui/`, estados de una vista, diseño para celular, formato `Bs` y hora de La Paz |
| `vaquita-ca-traceability` | Todas | Tabla de criterios y tests, definición de terminado y revisión cruzada de PR |

La revisión de cada una corresponde a Camila para `vaquita-postgres-migrations`, a Adrian para `vaquita-nextjs-conventions` y a Leonardo para las otras tres.

## 4. Elementos de agent-skills que no se instalaron

| Elemento | Motivo |
|---|---|
| `spec-driven-development`, `planning-and-task-breakdown` | Duplican el flujo de Spec Kit (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`). Dos flujos de spec confunden al equipo y a la IA |
| `idea-refine` | Lo cubren `/speckit-clarify` e `interview-me` |
| `git-workflow-and-versioning` | Choca con las ramas, los PR y el squash merge de `CONTRIBUTING.md` |
| `context-engineering`, `constraint-driven-development`, `doubt-driven-development` | Son opcionales y su contenido ya está cubierto por `CLAUDE.md` §9. Se pueden sumar por PR |
| `code-simplification`, `deprecation-and-migration`, `shipping-and-launch`, `observability-and-instrumentation` | Se agregan más adelante, cuando haya código y producción |
| `browser-testing-with-devtools` | Depende de un MCP externo (Chrome DevTools) y se evalúa junto con él (§5) |
| `using-agent-skills` | Es una skill de la propia librería |
| `commands/*.toml` y `hooks/*.sh` | Los comandos duplican los `/speckit-*`. Los hooks de agent-skills no se copian: el proyecto tiene hooks propios, revisados por el equipo (§7) |

## 5. MCPs recomendados

Un MCP conecta a Claude con un servicio externo. Ninguno está conectado todavía: cada integrante decide si lo activa, y las credenciales no se comparten por el repositorio (`context/dominio.md`).

### Prioridad alta

| MCP | Uso | Capa | Nota |
|---|---|---|---|
| GitHub (`github/github-mcp-server`) | Issues, PR y revisiones desde Claude; se complementa con `/speckit-taskstoissues` | Todas | Requiere un token personal de cada integrante, con permisos mínimos |
| Context7 (Upstash, MIT) | Documentación actualizada de NestJS, Next.js, Tailwind y `pg`; apoya a `source-driven-development` | Todas | `npx -y @upstash/context7-mcp`. La clave de API es opcional. La documentación la aporta la comunidad, por lo que se contrasta con la oficial |
| Playwright (Microsoft) | Pruebas E2E del flujo crear, invitar, cobrar, pagar y confirmar | FE, BE | Trabaja con instantáneas de accesibilidad. Complementa los tests de Playwright del proyecto |
| Neon o Supabase | Ver el esquema, probar consultas y usar ramas de base de datos | BD | Solo si la spec 000 elige ese proveedor. Se usa únicamente con datos de prueba |

### Prioridad media

| MCP | Uso | Capa | Nota |
|---|---|---|---|
| Supabase (oficial, `supabase-community/supabase-mcp`) | Buckets privados y URLs firmadas de comprobantes y QR (decisión del 2026-10-18: Supabase Storage en lugar de Firebase) | BE | Usar el modo de solo lectura y limitarlo al proyecto de staging; nunca con datos reales |
| Vercel | Proyectos, despliegues y logs del frontend | FE | Conector disponible en el registro de claude.ai |
| Render | Despliegues, logs y métricas del backend | BE | Conector disponible en el registro de claude.ai |
| Figma | Lectura de diseños y variables | FE | Solo si el equipo diseña en Figma |
| Chrome DevTools (Google) | Consola, red y rendimiento del frontend | FE | Habilita la skill `browser-testing-with-devtools` |

### Prioridad baja

- Sentry, para seguimiento de errores en producción, después de la demo.
- Linear, solo si el equipo deja GitHub Issues.

### Criterios de seguridad

1. Un MCP con permiso de escritura puede modificar servicios reales, por lo que se empieza con solo lectura cuando es posible.
2. Ningún MCP se conecta a datos reales de usuarios, solo a datos de prueba (seed).
3. Los tokens viven en variables de entorno o en la configuración local de cada persona, nunca en el repositorio. `.claude/settings.local.json` está ignorado por Git.
4. Cada MCP nuevo se agrega por PR en esta tabla.

## 6. Actualización de las skills de terceros

Se revisan los cambios del repositorio de origen desde el commit `aeac41d`, se leen los archivos modificados, se copia solo lo que cambió y se actualiza el commit fijado en este documento. El PR lo revisan dos capas. Los scripts no se copian sin revisión.

## 7. Hooks y permisos del proyecto

Están en `.claude/settings.json` (compartido por Git) y los scripts en `.claude/hooks/`. Son scripts de Node sin dependencias, para que funcionen igual en Windows, macOS y Linux. En Windows, Claude Code los ejecuta con Git Bash. Cada persona puede ajustar lo suyo en `.claude/settings.local.json`, que Git ignora.

| Hook | Evento | Qué hace |
|---|---|---|
| `guard-files.mjs` | Antes de leer o escribir un archivo | Bloquea `.env` (salvo `.env.example`), claves y credenciales. Bloquea editar una migración que ya está en `main` (RN-000-02). Avisa, sin bloquear, al tocar una spec, un contrato, un modelo, la constitución, `CLAUDE.md`, `context/` o un test existente |
| `guard-bash.mjs` | Antes de un comando de terminal | Bloquea push a `main`, `dev` o `qa`, push forzado, `--no-verify`, leer secretos con `cat` o similares, y `db:reset`, `db:restore`, `db:migrate` o `db:seed` contra una base que no es la local (RF-000-21) |
| `post-edit.mjs` | Después de editar código en `backend/`, `frontend/` o `database/` | Formatea con Prettier y corre los tests unitarios relacionados (Jest o Vitest). Si fallan, se lo devuelve a Claude para que lo corrija. No hace nada hasta que exista el código. `VAQUITA_HOOK_TESTS=0` desactiva los tests |

Permisos: se permiten sin preguntar lint, build, tests, `db:up`, `db:migrate`, `db:seed` y los comandos de Git de lectura. Se pregunta antes de `git push`, `git reset --hard`, `git clean`, `db:reset`, `db:restore` y `npm install`. Se prohíben `rm -rf`, el push forzado y `--no-verify`.

Para probar un hook a mano: `echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | node .claude/hooks/guard-bash.mjs`. Un cambio en los hooks se hace por PR revisado por dos capas, como las skills (§6).
