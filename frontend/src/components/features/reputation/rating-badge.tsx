import { Badge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import type { Rating } from '@/services/reputation';
import { formatDecimal, levelTone } from './reputation-messages';

/** Ruta de una estrella de 5 puntas en un cuadro de 24 × 24. */
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

type StarSize = 'md' | 'lg';

const STAR_SIZE: Record<StarSize, string> = { md: 'size-5', lg: 'size-7' };

/**
 * Una estrella, llena según `fill` (0 a 1). La parte llena va recortada encima del contorno, así
 * se ve la media estrella. Es solo dibujo: el valor lo entrega la API.
 */
function Star({ fill, size }: { fill: number; size: StarSize }) {
  const box = STAR_SIZE[size];
  return (
    <span className={cx('relative inline-block shrink-0', box)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cx('absolute inset-0 text-field-border', box)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d={STAR_PATH} />
      </svg>
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${fill * 100}%` }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cx('text-[#B7791F]', box)}
          fill="currentColor"
        >
          <path d={STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

/** Cinco estrellas para un valor de 0 a 5 en pasos de media estrella. */
function StarRow({ value, size }: { value: number; size: StarSize }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((index) => (
        <Star key={index} size={size} fill={Math.min(1, Math.max(0, value - index))} />
      ))}
    </span>
  );
}

export interface RatingBadgeProps {
  rating: Pick<Rating, 'level' | 'stars' | 'starsLabel'>;
  size?: StarSize;
  className?: string;
}

/**
 * Calificación de una persona (RF-007-02, RNF-007-06): estrellas, el valor numérico («4,5 de 5») y
 * el nivel en texto con su ícono. Con `stars: null` (Nuevo) no hay estrellas: solo el nivel. Lo usan
 * las solicitudes (010), los cupos (008) y el ranking (007). No calcula nada: muestra lo que llega.
 */
export function RatingBadge({ rating, size = 'md', className }: RatingBadgeProps) {
  const { level, stars, starsLabel } = rating;
  const label = starsLabel ?? (stars === null ? null : `${formatDecimal(stars)} de 5`);
  const showStars = stars !== null && label !== null;

  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {showStars && (
        <>
          <StarRow value={stars} size={size} />
          <span className={cx('font-display font-bold', size === 'lg' ? 'text-3xl' : 'text-lg')}>
            {label}
          </span>
        </>
      )}
      <Badge variant={levelTone(level)}>{level}</Badge>
    </span>
  );
}
