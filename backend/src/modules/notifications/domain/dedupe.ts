// Clave de deduplicación (RNF-005-01): repetir una tarea o un evento no duplica avisos. La base
// tiene UNIQUE(dedupe_key); esta función solo garantiza que la misma situación produzca siempre la
// misma clave. Es pura y estable: no depende del reloj ni de valores aleatorios.

export interface DedupeEntity {
  type: string;
  id: string;
}

const SEPARATOR = '|';

function part(label: string, value: string | number): string {
  const text = String(value);
  if (text.length === 0 || text.includes(SEPARATOR)) {
    throw new Error(`Valor no permitido para ${label} en la clave de deduplicación.`);
  }
  return text;
}

/**
 * `tipo|entidad:id[|periodo][|n][|destinatario]`. El período (p. ej. `2026-10`) y el número de
 * recordatorio distinguen repeticiones legítimas; el destinatario es obligatorio cuando una misma
 * entidad avisa a varias personas (por ejemplo, todos los miembros de un grupo cerrado).
 * Los segmentos opcionales van marcados (`p=`, `n=`, `u=`) para que no se confundan entre sí.
 */
export function dedupeKey(
  type: string,
  entity: DedupeEntity,
  period?: string,
  n?: number,
  recipient?: string,
): string {
  const segments = [
    part('type', type),
    `${part('entity.type', entity.type)}:${part('entity.id', entity.id)}`,
  ];
  if (period !== undefined) segments.push(`p=${part('period', period)}`);
  if (n !== undefined) {
    if (!Number.isInteger(n) || n < 0)
      throw new Error('El número de recordatorio debe ser un entero no negativo.');
    segments.push(`n=${n}`);
  }
  if (recipient !== undefined) segments.push(`u=${part('recipient', recipient)}`);
  return segments.join(SEPARATOR);
}
