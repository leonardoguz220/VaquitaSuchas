/**
 * Cliente de las estadísticas del panel de administración (spec 009, `contracts/api.md`
 * § Estadísticas; RF-009-15 a RF-009-17). Solo agregados: sin detalle de cobros ni comprobantes
 * de personas (CA-009-17). La API puede servir datos con hasta 5 minutos de retraso (RNF-009-04).
 */
import type { ChargeStatus } from './charges';
import { apiRequest } from './http';

/** `GET /admin/stats`: todo lo calcula el backend; el frontend solo lo muestra. */
export interface AdminStats {
  users: { total: number; newThisMonth: number; active30d: number };
  groups: { active: number; closed: number };
  charges: {
    /** `YYYY-MM`. */
    period: string;
    byStatus: Record<ChargeStatus, number>;
    managedCents: number;
  };
  /**
   * Tasa de puntualidad global. [NECESITA ACLARACIÓN] El contrato no dice si va de 0 a 1 o de 0 a
   * 100 ni qué llega sin cobros; se asume una fracción de 0 a 1 y `null` sin datos.
   */
  punctualityRate: number | null;
  /** Hasta 5, en el orden que entrega la API. */
  topServices: Array<{ name: string; groups: number }>;
  listings: { active: number };
  joinRequestsThisMonth: number;
  disputesOpen: number;
}

/** `GET /admin/stats` (RF-009-15; CA-009-16, CA-009-17, CA-009-21). */
export function getAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>('/api/admin/stats');
}
