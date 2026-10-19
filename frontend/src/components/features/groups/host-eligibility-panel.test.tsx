import { render, screen } from '@testing-library/react';
import type { HostEligibility } from '@/services/groups';
import { HostEligibilityPanel } from './host-eligibility-panel';

const base: HostEligibility = {
  eligible: false,
  source: null,
  activeGroups: 0,
  maxActiveGroups: 5,
  canCreateMore: true,
  requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
  current: { stars: 4, consideredCharges: 3, level: 'Bueno' },
};

function renderPanel(eligibility: HostEligibility) {
  render(<HostEligibilityPanel open onClose={() => {}} eligibility={eligibility} />);
}

describe('HostEligibilityPanel (RF-001-21, CA-001-24)', () => {
  it('muestra las estrellas y el nivel cuando hay calificación', () => {
    renderPanel(base);
    expect(screen.getByText('4,0 (Bueno)')).toBeInTheDocument();
  });

  it('CA-001-24: con stars null muestra «Sin calificación todavía» y no formatea un número', () => {
    renderPanel({ ...base, current: { stars: null, consideredCharges: 0, level: null } });
    expect(screen.getByText('Sin calificación todavía')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('CA-001-24: con level null no deja «(null)» en pantalla', () => {
    renderPanel({ ...base, current: { stars: 3.5, consideredCharges: 1, level: null } });
    expect(screen.getByText('3,5')).toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });
});
