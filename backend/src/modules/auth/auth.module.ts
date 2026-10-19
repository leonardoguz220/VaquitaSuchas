import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TelegramDispatcher } from '../telegram/services/telegram-dispatcher.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { UsersModule } from '../users/users.module.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { AUTH_SESSION_PORT } from '../../shared/ports/auth-session.port.js';
import { AuthController } from './controllers/auth.controller.js';
import { SessionRenewalInterceptor } from './controllers/session-renewal.interceptor.js';
import { PurgeUnverifiedJob } from './jobs/purge-unverified.job.js';
import { LoginRepository } from './repositories/login.repository.js';
import { PhoneTokensRepository } from './repositories/phone-tokens.repository.js';
import { RateLimitRepository } from './repositories/rate-limit.repository.js';
import { RegistrationRepository } from './repositories/registration.repository.js';
import { AuthSessionRepository } from './repositories/auth-session.repository.js';
import { UnverifiedUsersRepository } from './repositories/unverified-users.repository.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { PasswordHasher } from './services/password-hasher.js';
import { LoginService } from './services/login.service.js';
import { RegistrationStatusService } from './services/registration-status.service.js';
import { RegistrationService } from './services/registration.service.js';
import { TelegramVerificationHandler } from './services/telegram-verification.handler.js';
import { SessionService } from './services/session.service.js';

// DbService, Clock, ConfigService y JobRegistry llegan de módulos globales.
@Module({
  imports: [UsersModule, TelegramModule],
  controllers: [AuthController],
  providers: [
    PhoneTokensRepository,
    RateLimitRepository,
    RegistrationRepository,
    PasswordHasher,
    RegistrationService,
    RegistrationStatusService,
    LoginRepository,
    LoginService,
    TelegramVerificationHandler,
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
    private readonly dispatcher: TelegramDispatcher,
    private readonly verification: TelegramVerificationHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(new PurgeUnverifiedJob(this.unverified));
    this.dispatcher.register(this.verification);
  }
}
