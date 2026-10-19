import { Injectable, Logger } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type {
  UserBanned,
  UserReactivated,
  UserSuspended,
} from '../../../shared/events/user-events.js';
import {
  UsersAccountRepository,
  type UserRole,
  type UserStatus,
} from '../repositories/users-account.repository.js';

/** Único punto que escribe `users.status` y `users.role`. Cada cambio cierra las sesiones (RF-003-20). */
@Injectable()
export class UserAccountService {
  private readonly logger = new Logger(UserAccountService.name);

  constructor(
    private readonly repository: UsersAccountRepository,
    private readonly eventBus: TxEventBus,
  ) {}

  async setStatus(tx: DbTransaction, userId: string, status: UserStatus): Promise<void> {
    const version = await this.repository.updateStatus(tx, userId, status);
    if (version === null) throw userNotFound();
    // Sin datos personales: solo id, estado y versión.
    this.logger.log(`Estado de cuenta cambiado: user=${userId} status=${status} sv=${version}`);
    const event: UserSuspended | UserReactivated | UserBanned =
      status === 'suspendido'
        ? { type: 'users.suspended', userId }
        : status === 'baneado'
          ? { type: 'users.banned', userId }
          : { type: 'users.reactivated', userId };
    await this.eventBus.publish(tx, event);
  }

  async setRole(tx: DbTransaction, userId: string, role: UserRole): Promise<void> {
    const version = await this.repository.updateRole(tx, userId, role);
    if (version === null) throw userNotFound();
    this.logger.log(`Rol de cuenta cambiado: user=${userId} role=${role} sv=${version}`);
  }
}

function userNotFound(): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, 404, 'No se encontró el recurso solicitado.');
}
