import { getGroupRanking, MOCK_RANKING_GROUP_ID, MOCK_UNRANKED_GROUP_ID } from './reputation.mock';
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
