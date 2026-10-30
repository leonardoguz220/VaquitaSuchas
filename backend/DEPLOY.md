# Despliegue del backend

El backend (NestJS) se despliega en Render con plan gratuito, junto a su base PostgreSQL.

| Qué                                       | Dónde                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Configuración de Render (servicio y base) | [`../render.yaml`](../render.yaml): Blueprint, rama `main`, `buildCommand` y `startCommand`                              |
| Despliegue continuo                       | [`../.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml): prueba y luego pide el despliegue |
| Pruebas                                   | [`../.github/workflows/backend.yml`](../.github/workflows/backend.yml)                                                  |
| Migraciones de la base                    | [`../.github/workflows/migrate-staging.yml`](../.github/workflows/migrate-staging.yml), manual y solo desde `main`      |
| Variables de entorno                      | `.env.example` de esta carpeta; en Render se cargan en **Environment** (los secretos no van al repositorio)             |

Flujo: un cambio en `backend/` o `database/` llega a `main` por la promoción `dev → qa → main`, el workflow ejecuta las pruebas y, si pasan, pide el despliegue a Render con el secreto `RENDER_DEPLOY_HOOK_URL`. Comprobación: `GET /health` del servicio responde `status: ok` con la base `up`.

El `render.yaml` está en la raíz porque Render lee el Blueprint de ahí; esta nota deja a mano todo lo que despliega la carpeta.
