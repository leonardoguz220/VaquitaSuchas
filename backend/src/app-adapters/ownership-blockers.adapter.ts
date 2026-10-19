import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type { OwnershipBlockersPort } from '../modules/subscriptions/ports/ownership-blockers.port.js';

/**
 * Adaptador por defecto de `OwnershipBlockersPort` (spec 001): informa que NADA bloquea transferir
 * ni cerrar un grupo. Existe porque las solicitudes de ingreso en pago pertenecen a la spec 010
 * (RN-010-09, CA-010-33), que aún no está implementada. Cuando exista, esa spec reemplaza este
 * adaptador por uno que devuelva, p. ej., `['join_requests_in_payment']` para el grupo con
 * solicitudes en `pago_pendiente`; hasta entonces no hay solicitudes que bloqueen.
 */
@Injectable()
export class NoOwnershipBlockersAdapter implements OwnershipBlockersPort {
  blockers(_q: Queryable, _groupId: string): Promise<string[]> {
    return Promise.resolve([]);
  }
}
