# 0003. Alcance de diez módulos, construcción por prioridad

- **Fecha:** 2026-10-17
- **Estado:** aceptada
- **Capas:** todas

## Contexto

Las ideas del grupo cubren diez módulos, desde la autenticación hasta la administración. El equipo decidió llevar todos al profesor y no recortar el alcance por tiempo.

## Decisión

Los diez módulos entran en el alcance. Se construyen en orden de prioridad: MVP (P0), importantes (P1) y extras (P2). Cada etapa se termina y se prueba de punta a punta antes de empezar la siguiente. El orden y las dependencias están en [`specs/00-roadmap.md`](../../specs/00-roadmap.md).

## Consecuencias

- Cada módulo tiene su spec, con revisión por las tres capas.
- Los módulos de P2 (reputación, cupos libres y administración) se escriben ahora como specs pero se construyen al final.
- Si algún módulo no se alcanza a construir, la spec y el roadmap se actualizan para reflejarlo.
