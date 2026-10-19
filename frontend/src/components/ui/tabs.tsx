'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name of the tab list, for example "Secciones del grupo". */
  label: string;
  items: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern with automatic activation: the arrows select).
 * Arrow keys, Home and End move between tabs; only the selected tab is in the Tab order.
 * The list scrolls horizontally on narrow screens. The selected tab is marked with a bottom
 * border and bold text, not only with color.
 */
export function Tabs({ label, items, selectedId, onSelect, className }: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const selected = items[selectedIndex];

  function focusTab(index: number) {
    const target = (index + items.length) % items.length;
    onSelect(items[target].id);
    tabRefs.current[target]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusTab(moves[event.key]);
  }

  return (
    <div className={cx('flex flex-col gap-5', className)}>
      <div
        role="tablist"
        aria-label={label}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cx(
                '-mb-px inline-flex min-h-12 shrink-0 items-center border-b-[3px] px-4 text-body whitespace-nowrap',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                isSelected
                  ? 'border-primary font-bold text-primary-hover'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {selected.content}
        </div>
      )}
    </div>
  );
}
