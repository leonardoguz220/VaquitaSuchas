import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PasswordService } from '../services/password.service.js';
import { ForgotPasswordDto, ResetPasswordDto } from './password.dto.js';

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
}
