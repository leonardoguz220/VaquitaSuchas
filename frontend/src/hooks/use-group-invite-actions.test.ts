import { act, renderHook } from '@testing-library/react';
import { ownerGroup } from '@/components/features/groups/__fixtures__/groups';
import { getGroup, regenerateInviteCode, updateGroup } from '@/services/groups';
import { ApiError } from '@/services/http';
import { useGroupInviteActions, type InviteActionResult } from './use-group-invite-actions';

jest.mock('@/services/groups', () => ({
  getGroup: jest.fn(),
  updateGroup: jest.fn(),
  regenerateInviteCode: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos/abc',
}));

beforeEach(() => {
  jest.resetAllMocks();
  window.history.replaceState(null, '', '/grupos/abc');
});

function setup() {
  const onGroupChange = jest.fn();
  const view = renderHook(() => useGroupInviteActions({ group: ownerGroup, onGroupChange }));
  return { ...view, onGroupChange };
}

describe('useGroupInviteActions (T025)', () => {
  it('CA-001-09: regenerar reemplaza inviteCode en el grupo mostrado', async () => {
    jest.mocked(regenerateInviteCode).mockResolvedValue({ inviteCode: 'P4W8ZR2N' });
    const { result, onGroupChange } = setup();
    let outcome: InviteActionResult = null;
    await act(async () => {
      outcome = await result.current.regenerate();
    });
    expect(outcome).toEqual({ ok: true });
    expect(onGroupChange).toHaveBeenCalledWith({ ...ownerGroup, inviteCode: 'P4W8ZR2N' });
  });

  it('RF-001-09: PATCH con acceptingMembers y version; un 409 recarga el grupo', async () => {
    const fresh = { ...ownerGroup, version: ownerGroup.version + 1 };
    jest.mocked(updateGroup).mockRejectedValue(new ApiError(409, 'STALE_STATE', 'x'));
    jest.mocked(getGroup).mockResolvedValue(fresh);
    const { result, onGroupChange } = setup();
    let outcome: InviteActionResult = null;
    await act(async () => {
      outcome = await result.current.setAcceptingMembers(false);
    });
    expect(updateGroup).toHaveBeenCalledWith(ownerGroup.id, {
      acceptingMembers: false,
      version: ownerGroup.version,
    });
    expect(outcome).toMatchObject({ ok: false, stale: true });
    expect(onGroupChange).toHaveBeenCalledWith(fresh);
  });

  it('un 401 redirige a /ingresar y devuelve null', async () => {
    jest.mocked(updateGroup).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = setup();
    let outcome: InviteActionResult = { ok: true };
    await act(async () => {
      outcome = await result.current.setAcceptingMembers(false);
    });
    expect(outcome).toBeNull();
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fabc');
  });
});
