import type { DomainEvent } from './domain-event.js';

// Eventos de cuenta publicados por UserAccountService (spec 003 T012); los consume la spec 009.
export interface UserSuspended extends DomainEvent {
  readonly type: 'users.suspended';
  readonly userId: string;
}

export interface UserReactivated extends DomainEvent {
  readonly type: 'users.reactivated';
  readonly userId: string;
}

export interface UserBanned extends DomainEvent {
  readonly type: 'users.banned';
  readonly userId: string;
}
