import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../shared/guards/admin.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { MAX_CHAT_IMAGE_BYTES } from '../domain/chat-rules.js';
import {
  DisputesService,
  type AdminDisputeRow,
  type DisputeEvidence,
  type DisputeResult,
  type DisputeView,
} from '../services/disputes.service.js';
import {
  ListDisputeQueueQueryDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  RespondDisputeDto,
  type UploadedRequestFile,
} from './disputes.dto.js';

const upload = (): ReturnType<typeof FileInterceptor> =>
  FileInterceptor('evidence', { limits: { fileSize: MAX_CHAT_IMAGE_BYTES, files: 1 } });

/** Reclamos de una solicitud para sus partes (spec 010, US6). */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
@UseGuards(AuthGuard)
@Controller('join-requests/:id/disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @UseInterceptors(upload())
  @ApiOperation({ summary: 'Abrir un reclamo (RF-010-21)' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Dispute.' })
  @ApiUnprocessableEntityResponse({
    description: 'DISPUTE_NOT_ALLOWED, DISPUTE_WINDOW_CLOSED o DISPUTE_ALREADY_OPEN.',
  })
  open(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: OpenDisputeDto,
    @UploadedFile() evidence: UploadedRequestFile | undefined,
  ): Promise<DisputeView> {
    return this.disputes.open(requireUserId(request), id, {
      description: body.description as string,
      evidence: evidence?.buffer,
    });
  }

  @Post(':disputeId/response')
  @HttpCode(200)
  @UseInterceptors(upload())
  @ApiOperation({ summary: 'Responder un reclamo, una sola vez (RF-010-22)' })
  @ApiConsumes('multipart/form-data')
  @ApiUnprocessableEntityResponse({ description: 'DISPUTE_ALREADY_RESPONDED o DISPUTE_RESOLVED.' })
  respond(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Param('disputeId', uuidParam()) disputeId: string,
    @Body() body: RespondDisputeDto,
    @UploadedFile() evidence: UploadedRequestFile | undefined,
  ): Promise<DisputeView> {
    return this.disputes.respond(requireUserId(request), id, disputeId, {
      text: body.text as string,
      evidence: evidence?.buffer,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Reclamos de la solicitud, con su resolución' })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<{ items: DisputeView[] }> {
    return this.disputes.list(requireUserId(request), id);
  }
}

/** Evidencia y resolución para administración (contrato de la spec 009, RF-010-23/24). */
@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: la persona no es administradora.' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de reclamos, los abiertos primero; sin evidencia (RF-009-20)' })
  queue(
    @Query() query: ListDisputeQueueQueryDto,
  ): Promise<{ items: AdminDisputeRow[]; nextCursor: string | null }> {
    return this.disputes.listQueue(query);
  }

  @Get(':disputeId/evidence')
  @ApiOperation({ summary: 'Evidencia de un reclamo abierto; queda en la auditoría (CA-010-29)' })
  evidence(
    @Req() request: AuthenticatedRequest,
    @Param('disputeId', uuidParam()) disputeId: string,
  ): Promise<DisputeEvidence> {
    return this.disputes.getEvidence(requireUserId(request), disputeId);
  }

  @Post(':disputeId/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolver un reclamo; estafa_confirmada banea al acusado (CA-010-30)' })
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param('disputeId', uuidParam()) disputeId: string,
    @Body() body: ResolveDisputeDto,
  ): Promise<DisputeView> {
    return this.disputes.resolve(
      requireUserId(request),
      disputeId,
      body.result as DisputeResult,
      body.reason as string,
    );
  }
}
