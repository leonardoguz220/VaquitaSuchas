export const HIDE_THRESHOLD = 3;

export interface ReportInfo {
  reporterId: string;
  createdAt: Date;
}

/**
 * Se oculta con `>= 3` reportes de usuarios distintos posteriores a `moderation_cleared_at`
 * (RF-008-18, CA-008-17). Sin restauración previa (`null`) cuentan todos.
 */
export function shouldHide(
  reports: readonly ReportInfo[],
  moderationClearedAt: Date | null,
): boolean {
  const distinct = new Set(
    reports
      .filter(
        (r) =>
          moderationClearedAt === null || r.createdAt.getTime() > moderationClearedAt.getTime(),
      )
      .map((r) => r.reporterId),
  );
  return distinct.size >= HIDE_THRESHOLD;
}
