import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
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
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import type { UserSelf } from '../../users/domain/user-self.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { RegistrationService, type VerificationLink } from '../services/registration.service.js';
import {
  RegistrationStatusService,
  type RegisterStatusResponse,
} from '../services/registration-status.service.js';
import { DATA_POLICY_TEXT, DATA_POLICY_VERSION } from '../policy.js';
import { LoginService } from '../services/login.service.js';
import { LoginDto } from './login.dto.js';
import { clientIp } from './client-ip.js';
import { RegisterDto } from './register.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly registrationStatus: RegistrationStatusService,
    private readonly logins: LoginService,
  ) {}

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

  @Get('register/status')
  @ApiOperation({ summary: 'Sondea el estado del registro; entrega la sesión una sola vez' })
  @ApiHeader({ name: 'X-Registration-Secret', required: true })
  @ApiOkResponse({
    description: 'pending | expired | rejected (con code) | verified (con sesión).',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED: el secreto no existe, venció o ya se canjeó.',
  })
  async status(
    @Headers('x-registration-secret') secret: string | undefined,
  ): Promise<RegisterStatusResponse> {
    if (!secret) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
    }
    return this.registrationStatus.status(secret);
  }

  @Get('policy')
  @ApiOperation({ summary: 'Texto versionado de la política de datos (RF-003-23)' })
  @ApiOkResponse({ description: '{ version, text }' })
  policy(): { version: string; text: string } {
    return { version: DATA_POLICY_VERSION, text: DATA_POLICY_TEXT };
  }

  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Inicia sesión con correo y contraseña (RF-003-06)' })
  @ApiOkResponse({ description: '{ sessionToken, user: UserSelf }' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS: mensaje idéntico para cualquier causa (CA-003-05, 18, 23).',
  })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED con details.retryAfterSeconds (CA-003-06).',
  })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
  ): Promise<{ sessionToken: string; user: UserSelf }> {
    return this.logins.login(body.email, body.password, clientIp(req));
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout')
  @ApiOperation({ summary: 'Cierra sesión e invalida los tokens anteriores (RF-003-07)' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.logins.logout(req.user!.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Datos de la propia cuenta (UserSelf, CI enmascarada)' })
  @ApiOkResponse({ description: 'UserSelf' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  async me(@Req() req: AuthenticatedRequest): Promise<UserSelf> {
    return this.logins.me(req.user!.id);
  }
}
