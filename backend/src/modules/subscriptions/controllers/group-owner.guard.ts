import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { GroupMemberGuard, type GroupRequest } from './group-member.guard.js';

/**
 * Exige ser el titular del grupo: un miembro que no es titular recibe 403 (CA-001-11); quien no es
 * miembro recibe 404 (lo resuelve `GroupMemberGuard`, que este guard ejecuta si hace falta).
 */
@Injectable()
export class GroupOwnerGuard implements CanActivate {
  constructor(private readonly memberGuard: GroupMemberGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GroupRequest>();
    if (!request.groupMembership) await this.memberGuard.canActivate(context);
    if (request.groupMembership?.role !== 'titular') {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    return true;
  }
}
