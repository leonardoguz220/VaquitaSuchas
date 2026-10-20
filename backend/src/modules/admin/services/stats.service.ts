import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { startOfLaPazDay, toLaPazParts } from '../../../shared/domain/la-paz.js';
import { StatsRepository, type PlatformStats } from '../repositories/stats.repository.js';

export const STATS_CACHE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Estadísticas de la plataforma con caché de 5 minutos (spec 009, US7; RNF-009-04). */
@Injectable()
export class StatsService {
  private cached: { at: number; stats: PlatformStats } | null = null;

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly stats: StatsRepository,
  ) {}

  async get(): Promise<PlatformStats> {
    const now = this.clock.now();
    if (this.cached && now.getTime() - this.cached.at < STATS_CACHE_MS) return this.cached.stats;
    const parts = toLaPazParts(now);
    const stats = await this.stats.collect(this.db, {
      period: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`,
      monthStart: startOfLaPazDay(parts.year, parts.month, 1),
      since30d: new Date(now.getTime() - 30 * DAY_MS),
    });
    this.cached = { at: now.getTime(), stats };
    return stats;
  }
}
