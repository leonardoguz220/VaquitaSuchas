## Qué hace este PR

<!-- Una o dos frases. -->

## Capa y tarea

- Capa: `BD` / `BE` / `FE`
- Spec: `specs/NNN-nombre/spec.md`
- Tarea: `T#` de `tasks.md`
- Criterios de aceptación cubiertos: `CA-NNN-##`, `CA-NNN-##`

## Checklist general (Definición de terminado)

- [ ] Cumple los criterios de aceptación listados (hay tests que los cubren)
- [ ] Lint y tests pasan en CI
- [ ] La spec / plan / tasks siguen reflejando la realidad (o los actualicé en este PR)
- [ ] No hay secretos, datos reales ni logs de depuración
- [ ] No agregué funcionalidades fuera del alcance de la spec
- [ ] Si cambié el modelo de datos o el contrato de API: actualicé `plan.md` y avisé a las otras capas

## Checklist por capa (marcar solo la que aplica)

**BD**
- [ ] Migración reversible y probada desde cero
- [ ] Restricciones (únicas, claves foráneas, checks) cubren las reglas de integridad
- [ ] Índices para las consultas previstas

**Backend**
- [ ] Permisos validados en el servidor (rol y pertenencia al grupo)
- [ ] Dinero en centavos enteros; sin `float`
- [ ] Transiciones de estado solo por la función de dominio
- [ ] Errores con código HTTP correcto

**Frontend**
- [ ] Estados de carga, vacío y error
- [ ] Funciona en celular
- [ ] No calcula reglas de negocio (solo muestra lo que devuelve la API)
- [ ] Textos en español (Bolivia) y montos con formato `Bs 25,50`

## Evidencia

<!-- Capturas, GIF o salida de tests. -->

## Notas para el revisor (de otra capa)

<!-- Decisiones tomadas, dudas, partes que quieres que se revisen con más cuidado. -->
