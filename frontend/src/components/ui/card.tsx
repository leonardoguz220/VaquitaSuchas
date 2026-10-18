import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Semantic element. Use `section` or `article` when the card has its own heading. */
  as?: 'div' | 'section' | 'article';
}

export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx('rounded-card border border-line bg-surface p-5 text-ink sm:p-6', className)}
      {...rest}
    />
  );
}
