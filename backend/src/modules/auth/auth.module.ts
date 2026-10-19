import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { AUTH_SESSION_PORT } from '../../shared/ports/auth-session.port.js';
import { SessionRenewalInterceptor } from './controllers/session-renewal.interceptor.js';
import { PurgeUnverifiedJob } from './jobs/purge-unverified.job.js';
import { AuthSessionRepository } from './repositories/auth-session.repository.js';
import { UnverifiedUsersRepository } from './repositories/unverified-users.repository.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { SessionService } from './services/session.service.js';

// DbService, Clock, ConfigService y JobRegistry llegan de módulos globales.
@Module({
  providers: [
    AuthSessionRepository,
    UnverifiedUsersRepository,
    AuthSessionService,
    SessionService,
    { provide: AUTH_SESSION_PORT, useExisting: AuthSessionService },
    { provide: APP_INTERCEPTOR, useClass: SessionRenewalInterceptor },
  ],
  exports: [AUTH_SESSION_PORT, SessionService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly unverified: UnverifiedUsersRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(new PurgeUnverifiedJob(this.unverified));
  }
}
