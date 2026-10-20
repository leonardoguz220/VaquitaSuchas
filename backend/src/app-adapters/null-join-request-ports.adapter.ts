import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type { AuditPort } from '../modules/join-requests/ports/audit.port.js';
import type { BanPort } from '../modules/join-requests/ports/ban.port.js';
import type {
  ReputationQueryPort,
  UserReputation,
} from '../modules/join-requests/ports/reputation-query.port.js';

// Adaptadores por defecto de los puertos que la spec 010 consume de specs futuras. Se reemplazan
// al implementarse la spec 009 (baneo y auditoría) y la 007 (calificación).

/** Sin la spec 009 no existe baneo: no hace nada (decisión por confirmar). */
@Injectable()
export class NullBanAdapter implements BanPort {
  ban(): Promise<null> {
    return Promise.resolve(null);
  }
}

/** Hasta la spec 009 no hay log de auditoría: no registra nada (decisión por confirmar). */
@Injectable()
export class NullAuditAdapter implements AuditPort {
  record(): Promise<void> {
    return Promise.resolve();
  }
}

/** Hasta la spec 007 todas las personas aparecen como «Sin calificación». */
@Injectable()
export class NullReputationAdapter implements ReputationQueryPort {
  getMany(_q: Queryable, userIds: readonly string[]): Promise<Map<string, UserReputation>> {
    return Promise.resolve(new Map(userIds.map((id) => [id, { stars: null, level: null }])));
  }
}
