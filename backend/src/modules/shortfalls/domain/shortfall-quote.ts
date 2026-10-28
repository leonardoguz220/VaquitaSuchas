/** Un miembro que ya pagó el período y podría tener que agregar algo (RF-011-02). */
export interface PaidMember {
  userId: string;
  fullName: string;
  /** Centavos de Bs que la persona pagó en el período. */
  paidCents: number;
}

export interface QuoteInput {
  /** Total del servicio del ciclo, en centavos de Bs (copia del ciclo). */
  totalBsCents: number;
  /** Miembros que se quedan, titular incluido (RN-011-01). */
  memberCountAfter: number;
  paid: readonly PaidMember[];
}

export interface QuoteRow extends PaidMember {
  /** Lo que debe agregar para llegar a la cuota nueva. */
  extraDueCents: number;
}

export interface ShortfallQuote {
  baseShareCents: number;
  /** Cuota del titular: la base más los centavos sobrantes (RN-001-02). */
  ownerShareCents: number;
  /** Suma de lo que deben agregar los afectados. */
  shortfallCents: number;
  /** Solo los afectados: quienes deben agregar algo, en el orden recibido. */
  rows: QuoteRow[];
}

const assertCents = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} debe ser un entero de centavos mayor o igual a cero.`);
  }
};

/**
 * Cotización del faltante (RN-011-01, RN-011-02): `cuota_nueva = floor(total / miembros)`, el resto
 * va al titular y cada afectado agrega `max(cuota_nueva − pagado, 0)`. Todo en enteros. Con menos
 * de 2 miembros no hay a quién repartir y no hay afectados.
 */
export function quoteShortfall(input: QuoteInput): ShortfallQuote {
  assertCents(input.totalBsCents, 'totalBsCents');
  if (!Number.isInteger(input.memberCountAfter) || input.memberCountAfter < 1) {
    throw new RangeError('memberCountAfter debe ser un entero mayor o igual a 1.');
  }
  const baseShareCents = Math.floor(input.totalBsCents / input.memberCountAfter);
  const remainder = input.totalBsCents - baseShareCents * input.memberCountAfter;
  const ownerShareCents = baseShareCents + remainder;
  if (input.memberCountAfter < 2) {
    return { baseShareCents, ownerShareCents, shortfallCents: 0, rows: [] };
  }
  const rows: QuoteRow[] = [];
  let shortfallCents = 0;
  for (const member of input.paid) {
    assertCents(member.paidCents, 'paidCents');
    const extraDueCents = Math.max(baseShareCents - member.paidCents, 0);
    if (extraDueCents === 0) continue;
    rows.push({ ...member, extraDueCents });
    shortfallCents += extraDueCents;
  }
  return { baseShareCents, ownerShareCents, shortfallCents, rows };
}
