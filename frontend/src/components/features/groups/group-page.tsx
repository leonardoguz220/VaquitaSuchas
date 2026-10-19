'use client';

import { GroupDetailView } from './group-detail';
import { GroupInvitePanel } from './group-invite-panel';

/**
 * `/grupos/[id]` con los paneles del titular. Es un componente de cliente porque `ownerPanel`
 * es una función y no puede pasar desde la página (componente de servidor).
 */
export function GroupPageView({ groupId }: { groupId: string }) {
  return (
    <GroupDetailView
      groupId={groupId}
      ownerPanel={(group, { onGroupChange }) => (
        <GroupInvitePanel group={group} onGroupChange={onGroupChange} />
      )}
    />
  );
}
