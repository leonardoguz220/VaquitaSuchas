# Guía de validación — Spec 006: Panel y reportes

Prerrequisito: specs 000, 001, 002, 003 y 004 en local con el seed de desarrollo (un usuario miembro de 3 grupos y titular de 1, con 12 meses de ciclos y cobros en varios estados).

## 1. Resumen del mes (CA-006-01 a 10, 20 a 22)

```bash
curl -s -b cookies.txt "http://localhost:3000/me/dashboard?month=2026-10" | jq '.spend, .savings, .debts, .owed'
```
**Esperado:** `spend.totalCents` igual a la suma de `lines[].costCents`; los cobros cancelados no suman; «En revisión» fuera de `debts.totalCents`; `savings.estimated` en `true` con `withoutData` para las suscripciones sin precio individual; el titular tiene `owed` y `collection` con `percentCollected` entero.

Pasar un cobro a `pagado` desde la cuenta del titular y repetir la llamada: el cambio aparece de inmediato (sin caché).

## 2. Gráficos y calendario (CA-006-11 a 13)

- `GET /me/dashboard/charts`: `monthly` con 12 meses sin huecos; `byService` con la suma igual al gasto del mes; `savings` con acumulado.
- `GET /me/calendar?month=2027-02`: un grupo con día de cobro 31 aparece el 28.
- En `/panel`, cada gráfico tiene **Ver tabla** con los mismos valores.

## 3. Historial y CSV (CA-006-15 a 17)

1. En `/panel/historial` filtrar por estado y exportar: el archivo abre en una hoja de cálculo con acentos correctos y montos numéricos.
2. Un miembro llamando `GET /groups/<id>/history/export.csv` recibe `403`; el titular, el archivo con la columna `miembro`.
3. Un miembro llamado `=CMD()` (seed `dev`) aparece como `'=CMD()` en el CSV.

## 4. Aislamiento y rendimiento (CA-006-18, 19)

- `GET /me/dashboard?groupId=<grupo ajeno>` → `404`.
- `npm run test -w backend -- dashboard.perf` siembra 20 suscripciones × 12 meses y exige p95 < 1 s.
