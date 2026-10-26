import { render, screen } from '@testing-library/react';
import type { Charge } from '@/services/charges';
import { ChargeDue } from './charge-due';

const base = { dueAt: '2026-10-09T04:00:00.000Z', paidAt: null } as Charge;

describe('ChargeDue (QA-05)', () => {
  it('en revisión muestra el día de vencimiento sin la hora «00:00»', () => {
    render(<ChargeDue charge={{ ...base, status: 'en_revision' }} />);
    expect(screen.getByText('Vencimiento: 8 oct 2026')).toBeInTheDocument();
    expect(screen.queryByText(/00:00/)).not.toBeInTheDocument();
  });

  it('atrasado dice «Venció el» con el mismo día', () => {
    render(<ChargeDue charge={{ ...base, status: 'atrasado' }} />);
    expect(screen.getByText('Venció el 8 oct 2026')).toBeInTheDocument();
  });
});
