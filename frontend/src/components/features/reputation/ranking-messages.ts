/** Textos de la pestaña Ranking de `/grupos/[id]` (spec 007, RF-007-09 a 11). Nada aquí calcula. */
export const RANKING_MESSAGES = {
  loading: 'Cargando el ranking…',
  intro: 'Ordenado por calificación de puntualidad. No se muestran montos ni comprobantes.',
  empty: 'Aún no hay miembros con calificación',
  unrankedTitle: 'Sin posición todavía',
  unrankedHint: 'Todavía no tienen calificación, así que no tienen posición.',
  notFoundTitle: 'Grupo no encontrado',
  notFound: 'Este grupo no existe o no eres parte de él.',
  notMemberTitle: 'No eres miembro de este grupo',
  notMember: 'Solo los miembros del grupo pueden ver el ranking.',
  redirecting: 'Redirigiendo para iniciar sesión…',
} as const;

/** Posición visible para lectores de pantalla: «Posición 1». */
export function rankingPositionLabel(position: number): string {
  return `Posición ${position}`;
}

/** Racha actual en texto: «Racha de 7 cobros» o «Racha de 1 cobro». */
export function streakLabel(streak: number): string {
  return `Racha de ${streak} ${streak === 1 ? 'cobro' : 'cobros'}`;
}
