'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cx } from '@/components/ui/cx';

export interface GroupTab<Id extends string = string> {
  id: Id;
  label: string;
}

export interface GroupTabsProps<Id extends string> {
  /** Prefijo de los ids: `${idPrefix}-tab-${id}` y `${idPrefix}-panel-${id}`. */
  idPrefix: string;
  tabs: readonly GroupTab<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  label: string;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * Barra de pestañas del detalle de un grupo (patrón ARIA «tabs» con activación automática):
 * las flechas, Inicio y Fin mueven la selección; en celular se desplaza en horizontal.
 */
export function GroupTabs<Id extends string>({
  idPrefix,
  tabs,
  selected,
  onSelect,
  label,
}: GroupTabsProps<Id>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === selected);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    refs.current[id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {tabs.map((tab) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={cx(
              '-mb-px inline-flex min-h-12 shrink-0 items-center border-b-4 px-4 font-bold whitespace-nowrap transition-colors',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:border-line hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
