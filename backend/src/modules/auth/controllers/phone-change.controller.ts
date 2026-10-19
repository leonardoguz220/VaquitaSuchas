import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { PhoneChangeService, type PhoneChangeStatus } from '../services/phone-change.service.js';
import type { VerificationLink } from '../services/registration.service.js';
import { clientIp } from './client-ip.js';

@ApiTags('users')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('users/me/phone-change')
export class PhoneChangeController {
  constructor(private readonly phoneChange: PhoneChangeService) {}

  @Post()
  @ApiOperation({ summary: 'Pide un enlace del bot para cambiar el celular (RF-003-15)' })
  @ApiCreatedResponse({ description: '{ verification: { telegramUrl, expiresAt } }' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: 5 enlaces por hora.' })
  async start(
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ verification: VerificationLink }> {
    return this.phoneChange.start(req.user!.id, clientIp(req));
  }

  @Get('status')
  @ApiOperation({ summary: 'Estado del último cambio de celular (CA-003-32)' })
  @ApiOkResponse({ description: 'pending | expired | rejected (con code) | verified (con user).' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  async status(@Req() req: AuthenticatedRequest): Promise<PhoneChangeStatus> {
    return this.phoneChange.status(req.user!.id);
  }
}
