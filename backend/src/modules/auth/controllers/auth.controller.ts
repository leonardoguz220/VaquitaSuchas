import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { RegistrationService, type VerificationLink } from '../services/registration.service.js';
import { RegisterDto } from './register.dto.js';

/** IP de quien llama: primer valor de X-Forwarded-For (proxy del frontend) o la del socket. */
function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registra una cuenta y entrega el enlace de verificación (RF-003-01)' })
  @ApiCreatedResponse({
    description: '{ registrationSecret, verification: { telegramUrl, expiresAt } }',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR (WEAK_PASSWORD, INVALID_CI, POLICY_NOT_ACCEPTED…).',
  })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN o CI_TAKEN.' })
  @ApiForbiddenResponse({
    description: 'REGISTRATION_NOT_ALLOWED: datos bloqueados, sin indicar cuál.',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED con details.retryAfterSeconds.' })
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
  ): Promise<{ registrationSecret: string; verification: VerificationLink }> {
    return this.registration.register({ ...body, ip: clientIp(req) });
  }

  @HttpCode(200)
  @Post('register/link')
  @ApiOperation({ summary: 'Pide un enlace de verificación nuevo (RF-003-21)' })
  @ApiHeader({ name: 'X-Registration-Secret', required: true })
  @ApiOkResponse({ description: '{ verification: { telegramUrl, expiresAt } }' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: secreto ausente, inválido o vencido.' })
  @ApiConflictResponse({ description: 'ALREADY_VERIFIED.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED con details.retryAfterSeconds.' })
  async link(
    @Headers('x-registration-secret') secret: string | undefined,
    @Req() req: Request,
  ): Promise<{ verification: VerificationLink }> {
    if (!secret) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
    }
    return this.registration.requestNewLink(secret, clientIp(req));
  }
}
