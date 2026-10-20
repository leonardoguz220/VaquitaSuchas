# Contrato de API — Spec 007: Reputación

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. **El cliente nunca envía fechas de pago ni puntuaciones** (RNF-007-05, CA-007-17): todo se calcula en el servidor con los cobros.
- Marcado **[MVP]** lo que se construye con las specs 001 y 010 (calificación básica); el resto es P2.

## Objetos

```ts
Rating {                           // lo que ven otras personas autorizadas (RNF-007-04)
  level: "Nuevo" | "En riesgo" | "Regular" | "Bueno" | "Excelente";
  stars: number | null;            // 0–5 en pasos de 0,5; null = "Nuevo" (RF-007-02)
  starsLabel: string | null;       // "4,5 de 5" (RNF-007-06)
}

ReputationDetail extends Rating {  // solo la propia persona (RF-007-04)
  consideredCount; punctualCount; lateCount; currentStreak: number;
  exactStars: string | null;       // "4.3750" (para explicar el cálculo)
  recent: { chargeId; groupName; serviceName; period; result: "puntual" | "tardio"; dueAt; countsForRating: boolean }[];
  host: { eligible: boolean; source: "manual" | "calificacion" | null; minStars: 4.5; minConsideredCharges: 6; missing: string[] };
  formula: { text: string; example: string; version: number };         // RNF-007-01
}
```

## Endpoints

### `GET /users/me/reputation` [MVP] (RF-007-01 a 05, RF-007-15; CA-007-01, 02, 16, 20)
- **Auth:** sesión. **Response 200:** `ReputationDetail`. Con menos de 3 cobros considerados: `level: "Nuevo"`, `stars: null`. `recent` trae hasta 20 cobros con su resultado; los de origen `ingreso` no aparecen como considerados (RN-007-09, CA-007-22), y los excluidos llevan `countsForRating: false`.

### `GET /groups/:groupId/ranking` (RF-007-09 a 11; CA-007-10, 11, 12) — P2
- **Auth:** miembro activo (`404` si no pertenece). **Response 200:**
  ```json
  { "items": [ { "position": 1, "user": { "userId": "…", "fullName": "…" }, "rating": { "level": "Excelente", "stars": 5, "starsLabel": "5 de 5" }, "streak": 7 } ],
    "unranked": [ { "user": {…}, "rating": { "level": "Nuevo", "stars": null } } ] }
  ```
  Orden: calificación exacta descendente, luego racha actual, luego antigüedad en el grupo. Los "Nuevo" van en `unranked`, sin posición. El titular aparece solo si tiene cobros como miembro en otros grupos (RF-007-11). Nunca devuelve montos ni comprobantes.

### `GET /users/me/badges` (RF-007-06 a 08; CA-007-08, 09) — P2
- **Response 200:** `{ earned: [{ code, name, description, earnedAt }], pending: [{ code, name, description, condition, progress: { current, target } }] }`.

### `POST /charges/:chargeId/reputation-report` (RF-007-14) — P2
- **Auth:** dueño del cobro. **Request:** `{ comment }` (10–300). **Response 201.** **Errores:** `422 CHARGE_ALREADY_EXCLUDED`, `422 REPORT_ALREADY_SENT`.

### `POST /charges/:chargeId/reputation-exclusion` (RF-007-14; CA-007-13) — P2
- **Auth:** titular del grupo. **Request:** `{ reason }` (10–300). **Response 200.** Queda registrado quién y cuándo. La calificación del dueño se recalcula en la misma operación.

## Servicios internos (no son endpoints)

| Servicio / puerto | Lo usa | Qué hace |
|---|---|---|
| `ReputationQueryPort.getRatings(userIds)` → `Map<userId, Rating>` [MVP] | Specs 001, 008, 009, 010 | Calificación pública (estrellas y nivel) desde `user_reputation`. |
| `ReputationQueryPort.checkHostRating(userId, now)` [MVP] | Adaptador `HostEligibilityPort` (spec 001) | Calcula **en el momento** si cumple 4,5 estrellas y 6 cobros considerados (RF-007-15, CA-007-20, 21). |
| `ChargeFactsPort` (lo define `reputation`, lo implementa `billing`) | Spec 007 | Entrega por cobro: estado, origen, vencimiento, primera subida, última subida, pago manual, si hubo un rechazo «comprobante inválido» y si el grupo está congelado por baneo. |
| `ReputationService.recomputeUser(tx, userId, now)` [MVP] | Manejadores de eventos de 002/009 | Recalcula y guarda `user_reputation` en la misma transacción. |

### Tareas programadas

| Tarea | Frecuencia | Efecto |
|---|---|---|
| `reputation.reconcile` [MVP] | diaria | Recalcula desde los cobros a todos los usuarios con cobros en los últimos 13 meses, corrige diferencias (también las causadas por el paso del tiempo) y registra cuántas halló (RF-007-05, CA-007-14). |
| `reputation.badges` — P2 | con cada recálculo y diaria | Otorga insignias según las reglas versionadas (RN-007-07). |

## Eventos que consume

`ChargeConfirmed`, `ChargeBecameOverdue`, `ChargeCancelled` (spec 002), `GroupFrozen` y `UserBanned` (specs 001 y 009), y las exclusiones de este módulo (CA-007-15).

## Errores propios de la spec

| `code` | HTTP | Cuándo |
|---|---|---|
| `CHARGE_ALREADY_EXCLUDED` | 422 | Reporte de un cobro ya excluido (caso borde). |
| `REPORT_ALREADY_SENT` | 422 | Segundo reporte de la misma persona al mismo cobro. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
