import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { normalizeFullName } from '../domain/profile.js';
import type { UserSelf } from '../domain/user-self.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { UserSelfService } from './user-self.service.js';

/** Edición del perfil propio (RF-003-14). */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersRepository,
    private readonly selfView: UserSelfService,
  ) {}

  async updateFullName(userId: string, rawName: string): Promise<UserSelf> {
    const fullName = normalizeFullName(rawName);
    if (!fullName) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { fullName: ['INVALID_NAME'] },
      });
    }
    return this.db.withTransaction(async (tx) => {
      await this.users.updateFullName(tx, userId, fullName);
      return (await this.selfView.getById(tx, userId))!;
    });
  }
}
