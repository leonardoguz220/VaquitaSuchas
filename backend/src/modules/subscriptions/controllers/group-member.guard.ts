import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { AuthenticatedRequest } from '../../../shared/guards/authenticated-request.js';
import { MembersRepository, type MemberRole } from '../repositories/members.repository.js';

/** Petición con la membresía activa resuelta por `GroupMemberGuard`. */
export interface GroupRequest extends AuthenticatedRequest {
  params: Record<string, string>;
  groupMembership?: { groupId: string; userId: string; role: MemberRole };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/**
 * Exige membresía activa en el grupo de la ruta (`:id`). Sin fila activa (grupo ajeno, inexistente o
 * ya abandonado) responde 404, igual que un recurso inexistente (RNF-001-01, CA-001-10). Va DESPUÉS
 * de `AuthGuard`.
 */
@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly members: MembersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GroupRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 401, DEFAULT_MESSAGES.UNAUTHENTICATED);
    }
    const groupId = request.params?.['id'];
    if (!groupId || !UUID.test(groupId)) throw notFound();
    const member = await this.members.findActive(this.db, groupId, userId);
    if (!member) throw notFound();
    request.groupMembership = { groupId, userId, role: member.role };
    return true;
  }
}
