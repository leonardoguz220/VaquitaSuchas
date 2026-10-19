const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

function monthIndex(period: string): number {
  const match = PERIOD.exec(period);
  if (!match) throw new Error('Período inválido: se espera AAAA-MM.');
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

/**
 * Cuántos períodos quedaron sin ciclo entre el último ciclo existente y el que se va a generar
 * (research R1: tras una caída larga solo se genera el más reciente y se advierte). Con ciclos
 * en `2026-08` y `2026-10` falta `2026-09`, así que devuelve 1. Nunca es negativo.
 */
export function missedPeriods(latestPeriod: string, nextPeriod: string): number {
  return Math.max(0, monthIndex(nextPeriod) - monthIndex(latestPeriod) - 1);
}
