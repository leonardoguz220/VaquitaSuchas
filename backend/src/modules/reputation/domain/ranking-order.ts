export interface RankingCandidate {
  userId: string;
  /** Medias estrellas mostradas; `null` = «Nuevo» (va aparte, sin posición). */
  halfStars: number | null;
  punctualCount: number;
  consideredCount: number;
  currentStreak: number;
  /** Ingreso al grupo: la antigüedad desempata. */
  joinedAt: Date;
}

export interface RankingResult<T extends RankingCandidate> {
  ranked: T[];
  unranked: T[];
}

/** Compara `p1/c1` con `p2/c2` en enteros (sin `float`): positivo si el primero es mayor. */
function compareExact(a: RankingCandidate, b: RankingCandidate): number {
  return b.punctualCount * a.consideredCount - a.punctualCount * b.consideredCount;
}

/**
 * Orden del ranking (RF-007-09): calificación exacta descendente, luego racha descendente y
 * luego antigüedad en el grupo (el más antiguo primero). Los «Nuevo» no tienen posición.
 */
export function rankingOrder<T extends RankingCandidate>(members: readonly T[]): RankingResult<T> {
  const ranked = members.filter((m) => m.halfStars !== null);
  const unranked = members.filter((m) => m.halfStars === null);
  ranked.sort(
    (a, b) =>
      // `compareExact` es positivo cuando `b` tiene mejor proporción, así que `a` va después.
      compareExact(a, b) ||
      b.currentStreak - a.currentStreak ||
      a.joinedAt.getTime() - b.joinedAt.getTime() ||
      a.userId.localeCompare(b.userId),
  );
  unranked.sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId),
  );
  return { ranked, unranked };
}
