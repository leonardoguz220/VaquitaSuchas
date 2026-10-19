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
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { AuthGuard } from '../../../shared/guards/auth.guard.js';
import { requireUserId, uuidParam } from '../../../shared/http/request-user.js';
import { MAX_CHAT_IMAGE_BYTES } from '../domain/chat-rules.js';
import type { SignedFile } from '../services/entry-payment.service.js';
import { ChatService, type JoinMessageView } from '../services/chat.service.js';
import {
  ListMessagesQueryDto,
  MarkReadDto,
  SendMessageDto,
  type UploadedRequestFile,
} from './chat.dto.js';

/**
 * Chat de la solicitud (spec 010, US5). No hay `PUT`, `PATCH` ni `DELETE` sobre mensajes
 * (RF-010-06, CA-010-23): esas rutas no existen y responden 404.
 */
@ApiTags('join-requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED: sin sesión válida.' })
@ApiForbiddenResponse({ description: 'FORBIDDEN: miembro del grupo que no participa.' })
@ApiNotFoundResponse({ description: 'NOT_FOUND: la solicitud no existe o es ajena.' })
@UseGuards(AuthGuard)
@Controller('join-requests/:id')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Mensajes con seq > afterSeq, en orden (RF-010-09)' })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<{ items: JoinMessageView[]; serverNow: string }> {
    return this.chat.list(requireUserId(request), id, query.afterSeq ?? 0, query.limit ?? 50);
  }

  @Post('messages')
  // El límite de multer corta la lectura en 5 MB (413); el servicio revisa también el tipo real.
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_CHAT_IMAGE_BYTES, files: 1 } }),
  )
  @ApiOperation({ summary: 'Enviar un mensaje de texto, una imagen o ambos (RF-010-05)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 1000 },
        image: { type: 'string', format: 'binary', description: 'JPG o PNG, máximo 5 MB.' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'JoinMessage.' })
  @ApiUnprocessableEntityResponse({ description: 'CHAT_READ_ONLY: la solicitud ya terminó.' })
  send(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: SendMessageDto,
    @UploadedFile() image: UploadedRequestFile | undefined,
  ): Promise<JoinMessageView> {
    return this.chat.send(requireUserId(request), id, {
      text: body.text ?? null,
      imageBytes: image?.buffer,
    });
  }

  @Get('messages/:messageId/image')
  @ApiOperation({ summary: 'URL firmada de la imagen, de 10 minutos como máximo (RNF-010-02)' })
  image(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Param('messageId', uuidParam()) messageId: string,
  ): Promise<SignedFile> {
    return this.chat.imageUrl(requireUserId(request), id, messageId);
  }

  @Post('read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marca los mensajes como leídos hasta upToSeq (RF-010-09)' })
  @ApiNoContentResponse()
  async read(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuidParam()) id: string,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.chat.markRead(requireUserId(request), id, body.upToSeq);
  }
}
