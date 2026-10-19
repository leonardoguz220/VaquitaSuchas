import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { MAX_RECEIPT_BYTES } from '../domain/file-signature.js';
import type { ChargeView } from '../services/charge-views.js';
import { ReceiptsService, type ReceiptFileUrl } from '../services/receipts.service.js';
import { UploadReceiptDto, type UploadedReceiptFile } from './receipts.dto.js';
import { requireUserId, uuidParam } from './request-user.js';

/** Comprobantes de pago (spec 002, US2). Solo traduce HTTP: las reglas viven en el servicio. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@UseGuards(AuthGuard)
@Controller('charges/:chargeId/receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post()
  // El límite de multer corta la lectura en 5 MB (413); el servicio revisa también el tipo real.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Subir o reemplazar el comprobante de un cobro (RF-002-06)' })
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
  @ApiForbiddenResponse({ description: 'FORBIDDEN: no es el dueño del cobro.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  @ApiConflictResponse({
    description: 'INVALID_TRANSITION, REFERENCE_ALREADY_USED o STALE_STATE.',
  })
  @ApiServiceUnavailableResponse({ description: 'SERVICE_UNAVAILABLE: falla del almacén.' })
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Body() body: UploadReceiptDto,
    @UploadedFile() file: UploadedReceiptFile | undefined,
  ): Promise<ChargeView> {
    return this.receipts.upload(requireUserId(request), chargeId, {
      bytes: file?.buffer,
      method: body.method,
      reference: body.reference,
      version: body.version ?? null,
    });
  }

  @Get(':receiptId/file')
  @ApiOperation({ summary: 'URL firmada del comprobante, de 10 minutos como máximo (RNF-002-01)' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: otro miembro del grupo.' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no existe o no pertenece al grupo.' })
  file(
    @Req() request: AuthenticatedRequest,
    @Param('chargeId', uuidParam()) chargeId: string,
    @Param('receiptId', uuidParam()) receiptId: string,
  ): Promise<ReceiptFileUrl> {
    return this.receipts.fileUrl(requireUserId(request), chargeId, receiptId);
  }
}
