import {
  excludeChargeReputation,
  getGroupRanking,
  MOCK_RANKING_GROUP_ID,
  MOCK_REPUTATION_CHARGE_IDS,
  MOCK_UNRANKED_GROUP_ID,
  reportChargeReputation,
} from './reputation.mock';
import { ApiError } from './http';

describe('simulador de ranking (GET /groups/:groupId/ranking)', () => {
  it('CA-007-10: el grupo de ejemplo trae tres posiciones en orden y rachas distintas', async () => {
    const ranking = await getGroupRanking(MOCK_RANKING_GROUP_ID);
    expect(ranking.items.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(new Set(ranking.items.map((item) => item.streak)).size).toBe(3);
    expect(new Set(ranking.items.map((item) => item.rating.level)).size).toBe(3);
  });

  it('CA-007-11: los «Nuevo» vienen en unranked, sin posición ni estrellas', async () => {
    const ranking = await getGroupRanking(MOCK_RANKING_GROUP_ID);
    expect(ranking.unranked).toHaveLength(2);
    for (const entry of ranking.unranked) {
      expect(entry.rating).toEqual({ level: 'Nuevo', stars: null, starsLabel: null });
      expect(entry).not.toHaveProperty('position');
    }
  });

  it('CA-007-11: un grupo sin miembros rankeables responde items vacío', async () => {
    const ranking = await getGroupRanking(MOCK_UNRANKED_GROUP_ID);
    expect(ranking.items).toEqual([]);
    expect(ranking.unranked.length).toBeGreaterThan(0);
  });

  it('CA-007-12: la respuesta no lleva montos ni comprobantes', async () => {
    const ranking = await getGroupRanking(MOCK_RANKING_GROUP_ID);
    expect(JSON.stringify(ranking)).not.toMatch(/amount|monto|receipt|comprobante|price/i);
  });

  it('responde 404 para un grupo ajeno o inexistente', async () => {
    await expect(getGroupRanking('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('simulador de reportes de calificación (POST reputation-report y reputation-exclusion)', () => {
  it('CA-007-13: reportar un cobro ya excluido responde 422 CHARGE_ALREADY_EXCLUDED', async () => {
    await expect(
      reportChargeReputation(MOCK_REPUTATION_CHARGE_IDS.alreadyExcluded, {
        comment: 'El cobro debería contar a mi favor.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'CHARGE_ALREADY_EXCLUDED' });
  });

  it('CA-007-13: un segundo reporte de la misma persona responde 422 REPORT_ALREADY_SENT', async () => {
    await expect(
      reportChargeReputation(MOCK_REPUTATION_CHARGE_IDS.reportAlreadySent, {
        comment: 'El cobro debería contar a mi favor.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'REPORT_ALREADY_SENT' });
  });

  it('CA-007-13: un reporte válido se resuelve sin cuerpo', async () => {
    await expect(
      reportChargeReputation('c0000000-0000-4000-8000-000000000001', {
        comment: 'El cobro debería contar a mi favor.',
      }),
    ).resolves.toBeUndefined();
  });

  it('CA-007-13: la exclusión del titular se resuelve sin cuerpo', async () => {
    await expect(
      excludeChargeReputation('c0000000-0000-4000-8000-000000000001', {
        reason: 'Pagó fuera de plazo por un viaje.',
      }),
    ).resolves.toBeUndefined();
  });
});
