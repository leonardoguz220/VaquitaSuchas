/** Joins class names, skipping empty values. Internal helper of the ui components. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
