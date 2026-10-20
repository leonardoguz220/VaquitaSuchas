import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DbService } from '../../../shared/db/db.service.js';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { BanService } from '../services/ban.service.js';
import { UsersAdminService, type AdminUserView } from '../services/users-admin.service.js';
import {
  BanDto,
  ChangeRoleDto,
  ListUsersQueryDto,
  OptionalReasonDto,
  ReasonDto,
} from './admin-users.dto.js';

const adminOf = (req: AuthenticatedRequest): string => req.user!.id;

/** Usuarios, suspensión, baneo y roles (spec 009). El rol `admin` se verifica en cada petición. */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersAdminService,
    private readonly bans: BanService,
    private readonly db: DbService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Buscar y listar usuarios (RF-009-08)' })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Ficha del usuario con la cédula enmascarada (RF-009-09)' })
  detail(@Param('userId', ParseUUIDPipe) userId: string): Promise<AdminUserView> {
    return this.users.getDetail(userId);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspender con motivo (RF-009-10)' })
  suspend(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ReasonDto,
  ): Promise<AdminUserView> {
    return this.users.suspend(adminOf(req), userId, body.reason);
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivar a un suspendido; no deshace un baneo (CA-009-24)' })
  reactivate(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: OptionalReasonDto,
  ): Promise<AdminUserView> {
    return this.users.reactivate(adminOf(req), userId, body.reason);
  }

  @Post(':userId/role')
  @HttpCode(200)
  @ApiOperation({ summary: 'Promover o quitar el rol de administrador (RF-009-03)' })
  role(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeRoleDto,
  ): Promise<AdminUserView> {
    return this.users.changeRole(adminOf(req), userId, body.role, body.reason);
  }

  @Post(':userId/ban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Banear con motivo (RF-009-19)' })
  async ban(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: BanDto,
  ): Promise<{ banId: string; user: AdminUserView }> {
    const { banId } = await this.db.withTransaction((tx) =>
      this.bans.ban(tx, {
        adminId: adminOf(req),
        userId,
        reason: body.reason,
        disputeId: body.disputeId ?? null,
      }),
    );
    return { banId, user: await this.users.getDetail(userId) };
  }
}
