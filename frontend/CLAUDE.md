# Frontend

Responsable: Adrian Vargas. La carpeta se llena al implementar la spec 000; hasta entonces solo existe esta guía.

El frontend es una aplicación Next.js con React, TypeScript y Tailwind CSS organizada en `app`, `components`, `hooks`, `services` y `lib`. La descripción completa está en [`../context/arquitectura.md`](../context/arquitectura.md).

Reglas de esta parte del código:

- Las páginas componen componentes y no llaman a la API directamente.
- Los componentes de `ui/` son la base; los de `features/` los combinan para cada módulo.
- Los datos llegan por hooks que usan las funciones de `services/`, una por endpoint del contrato.
- El token vive en una cookie httpOnly y todas las llamadas pasan por el proxy `/api/[...path]`.
- El frontend no calcula cuotas, montos ni estados: muestra lo que entrega la API.
- Cada vista con datos cubre los estados de carga, vacío, error y con datos, y se diseña primero para celular.
- Los montos se muestran como `Bs 25,50` y las fechas en America/La_Paz, con funciones de `lib/`.

Skills relacionadas: `vaquita-nextjs-conventions`, `frontend-ui-engineering`.
