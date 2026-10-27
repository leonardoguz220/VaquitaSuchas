import { labelServicesByGroup } from './dashboard-charts';

const item = (groupId: string, serviceName: string) => ({ groupId, serviceName, costCents: 100 });

describe('labelServicesByGroup (QA-12)', () => {
  it('añade el nombre del grupo solo a los servicios con el mismo nombre', () => {
    const result = labelServicesByGroup(
      [item('g1', 'Netflix'), item('g2', 'Netflix'), item('g3', 'Spotify')],
      { g1: 'Depa', g2: 'Familia', g3: 'Casa' },
    );
    expect(result.map((entry) => entry.serviceName)).toEqual([
      'Netflix · Depa',
      'Netflix · Familia',
      'Spotify',
    ]);
  });

  it('sin el nombre del grupo deja el servicio como llega', () => {
    const result = labelServicesByGroup([item('g1', 'Netflix'), item('g2', 'Netflix')], {});
    expect(result.map((entry) => entry.serviceName)).toEqual(['Netflix', 'Netflix']);
  });
});
