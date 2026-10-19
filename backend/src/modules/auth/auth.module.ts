import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AUTH_SESSION_PORT } from '../../shared/ports/auth-session.port.js';
import { SessionRenewalInterceptor } from './controllers/session-renewal.interceptor.js';
import { AuthSessionRepository } from './repositories/auth-session.repository.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { SessionService } from './services/session.service.js';

// DbService, Clock y ConfigService llegan de módulos globales.
@Module({
  providers: [
    AuthSessionRepository,
    AuthSessionService,
    SessionService,
    { provide: AUTH_SESSION_PORT, useExisting: AuthSessionService },
    { provide: APP_INTERCEPTOR, useClass: SessionRenewalInterceptor },
  ],
  exports: [AUTH_SESSION_PORT, SessionService],
})
export class AuthModule {}
