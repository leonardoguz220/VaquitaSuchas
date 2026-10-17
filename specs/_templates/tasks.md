# Tareas — Spec NNN: Nombre de la feature

- **Spec:** `spec.md` · **Plan:** `plan.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian
- Estados: pendiente, en curso, en revisión y hecha.
- Cada tarea se completa y verifica sola. Una tarea pertenece a **una** sola capa.

| ID | Capa | Tarea | Responsable | Depende de | Cubre (CA/RF) | Terminado cuando | Estado |
|---|---|---|---|---|---|---|---|
| T1 | BD | Migración y modelo de datos | Camila | — | RF-NNN-01 | Migración aplicada; restricciones verificadas con script | pendiente |
| T2 | BE | Lógica de dominio (funciones puras + tests) | Leonardo | — | CA-NNN-01 | Tests unitarios pasan | pendiente |
| T3 | BE | Endpoint … | Leonardo | T1, T2 | CA-NNN-02 | Test de integración pasa | pendiente |
| T4 | FE | Pantalla … con datos simulados (mock) | Adrian | contrato congelado | CA-NNN-03 | Pantalla completa con estados de carga/vacío/error | pendiente |
| T5 | FE | Conectar pantalla con el endpoint real | Adrian | T3, T4 | CA-NNN-03 | Flujo manual verificado | pendiente |
| T6 | FE | Test E2E del flujo | Adrian | T5 | CA-NNN-0X | E2E pasa en CI | pendiente |
| T7 | Todos | Cierre: `/speckit-converge`, actualizar spec/plan y retro | Líder | T6 | — | Documentos reflejan la realidad | pendiente |

## Puntos de integración (hitos)

- [ ] **I1:** Modelo de datos disponible para el backend (T1)
- [ ] **I2:** Contrato de API congelado (plan §4)
- [ ] **I3:** Frontend conectado al backend real (T5)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
