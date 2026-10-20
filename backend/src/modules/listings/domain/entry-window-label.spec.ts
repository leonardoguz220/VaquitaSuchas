import { entryWindow } from '../../subscriptions/domain/entry-window.js';
import { entryWindowLabel } from './plain-text.js';

const group = { billingDay: 15, createdAt: new Date('2026-01-02T12:00:00Z') };

describe('entryWindowLabel', () => {
  it('CA-008-23: ventana abierta → «abierta hasta [fecha]»', () => {
    const w = entryWindow(group, new Date('2026-10-16T15:00:00Z'));
    expect(entryWindowLabel(w)).toBe('abierta hasta 18/10/2026');
  });

  it('CA-008-23: ventana cerrada → «se abre el [fecha]»', () => {
    const w = entryWindow(group, new Date('2026-10-25T15:00:00Z'));
    expect(entryWindowLabel(w)).toBe('se abre el 15/11/2026');
  });
});
