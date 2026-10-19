export interface ReceiptSubmission {
  submittedAt: Date;
}

export interface ReceiptRejection {
  type: 'rejected';
  invalidReceipt: boolean;
  at: Date;
}

/** Puntual si la primera subida fue estrictamente antes del vencimiento (RN-002-05). */
export function isPunctual(firstSubmittedAt: Date, dueAt: Date): boolean {
  return firstSubmittedAt.getTime() < dueAt.getTime();
}

/**
 * Instante que cuenta para la puntualidad (RN-002-08, RF-007-12): la primera subida, o la última
 * si el titular rechazó algún comprobante marcándolo como inválido. Null si no hay subidas.
 */
export function punctualityDate(
  receipts: readonly ReceiptSubmission[],
  events: readonly ReceiptRejection[],
): Date | null {
  if (receipts.length === 0) return null;
  const times = receipts.map((r) => r.submittedAt.getTime()).sort((a, b) => a - b);
  const hadInvalid = events.some((e) => e.type === 'rejected' && e.invalidReceipt);
  return new Date(hadInvalid ? (times[times.length - 1] as number) : (times[0] as number));
}
