export const HOST_MIN_HALF_STARS = 9;
export const HOST_MIN_CONSIDERED = 6;

export interface HostThreshold {
  ok: boolean;
  missing: string[];
}

/** Habilitación por calificación (RF-007-15): 4,5 estrellas o más y al menos 6 cobros considerados. */
export function meetsHostThreshold(rating: {
  halfStars: number | null;
  consideredCount: number;
}): HostThreshold {
  const missing: string[] = [];
  if (rating.consideredCount < HOST_MIN_CONSIDERED) {
    missing.push(
      `Necesitas al menos ${HOST_MIN_CONSIDERED} cobros considerados (tienes ${rating.consideredCount}).`,
    );
  }
  if (rating.halfStars === null || rating.halfStars < HOST_MIN_HALF_STARS) {
    missing.push('Necesitas una calificación de al menos 4,5 estrellas.');
  }
  return { ok: missing.length === 0, missing };
}
