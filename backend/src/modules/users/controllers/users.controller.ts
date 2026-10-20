import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import type { UserSelf } from '../domain/user-self.js';
import { UsersService } from '../services/users.service.js';
import { UpdateProfileDto } from './users.dto.js';

@ApiTags('users')
@UseGuards(AuthGuard)
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Edita el nombre de la propia cuenta (RF-003-14)' })
  @ApiOkResponse({ description: 'UserSelf' })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR (INVALID_NAME) o FIELD_NOT_EDITABLE.' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED.' })
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateProfileDto,
  ): Promise<UserSelf> {
    if (body.email !== undefined || body.ci !== undefined) {
      throw new DomainError(
        'FIELD_NOT_EDITABLE',
        400,
        'El correo y la cédula no se pueden editar.',
      );
    }
    return this.users.updateFullName(req.user!.id, body.fullName);
  }
}
