import type { DomainEvent } from './domain-event.js';

// Eventos de grupos y membresías (spec 001 T011); los consumen billing (002), join-requests (010) y otros.
export interface GroupCreated extends DomainEvent {
  readonly type: 'groups.created';
  readonly groupId: string;
  readonly ownerId: string;
}

export interface MemberAdded extends DomainEvent {
  readonly type: 'groups.member-added';
  readonly groupId: string;
  readonly userId: string;
}

export type MemberRemovedReason = 'abandono' | 'quitado' | 'mora' | 'baneo';

export interface MemberRemoved extends DomainEvent {
  readonly type: 'groups.member-removed';
  readonly groupId: string;
  readonly userId: string;
  readonly reason: MemberRemovedReason;
}

export interface OwnerChanged extends DomainEvent {
  readonly type: 'groups.owner-changed';
  readonly groupId: string;
  readonly previousOwnerId: string;
  readonly newOwnerId: string;
}

export interface GroupClosed extends DomainEvent {
  readonly type: 'groups.closed';
  readonly groupId: string;
}

export interface GroupFrozen extends DomainEvent {
  readonly type: 'groups.frozen';
  readonly groupId: string;
}
