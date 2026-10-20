import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  NOTIFICATIONS_DEFAULT_LIMIT,
  NOTIFICATIONS_MAX_LIMIT,
} from '../services/notification.service.js';

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Query de `GET /notifications` (contracts/api.md). */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Solo las no leídas.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: NOTIFICATIONS_MAX_LIMIT,
    default: NOTIFICATIONS_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATIONS_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}
