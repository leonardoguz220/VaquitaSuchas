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
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { MAX_RECEIPT_BYTES } from '../../billing/domain/file-signature.js';
import { MAX_QR_BYTES } from '../domain/payment-info.js';
import { EntryPaymentService, type SignedFile } from '../services/entry-payment.service.js';
import { JoinRequestsService, type ListQuery } from '../services/join-requests.service.js';
import type {
  GroupJoinRequestsPage,
  JoinRequestsPage,
  JoinRequestsSummary,
  JoinRequestView,
} from '../services/request-views.js';
import {
  ListJoinRequestsQueryDto,
  OpenJoinRequestDto,
  PaymentDataDto,
  UploadProofDto,
  type UploadedRequestFile,
} from './join-requests.dto.js';

const toQuery = (query: ListJoinRequestsQueryDto): ListQuery => ({
  ...(query.role && { role: query.role }),
  ...(query.status && { statuses: query.status }),
  ...(query.groupId && { groupId: query.groupId }),
  ...(query.limit !== undefined && { limit: query.limit }),
  ...(query.cursor && { cursor: query.cursor }),
});

/** Solicitudes de ingreso (spec 010). Solo traduce HTTP: el acceso y las reglas los decide el servicio. */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller()
export class JoinRequestsController {
  constructor(
    private readonly service: JoinRequestsService,
    private readonly payments: EntryPaymentService,
  ) {}

  @Post('join-requests')
  @ApiOperation({ summary: 'Abrir una solicitud con un código de invitación (RF-010-01)' })
  @ApiCreatedResponse({ description: 'JoinRequest en `abierta`.' })
  @ApiForbiddenResponse({ description: 'ACCOUNT_RESTRICTED: cuenta suspendida o baneada.' })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_INVITE_CODE, ENTRY_WINDOW_CLOSED, GROUP_NOT_ACCEPTING, NO_SLOTS_AVAILABLE, ACTIVE_REQUEST_EXISTS, TOO_MANY_ACTIVE_REQUESTS, OPEN_CHARGES_IN_GROUP, ALREADY_MEMBER o GROUP_FROZEN. 429 RATE_LIMITED con 10 códigos inválidos en 15 minutos.',
  })
  open(
    @Req() request: AuthenticatedRequest,
    @Body() body: OpenJoinRequestDto,
  ): Promise<JoinRequestView> {
    return this.service.open(requireUserId(request), body.code);
  }

  @Get('join-requests')
  @ApiOperation({ summary: 'Mis solicitudes y las de mis grupos (RF-010-26)' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListJoinRequestsQueryDto,
  ): Promise<JoinRequestsPage> {
    return this.service.list(requireUserId(request), toQuery(query));
  }

  @Get('join-requests/:id')
  @ApiOperation({ summary: 'Detalle con línea de tiempo (RF-010-27)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<JoinRequestView> {
    return this.service.get(requireUserId(request), id);
  }

  @Post('join-requests/:id/payment-data')
  @HttpCode(200)
  // El límite de multer corta la lectura en 2 MB (413); el servicio revisa también el tipo real.
  @UseInterceptors(FileInterceptor('qr', { limits: { fileSize: MAX_QR_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'El titular envía los datos de pago y se cotiza la cuota (RF-010-11)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 500 },
        qr: { type: 'string', format: 'binary', description: 'JPG o PNG, máximo 2 MB.' },
        version: { type: 'integer', minimum: 1 },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION o STALE_STATE.' })
  @ApiUnprocessableEntityResponse({
    description: 'PAYMENT_INFO_MISSING, ENTRY_WINDOW_CLOSED, NO_SLOTS_AVAILABLE o GROUP_FROZEN.',
  })
  sendPaymentData(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: PaymentDataDto,
    @UploadedFile() qr: UploadedRequestFile | undefined,
  ): Promise<JoinRequestView> {
    return this.payments.sendPaymentData(requireUserId(request), id, {
      text: body.text ?? null,
      qrBytes: qr?.buffer,
      version: body.version ?? null,
    });
  }

  @Post('join-requests/:id/extend')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular prorroga el plazo de pago 15 minutos, una vez (RF-010-28)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION: no está esperando_pago o ya venció.' })
  @ApiUnprocessableEntityResponse({ description: 'ALREADY_EXTENDED.' })
  extend(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<JoinRequestView> {
    return this.payments.extend(requireUserId(request), id);
  }

  @Post('join-requests/:id/proof')
  @HttpCode(200)
  // El límite de multer corta la lectura en 5 MB (413); el servicio revisa también el tipo real.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'El solicitante sube el comprobante de pago (RF-010-13)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'method', 'reference'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'JPG, PNG o PDF, máximo 5 MB.' },
        method: { type: 'string', enum: ['qr', 'transferencia'] },
        reference: { type: 'string', maxLength: 100 },
        version: { type: 'integer', minimum: 1 },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el solicitante.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
  @ApiConflictResponse({
    description: 'INVALID_TRANSITION, REFERENCE_ALREADY_USED o STALE_STATE.',
  })
  @ApiUnprocessableEntityResponse({ description: 'PAYMENT_DEADLINE_PASSED.' })
  uploadProof(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: UploadProofDto,
    @UploadedFile() file: UploadedRequestFile | undefined,
  ): Promise<JoinRequestView> {
    return this.payments.uploadProof(requireUserId(request), id, {
      bytes: file?.buffer,
      method: body.method,
      reference: body.reference,
      version: body.version ?? null,
    });
  }

  @Get('join-requests/:id/proof/file')
  @ApiOperation({ summary: 'URL firmada del comprobante, de 10 minutos como máximo (RNF-010-02)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe, es ajena o no hay comprobante.' })
  proofFile(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<SignedFile> {
    return this.payments.proofFile(requireUserId(request), id);
  }

  @Get('join-requests/:id/payment-qr')
  @ApiOperation({ summary: 'URL firmada del QR de pago, de 10 minutos como máximo (RNF-010-02)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe, es ajena o no hay QR.' })
  paymentQr(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
  ): Promise<SignedFile> {
    return this.payments.paymentQr(requireUserId(request), id);
  }

  @Get('me/join-requests/summary')
  @ApiOperation({ summary: 'Insignias de la barra de navegación' })
  summary(@Req() request: AuthenticatedRequest): Promise<JoinRequestsSummary> {
    return this.service.summary(requireUserId(request));
  }
}

/** Cola de solicitudes del titular dentro del grupo (RF-010-26). */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('groups/:groupId/join-requests')
export class HostRequestsController {
  constructor(private readonly service: JoinRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Cola del titular, de la más antigua a la más reciente' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: miembro que no es el titular.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: grupo inexistente o ajeno.' })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('groupId', uuidParam()) groupId: string,
    @Query() query: ListJoinRequestsQueryDto,
  ): Promise<GroupJoinRequestsPage> {
    return this.service.listForGroup(requireUserId(request), groupId, toQuery(query));
  }
}
