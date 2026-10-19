'use client';

import { ReviewQueue } from '@/components/features/charges/review-queue';
import { GroupListingBadge } from '@/components/features/listings/group-listing-badge';
import { GroupListingTab } from '@/components/features/listings/group-listing-tab';
import { GroupRequestsTab } from '@/components/features/join-requests/group-requests-tab';
import { GroupDetailView } from './group-detail';
import { AdminTransferOwnership } from '@/components/features/admin/admin-transfer-ownership';
import { GroupInvitePanel } from './group-invite-panel';

/**
 * `/grupos/[id]` con los paneles del titular. Es un componente de cliente porque `ownerPanel`
 * y `reviewQueue` son funciones y no pueden pasar desde la página (componente de servidor).
 */
export function GroupPageView({ groupId }: { groupId: string }) {
  return (
    <GroupDetailView
      groupId={groupId}
      ownerPanel={(group, { onGroupChange }) => (
        <GroupInvitePanel group={group} onGroupChange={onGroupChange} />
      )}
      reviewQueue={(group) => <ReviewQueue groupId={group.id} />}
      requestsTab={(group) => <GroupRequestsTab groupId={group.id} />}
      listingTab={(group) => <GroupListingTab group={group} />}
      memberBadge={(group) => <GroupListingBadge groupId={group.id} />}
      adminPanel={(group) => <AdminTransferOwnership groupId={group.id} />}
    />
  );
}
