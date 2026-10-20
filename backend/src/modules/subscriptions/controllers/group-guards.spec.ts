import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { DbService } from '../../../shared/db/db.service.js';
import { MembersRepository } from '../repositories/members.repository.js';
import { GroupMemberGuard, type GroupRequest } from './group-member.guard.js';
import { GroupOwnerGuard } from './group-owner.guard.js';

const GROUP = '0b1c2d3e-0000-4000-8000-0000000000aa';
const USER = '0b1c2d3e-0000-4000-8000-000000000001';

function setup(role: 'titular' | 'miembro' | null) {
  const members = new MembersRepository();
  const findActive = jest
    .spyOn(members, 'findActive')
    .mockResolvedValue(
      role ? { id: 'm', group_id: GROUP, user_id: USER, role, joined_at: new Date() } : null,
    );
  const memberGuard = new GroupMemberGuard({} as DbService, members);
  const ownerGuard = new GroupOwnerGuard(memberGuard);
  const request = {
    user: { id: USER, role: 'usuario' },
    params: { id: GROUP },
  } as unknown as GroupRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { memberGuard, ownerGuard, request, context, findActive };
}

describe('GroupMemberGuard', () => {
  it('CA-001-10: sin fila activa responde 404', async () => {
    const { memberGuard, context } = setup(null);
    await expect(memberGuard.canActivate(context)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('CA-001-10: un id que no es UUID responde 404 sin consultar la base', async () => {
    const { memberGuard, context, request, findActive } = setup('miembro');
    request.params = { id: 'no-es-uuid' };
    await expect(memberGuard.canActivate(context)).rejects.toMatchObject({ httpStatus: 404 });
    expect(findActive).not.toHaveBeenCalled();
  });

  it('RNF-001-01: con membresía activa deja el rol en la petición', async () => {
    const { memberGuard, context, request } = setup('miembro');
    await expect(memberGuard.canActivate(context)).resolves.toBe(true);
    expect(request.groupMembership).toEqual({ groupId: GROUP, userId: USER, role: 'miembro' });
  });

  it('RNF-001-01: sin sesión responde 401', async () => {
    const { memberGuard, context, request } = setup('miembro');
    delete request.user;
    await expect(memberGuard.canActivate(context)).rejects.toMatchObject({ httpStatus: 401 });
  });
});

describe('GroupOwnerGuard', () => {
  it('CA-001-11: un miembro en una ruta de titular recibe 403', async () => {
    const { ownerGuard, context } = setup('miembro');
    await expect(ownerGuard.canActivate(context)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('CA-001-10: quien no es miembro recibe 404 y no 403', async () => {
    const { ownerGuard, context } = setup(null);
    await expect(ownerGuard.canActivate(context)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('CA-001-11: el titular pasa', async () => {
    const { ownerGuard, context } = setup('titular');
    await expect(ownerGuard.canActivate(context)).resolves.toBe(true);
  });
});
