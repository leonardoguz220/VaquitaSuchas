import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { PasswordService } from '../services/password.service.js';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './password.dto.js';

@ApiTags('auth')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwords: PasswordService) {}

  @HttpCode(202)
  @Post('forgot')
  @ApiOperation({ summary: 'Pide el enlace de recuperación (RF-003-10)' })
  @ApiAcceptedResponse({ description: 'Mensaje idéntico exista o no la cuenta (CA-003-09).' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: 3 pedidos por correo cada hora.' })
  async forgot(@Body() body: ForgotPasswordDto): Promise<{ message: string }> {
    await this.passwords.forgot(body.email);
    return { message: 'Si el correo está registrado, recibirás un enlace en unos minutos.' };
  }

  @HttpCode(204)
  @Post('reset')
  @ApiOperation({ summary: 'Define una contraseña nueva con el token del enlace (RF-003-12)' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR (WEAK_PASSWORD, PASSWORD_MISMATCH).' })
  @ApiResponse({
    status: 410,
    description: 'RESET_TOKEN_INVALID: vencido, usado o reemplazado (details.canRequestNew).',
  })
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwords.reset(body.token, body.newPassword, body.newPasswordConfirmation);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @Post('change')
  @ApiOperation({ summary: 'Cambia la contraseña con la actual (RF-003-16)' })
  @ApiOkResponse({ description: '{ sessionToken }: las otras sesiones se cierran (CA-003-16).' })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR (WEAK_PASSWORD, PASSWORD_MISMATCH).' })
  @ApiResponse({ status: 422, description: 'CURRENT_PASSWORD_WRONG: cuenta como intento fallido.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED con details.retryAfterSeconds.' })
  async change(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ): Promise<{ sessionToken: string }> {
    return this.passwords.change(
      req.user!.id,
      body.currentPassword,
      body.newPassword,
      body.newPasswordConfirmation,
    );
  }
}
