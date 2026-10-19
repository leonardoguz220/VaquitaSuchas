import { Badge, type BadgeIcon, type BadgeTone } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import type { Rating, ReputationLevel } from '@/services/reputation';

interface LevelStyle {
  tone: BadgeTone;
  icon: BadgeIcon;
}

/** Cada nivel tiene texto, icono y color propios: nunca solo el color (RNF-007-06). */
const LEVEL_STYLES: Record<ReputationLevel, LevelStyle> = {
  Excelente: { tone: 'success', icon: 'star' },
  Bueno: { tone: 'success', icon: 'check' },
  Regular: { tone: 'warning', icon: 'minus' },
  'En riesgo': { tone: 'danger', icon: 'alert' },
  Nuevo: { tone: 'neutral', icon: 'dot' },
};

const STAR =
  'M10 1.5 12.6 6.8 18.5 7.7 14.2 11.8 15.2 17.6 10 14.9 4.8 17.6 5.8 11.8 1.5 7.7 7.4 6.8Z';
const LEFT_HALF = 'M10 1.5 10 14.9 4.8 17.6 5.8 11.8 1.5 7.7 7.4 6.8Z';

type StarFill = 'full' | 'half' | 'empty';

/**
 * Las 5 posiciones de estrella para las `stars` que entrega la API (pasos de 0,5). Solo dibuja
 * el valor recibido; no calcula la calificación.
 */
export function starFills(stars: number): StarFill[] {
  return [1, 2, 3, 4, 5].map((position) => {
    if (stars >= position) return 'full';
    if (stars >= position - 0.5) return 'half';
    return 'empty';
  });
}

function StarIcon({ fill, className }: { fill: StarFill; className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} data-fill={fill}>
      <path d={STAR} fill={fill === 'full' ? 'currentColor' : 'none'} stroke="currentColor" />
      {fill === 'half' && <path d={LEFT_HALF} fill="currentColor" />}
    </svg>
  );
}

/** «4,5 de 5»: el texto de la API o, si no llega, el número con coma decimal. */
export function starsText(rating: Rating): string | null {
  if (rating.stars === null) return null;
  return rating.starsLabel ?? `${String(rating.stars).replace('.', ',')} de 5`;
}

export interface RatingBadgeProps {
  rating: Rating;
  /** `lg` para la cabecera de «Mi reputación». */
  size?: 'sm' | 'lg';
  className?: string;
}

/** Nivel en texto con su icono (RF-007-03). */
export function LevelBadge({ level, className }: { level: ReputationLevel; className?: string }) {
  const style = LEVEL_STYLES[level];
  return (
    <Badge variant={style.tone} icon={style.icon} className={className}>
      {level === 'Nuevo' ? 'Nuevo' : `Nivel: ${level}`}
    </Badge>
  );
}

/**
 * Calificación de puntualidad (spec 007, plan §6): estrellas dibujadas, valor numérico («4,5 de
 * 5») y nivel en texto con icono (RNF-007-06). Con nivel «Nuevo» no hay estrellas (RF-007-02).
 * La usan «Mi reputación», el ranking (007), los cupos (008) y las solicitudes (010).
 */
export function RatingBadge({ rating, size = 'sm', className }: RatingBadgeProps) {
  const text = starsText(rating);
  const large = size === 'lg';
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {text !== null && rating.stars !== null ? (
        <>
          <span aria-hidden="true" className="inline-flex text-status-pendiente-fg">
            {starFills(rating.stars).map((fill, index) => (
              <StarIcon key={index} fill={fill} className={large ? 'size-7' : 'size-4'} />
            ))}
          </span>
          <span
            className={cx(
              'font-bold',
              large ? 'font-display text-2xl leading-tight sm:text-3xl' : 'text-[15px]',
            )}
          >
            {text}
          </span>
        </>
      ) : (
        <span className={cx('text-muted', large ? 'text-body' : 'text-[15px]')}>
          Sin estrellas todavía
        </span>
      )}
      <LevelBadge level={rating.level} />
    </span>
  );
}
