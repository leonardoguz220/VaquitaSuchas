/** Lista cerrada de categorías del catálogo (RF-004-03); coincide con el CHECK de `catalog_services`. */
export const CATEGORIES = [
  { value: 'video', label: 'Video' },
  { value: 'musica', label: 'Música' },
  { value: 'juegos', label: 'Juegos' },
  { value: 'educacion', label: 'Educación' },
  { value: 'almacenamiento', label: 'Almacenamiento' },
  { value: 'otras', label: 'Otras' },
] as const;

export type Category = (typeof CATEGORIES)[number]['value'];

export function isCategory(value: unknown): value is Category {
  return CATEGORIES.some((c) => c.value === value);
}

/** Etiqueta en español para mostrar (`musica` → `Música`). */
export function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
