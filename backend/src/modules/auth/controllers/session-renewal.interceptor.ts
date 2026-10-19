import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { SessionService } from '../services/session.service.js';

/** Añade `X-Session-Token` cuando la sesión autenticada está por vencer (RF-003-07). */
@Injectable()
export class SessionRenewalInterceptor implements NestInterceptor {
  constructor(private readonly sessions: SessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const claims = http.getRequest<AuthenticatedRequest>().sessionClaims;
    if (claims) {
      const token = this.sessions.renewIfNeeded(claims);
      if (token) http.getResponse<Response>().setHeader('X-Session-Token', token);
    }
    return next.handle();
  }
}
