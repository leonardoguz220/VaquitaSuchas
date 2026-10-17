---
name: vaquita-ca-traceability
description: Verifica la trazabilidad spec → test de Vaquita y la definición de terminado antes de abrir o revisar un PR: cada criterio CA-xxx tiene un test con su ID, la spec/plan/tasks reflejan la realidad y no hay secretos ni console.log. Úsalo al terminar una tarea, antes de un PR y al revisar el PR de otra capa.
---

# Vaquita — Trazabilidad CA → test y DoD (Todas las capas)

Esta skill es **de apoyo**. La definición de "terminado" oficial es `CLAUDE.md` §8; si algo aquí la contradice, manda `CLAUDE.md`.

## Cuándo usarla

- Al terminar una tarea de `tasks.md`.
- Antes de abrir un PR.
- Al revisar el PR de otra persona o de otra capa.

## Qué comprueba

1. Cada criterio `CA-xxx` que la tarea toca **tiene un test** cuyo nombre o comentario incluye el ID.
2. Ningún test "huérfano" (sin criterio) sin justificación.
3. Cada criterio no testeable se **reescribe en la spec**, no se ignora (`CLAUDE.md` §2.5).
4. La spec, el plan y `tasks.md` reflejan lo implementado. Si la realidad contradijo la spec, la spec se actualizó **primero** y en el mismo PR (`CLAUDE.md` §2.4).
5. Nada fuera del alcance de la spec; lo agregado se discute antes (`CLAUDE.md` §9.5).
6. Nivel de test correcto (`CLAUDE.md` §7): unitarios para reglas de dominio, integración con permisos por rol para endpoints, E2E para el flujo del MVP.
7. Definición de terminado (§8): lint y tests pasan en CI, revisión de al menos un compañero, sin secretos, datos reales ni `console.log`, tarea marcada en `tasks.md`.

## Procedimiento

1. Identifica la spec y la tarea (`specs/NNN-.../tasks.md`).
2. Lista los `CA-NNN-xx` que cubre la tarea.
3. Busca cada ID en el código de pruebas, por ejemplo:

   ```bash
   grep -rn "CA-002-05" backend/ frontend/ database/ --include="*.ts" --include="*.tsx" --include="*.sql"
   ```

4. Arma la tabla y complétala:

   | Criterio | Test (archivo y nombre) | Nivel | Estado |
   |---|---|---|---|
   | CA-002-05 | `billing.e2e-spec.ts` › "CA-002-05 ..." | Integración | ✅ / ❌ falta |

5. Para cada ❌: escribe el test, o corrige la spec si el criterio no se puede probar.
6. Revisa también el sentido contrario: criterios de la spec que **deberían** estar afectados por el cambio y no aparecen en la tabla.
7. Revisa el diff buscando secretos, datos reales y `console.log`:

   ```bash
   git diff origin/main... | grep -nE "console\.log|password|secret|token|api[_-]?key" 
   ```

   Cada coincidencia se revisa a mano (puede ser un falso positivo).
8. Pega la tabla en la descripción del PR (plantilla en `.github/pull_request_template.md`).

## Al revisar el PR de otro

- Hazlo desde **tu capa**: BD revisa integridad y consultas, Backend reglas y permisos, Frontend pantallas y contrato.
- Verifica la tabla, no te fíes de ella: abre al menos dos tests y confirma que realmente comprueban el criterio (que no son vacíos ni siempre verdaderos).
- Si encuentras ambigüedad, marca `[NECESITA ACLARACIÓN]` en la spec en vez de decidir por tu cuenta.
- La revisión humana es obligatoria; esta skill no reemplaza la aprobación.

## Errores comunes

- Un test que menciona el ID pero no prueba el criterio.
- Criterios cubiertos solo por la UI sin test de la API que aplica la regla.
- Cambiar el comportamiento sin tocar la spec.
- Marcar la tarea en `tasks.md` sin que CI esté en verde.
