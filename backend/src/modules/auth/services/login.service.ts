import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { UserSelf } from '../../users/domain/user-self.js';
import { UserSelfService } from '../../users/services/user-self.service.js';
import { normalizeEmail } from '../domain/email.js';
import { canLogin } from '../domain/login.js';
import { LoginRepository } from '../repositories/login.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

function invalidCredentials(): DomainError {
  return new DomainError('INVALID_CREDENTIALS', 401, 'Correo o contraseña incorrectos.');
}

/** Inicio y cierre de sesión (RF-003-06, 07, 09, 20; RNF-003-02, 03). */
@Injectable()
export class LoginService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly logins: LoginRepository,
    private readonly selfView: UserSelfService,
  ) {}

  async login(email: string, password: string): Promise<{ sessionToken: string; user: UserSelf }> {
    const account = await this.logins.findByEmail(this.db, normalizeEmail(email));
    // Siempre se verifica un hash (el de relleno si no hay cuenta) para igualar el tiempo.
    const enabled = account !== null && canLogin(account);
    const matches = await this.hasher.verifyAgainst(
      enabled ? account.password_hash : null,
      password,
    );
    if (!enabled || !matches) throw invalidCredentials();

    const now = this.clock.now();
    await this.logins.touchLastLogin(this.db, account.id, now);
    const user = await this.selfView.getById(this.db, account.id);
    return {
      sessionToken: this.sessions.issue({
        id: account.id,
        sessionVersion: account.session_version,
      }),
      user: user!,
    };
  }

  /** Incrementa la versión de sesión: los tokens anteriores dejan de servir (CA-003-08, 33). */
  async logout(userId: string): Promise<void> {
    await this.logins.bumpSessionVersion(this.db, userId);
  }

  async me(userId: string): Promise<UserSelf> {
    const user = await this.selfView.getById(this.db, userId);
    if (!user)
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
    return user;
  }
}
