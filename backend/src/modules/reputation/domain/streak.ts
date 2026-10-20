export interface StreakItem {
  dueAt: Date;
  punctual: boolean;
}

/** Racha (RN-007-05): cobros puntuales consecutivos más recientes por vencimiento; uno no puntual la reinicia. */
export function currentStreak(items: readonly StreakItem[]): number {
  const ordered = [...items].sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  let streak = 0;
  for (const item of ordered) {
    if (!item.punctual) break;
    streak += 1;
  }
  return streak;
}
