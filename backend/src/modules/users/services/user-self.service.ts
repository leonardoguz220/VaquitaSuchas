import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { toUserSelf, type UserSelf } from '../domain/user-self.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { IdentityService } from './identity.service.js';

/** Vista de la propia cuenta (`UserSelf`): descifra la CI solo para enmascararla. */
@Injectable()
export class UserSelfService {
  constructor(
    private readonly users: UsersRepository,
    private readonly identity: IdentityService,
  ) {}

  async getById(q: Queryable, userId: string): Promise<UserSelf | null> {
    const row = await this.users.findSelfById(q, userId);
    if (!row) return null;
    return toUserSelf(row, this.identity.decryptCi(row.ci_encrypted));
  }
}
