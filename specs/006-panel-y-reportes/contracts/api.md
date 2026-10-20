# Contrato de API — Spec 006: Panel y reportes

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. Todos los montos son enteros en centavos de Bs (`...Cents`); las fechas de calendario son `YYYY-MM-DD` en La Paz y los instantes ISO 8601 en UTC.
- Todo endpoint trabaja sobre el usuario de la sesión (`/me/...`). Un `groupId` que no pertenece al usuario responde `404` (CA-006-18). Las respuestas llevan `Cache-Control: private, no-store` (RNF-006-02).
- `month` es `YYYY-MM` y por defecto el mes actual de La Paz; un valor inválido responde `400 VALIDATION_ERROR`.

## Objetos

```ts
DashboardSummary {
  month: string; groupId: string | null;
  availableMonths: string[];              // meses con ciclos o cobros del usuario (selector)
  isEmpty: boolean;                       // sin grupos o sin datos en el mes (RF-006-16)
  hasGroups: boolean;                     // distingue «no tienes grupos» de «sin datos este mes»

  spend: {                                // RF-006-02, RN-006-02
    totalCents: number; paidCents: number;                // paidCents suma solo cobros de miembro `pagado`
    lines: SpendLine[];                                   // Σ lines.costCents = totalCents (CA-006-22)
  };
  savings: {                              // RF-006-03, RN-006-03
    totalCents: number | null;            // null si ninguna suscripción tiene dato
    estimated: true;                      // siempre «estimado»
    lines: SavingsLine[];                 // solo las que tienen dato; pueden ser negativas
    withoutData: { groupId: string; serviceName: string }[];   // «sin dato»
    negativeNote: string | null;          // nota si totalCents < 0 o alguna línea es negativa
  };
  debts: {                                // RF-006-04 — todos los períodos, no solo el mes elegido
    totalCents: number; count: number;                    // pendiente + atrasado
    inReviewCents: number; inReviewCount: number;         // en_revision, aparte (RN-006-04)
  };
  owed: null | {                          // RF-006-05, solo si es titular de algún grupo
    totalCents: number; count: number;                    // pendiente + atrasado + en_revision (RN-006-05)
    groups: { groupId; groupName; serviceName; totalCents; count }[];
  };
  collection: CollectionSummary[];        // RF-006-06, uno por grupo del que es titular (del mes elegido)
}

SpendLine   { groupId; groupName; serviceName; logoUrl; role: "miembro" | "titular";
              costCents: number; paidCents: number | null }     // null para el titular: su cuota es de referencia
SavingsLine { groupId; serviceName; role; individualPriceBsCents: number; shareCents: number; savingsCents: number }

CollectionSummary {                       // RF-006-06; CA-006-09
  groupId; groupName; serviceName; period: string;
  expectedCents: number; collectedCents: number; inReviewCents: number; pendingCents: number;
  percentCollected: number | null;        // entero 0–100, mitad hacia arriba; null si expectedCents = 0
  lateMembers: { userId; fullName; chargeId; amountCents: number; dueDate: string; daysLate: number }[];
}

ChargeLine {                              // elemento de las listas «debo», «en revisión» y «me deben»
  chargeId; groupId; groupName; serviceName; period: string;
  memberName: string | null;              // solo en «me deben»
  amountCents: number; status: "pendiente" | "atrasado" | "en_revision"; dueDate: string;
  link: string;                           // "/cobros/<id>" (subir comprobante o revisar)
}

HistoryItem {                             // RF-006-13
  chargeId; period; groupId; groupName; serviceName;
  amountCents; status; origin: "ciclo" | "ingreso"; dueDate: string; paidAt: string | null;
}
```

## Endpoints: panel [P1]

### `GET /me/dashboard?month=&groupId=` (RF-006-01 a 06; CA-006-01 a 10, 14, 18, 20, 21, 22)
- **Query:** `month` (por defecto el actual), `groupId` (filtra gasto, ahorro, cobranza y gráficos por una suscripción).
- **Response 200:** `DashboardSummary`. Sin grupos o sin datos: valores en cero y `isEmpty: true`, no un error. Los meses pasados usan las copias del ciclo y el cobro (CA-006-10). **Errores:** `400` (mes inválido), `404` (`groupId` ajeno).
- Rendimiento: p95 < 1 s con 20 suscripciones y 12 meses (CA-006-19).

### `GET /me/dashboard/lists?list=debts|in_review|owed&groupId=&limit=&cursor=` (RF-006-04, 05; CA-006-06 a 08)
- **Response 200:** `{ items: ChargeLine[], nextCursor }`. `debts`: cobros propios `pendiente` y `atrasado` de todos los períodos, del más vencido al más reciente; `in_review`: los propios `en_revision`; `owed`: cobros de miembros de grupos donde es titular, agrupables con `groupId`. `owed` para quien no es titular de ningún grupo responde `403`.

### `GET /me/dashboard/charts?month=&groupId=` (RF-006-07 a 10; CA-006-11, 12)
- **Response 200:**
  ```ts
  {
    monthly:    { period: string; totalCents: number; paidCents: number }[];     // hasta 12 meses, termina en `month`; sin huecos
    byService:  { groupId: string; serviceName: string; costCents: number }[];   // del mes elegido
    savings:    { period: string; savingsCents: number | null; cumulativeCents: number }[];   // 12 meses; null = sin dato
  }
  ```
  Con menos de 12 meses de datos, la serie empieza en el primer mes con datos. Cada serie trae todos los valores para que el cliente muestre la tabla alternativa sin otra llamada.

### `GET /me/calendar?month=` y `GET /me/calendar/upcoming?days=30` (RF-006-11, 12; CA-006-13)
- **Response 200:** `{ month?, events: CalendarEvent[] }` con
  ```ts
  CalendarEvent { date: string; kind: "corte" | "vencimiento"; groupId; groupName; serviceName;
                  role: "miembro" | "titular"; amountCents: number; estimated: boolean;
                  chargeId: string | null; status: string | null }
  ```
  `corte`: fecha de corte del grupo en el mes, ajustada (RN-001-06; día 31 en febrero → 28 o 29). `vencimiento`: último día de pago de cada cobro abierto. `estimated: true` cuando el cobro o ciclo todavía no existe (cuota = `splitShares` con los miembros actuales; titular: cuota de referencia). Los grupos cerrados aparecen en meses pasados pero no en meses futuros. `days` va de 1 a 90.

### `GET /groups/:groupId/collection?period=` (RF-006-06; HU-006-04)
- **Auth:** titular (`403` miembro, `404` ajeno). **Response 200:** `CollectionSummary & { availablePeriods: string[]; members: { userId; fullName; chargeId; amountCents; status }[] }`. Sin comprobantes ni referencias (RNF-006-03).

## Endpoints: historial y exportación [P1]

### `GET /me/history?period=&groupId=&status=&limit=&cursor=` (RF-006-13)
- **Response 200:** `{ items: HistoryItem[], nextCursor }` con **todos** los cobros propios, también `cancelado` y de grupos que dejó (son datos propios). Orden por período descendente. `status` admite varios valores.

### `GET /me/history/export.csv?period=&groupId=&status=` (RF-006-14, 15; CA-006-15, 16)
- **Response 200:** `text/csv; charset=utf-8`, con BOM, `Content-Disposition: attachment; filename="vaquita-historial-AAAA-MM-DD.csv"`.
- **Columnas:** `periodo,servicio,grupo,monto_bs,estado,vencimiento,fecha_pago,origen`. Separador coma; `monto_bs` con punto decimal (`25.50`); fechas `AAAA-MM-DD` de La Paz; texto entre comillas cuando hace falta (RFC 4180); las celdas de texto que empiezan con `=`, `+`, `-` o `@` (o tabulación o retorno) se anteponen con `'` (RNF-006-04).
- **Errores:** `429 RATE_LIMITED` (10 exportaciones por hora por usuario), `422 BUSINESS_RULE` (`EXPORT_TOO_LARGE`: más de 20.000 filas; filtrar por período).

### `GET /groups/:groupId/history/export.csv?period=&userId=&status=` (RF-006-14; CA-006-17)
- **Auth:** titular (`403` miembro: solo puede exportar el suyo; `404` ajeno). Mismas reglas y columnas más `miembro` (nombre, escapado) entre `grupo` y `monto_bs`. Nunca incluye comprobantes, referencias ni celulares.

## Aclaraciones de la implementación (verificadas en `backend/src/modules/reports`)

- **Paginación** (`/me/dashboard/lists` y `/me/history`): `limit` por omisión 20 y máximo 50; un valor mayor responde `400 VALIDATION_ERROR`. Un `cursor` ilegible responde `400 VALIDATION_ERROR` con `fields.cursor = ["INVALID_CURSOR"]`.
- **`isEmpty`** es `true` solo si el mes no tiene líneas **y** no hay deudas de otros períodos (cobros `pendiente`/`atrasado` ni `en_revision` fuera del mes consultado).
- `GET /me/calendar/upcoming?days=`: `days` fuera de 1–90 responde `400 VALIDATION_ERROR`.
- **Nombres de los CSV:** `vaquita-historial-AAAA-MM-DD.csv` (propio) y `vaquita-historial-grupo-AAAA-MM-DD.csv` (de grupo); la fecha es la de generación en La Paz.
- La prueba de rendimiento de RNF-006-01 es `backend/test/dashboard.perf.e2e-spec.ts`.

## Servicios internos

| Servicio | Lo usan | Qué hace |
|---|---|---|
| `SubscriptionMembershipQuery.groupIdsOf(userId)` / `isOwner(userId, groupId)` | `reports` | Pertenencia y titularidad (servicios de `subscriptions`). |
| `ReportsRepository` (solo vistas `v_*` y tablas de lectura con consultas de agregación) | `reports` | Totales en la base de datos con enteros (RNF-006-06). |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
