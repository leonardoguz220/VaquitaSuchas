import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { UserSelf } from '../../users/domain/user-self.js';
import { UserSelfService } from '../../users/services/user-self.service.js';
import { normalizeEmail } from '../domain/email.js';
import { keyHash } from '../domain/key-hash.js';
import { canLogin } from '../domain/login.js';
import { LOGIN_IP_MAX_FAILURES, LOGIN_WINDOW_MS, loginLockStatus } from '../domain/login-lock.js';
import { LoginRepository } from '../repositories/login.repository.js';
import { RateLimitRepository } from '../repositories/rate-limit.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

function invalidCredentials(): DomainError {
  return new DomainError('INVALID_CREDENTIALS', 401, 'Correo o contraseña incorrectos.');
}

/** Inicio y cierre de sesión (RF-003-06, 07, 09, 20; RNF-003-02, 03). */
@Injectable()
export class LoginService {
  private readonly fingerprintKey: string;

  constructor(
    config: ConfigService,
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly logins: LoginRepository,
    private readonly selfView: UserSelfService,
    private readonly limits: RateLimitRepository,
  ) {
    this.fingerprintKey = config.getOrThrow<string>('FINGERPRINT_KEY');
  }

  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<{ sessionToken: string; user: UserSelf }> {
    const normalized = normalizeEmail(email);
    const emailKey = keyHash(this.fingerprintKey, 'email', normalized);
    const ipKey = keyHash(this.fingerprintKey, 'ip', ip);
    await this.assertNotLocked(emailKey, ipKey);

    const account = await this.logins.findByEmail(this.db, normalized);
    // Siempre se verifica un hash (el de relleno si no hay cuenta) para igualar el tiempo.
    const enabled = account !== null && canLogin(account);
    const matches = await this.hasher.verifyAgainst(
      enabled ? account.password_hash : null,
      password,
    );
    if (!enabled || !matches) {
      const failedAt = this.clock.now();
      await this.limits.record(this.db, 'login_fail:email', emailKey, failedAt);
      await this.limits.record(this.db, 'login_fail:ip', ipKey, failedAt);
      throw invalidCredentials();
    }

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

  // 5 fallos en 15 min por correo y 20 por IP bloquean el inicio de sesión (RF-003-17).
  private async assertNotLocked(emailKey: string, ipKey: string): Promise<void> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
    const byEmail = loginLockStatus(
      await this.limits.timestampsSince(this.db, 'login_fail:email', emailKey, since),
      now,
    );
    const byIp = loginLockStatus(
      await this.limits.timestampsSince(this.db, 'login_fail:ip', ipKey, since),
      now,
      LOGIN_IP_MAX_FAILURES,
    );
    const until = Math.max(byEmail.until?.getTime() ?? 0, byIp.until?.getTime() ?? 0);
    if (until > 0) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
        retryAfterSeconds: Math.max(1, Math.ceil((until - now.getTime()) / 1000)),
      });
    }
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
