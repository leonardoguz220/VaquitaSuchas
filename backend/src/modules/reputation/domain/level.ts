export type ReputationLevel = 'Nuevo' | 'En riesgo' | 'Regular' | 'Bueno' | 'Excelente';

/** Nivel según las medias estrellas mostradas (RF-007-03): 10 Excelente, 8–9 Bueno, 6–7 Regular, ≤ 5 En riesgo. */
export function levelFor(halfStars: number): Exclude<ReputationLevel, 'Nuevo'> {
  if (halfStars >= 10) return 'Excelente';
  if (halfStars >= 8) return 'Bueno';
  if (halfStars >= 6) return 'Regular';
  return 'En riesgo';
}

/** «4,5 de 5» (RNF-007-06). */
export function starsLabel(halfStars: number): string {
  const whole = Math.floor(halfStars / 2);
  return halfStars % 2 === 0 ? `${whole} de 5` : `${whole},5 de 5`;
}
