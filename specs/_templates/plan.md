# Plan técnico — Spec NNN: Nombre de la feature

- **Spec relacionada:** `specs/NNN-nombre/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** nombre
- **Última actualización:** AAAA-MM-DD

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 | pendiente |
| Backend | Leonardo | §4, §5, §7 | pendiente |
| Frontend | Adrian | §6 | pendiente |

## 1. Resumen de la solución

Enfoque técnico en 3-6 líneas. ¿Qué piezas se tocan?

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|

## 3. Modelo de datos — _Camila (BD)_

Tablas nuevas o modificadas: campos, tipos, restricciones (únicas, claves foráneas, checks), índices y relaciones. Indicar qué datos son **snapshot** y qué datos son **inmutables**.

```
Entidad
- campo: tipo (restricciones)
```

Migraciones y datos semilla: qué se crea y en qué orden.

## 4. Contratos de API — _Leonardo (Backend)_

Para cada endpoint: método y ruta, rol requerido, request, response (éxito y errores).

### `METHOD /ruta`
- **Auth / rol:**
- **Request:**
- **Response 2xx:**
- **Errores:** código → cuándo

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

Funciones puras a implementar (nombre, entradas, salidas, reglas) y procesos programados (cuándo corren, idempotencia, recuperación).

## 6. Interfaz de usuario — _Adrian (Frontend)_

Pantallas, componentes y estados (cargando, vacío, error), por rol. Qué endpoint usa cada pantalla. Bocetos si existen.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

Quién puede qué, validaciones en servidor, manejo de datos sensibles, límites de intentos.

## 8. Estrategia de pruebas

| Criterio de aceptación | Nivel (unit / integración / E2E) | Capa | Test |
|---|---|---|---|

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|

## 10. Trazabilidad

Cada `RF-` y `CA-` de la spec está cubierto por al menos un elemento de este plan.
