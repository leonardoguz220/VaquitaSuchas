import { Module, type OnModuleInit } from '@nestjs/common';
import type {
  ChargeCancelled,
  ChargeConfirmed,
  ChargeGenerated,
  ChargeRejected,
  ChargeSubmitted,
  MemberRemovedForNonPayment,
} from '../../shared/events/charge-events.js';
import type {
  GroupClosed,
  GroupFrozen,
  MemberAdded,
  MemberRemoved,
  OwnerChanged,
} from '../../shared/events/group-events.js';
import type {
  ChatMessageSent,
  DecisionReminderDue,
  DisputeOpened,
  DisputeResolved,
  JoinRequestAccepted,
  JoinRequestExpired,
  JoinRequestOpened,
  JoinRequestRejected,
  PaymentDataSent,
  ProofSubmitted,
} from '../../shared/events/join-request-events.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import type { UserSuspended } from '../../shared/events/user-events.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationFactsRepository } from './repositories/notification-facts.repository.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import { BillingNotificationHandlers } from './services/handlers/billing.handlers.js';
import { GroupNotificationHandlers } from './services/handlers/groups.handlers.js';
import { JoinRequestNotificationHandlers } from './services/handlers/join-requests.handlers.js';
import { NotificationService } from './services/notification.service.js';

// DbService y Clock llegan de módulos globales. AuthModule aporta AUTH_SESSION_PORT para AuthGuard.
// NotificationService se exporta para los manejadores de eventos de las specs 001, 002, 009 y 010.
// Los manejadores de avisos se suscriben al bus al arrancar (quien reacciona depende del evento).
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationFactsRepository,
    NotificationService,
    BillingNotificationHandlers,
    GroupNotificationHandlers,
    JoinRequestNotificationHandlers,
  ],
  exports: [NotificationService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly billing: BillingNotificationHandlers,
    private readonly groups: GroupNotificationHandlers,
    private readonly requests: JoinRequestNotificationHandlers,
  ) {}

  onModuleInit(): void {
    const b = this.billing;
    this.bus.register<ChargeGenerated>('billing.charge-generated', (tx, e) =>
      b.onChargeGenerated(tx, e),
    );
    this.bus.register<ChargeSubmitted>('billing.charge-submitted', (tx, e) =>
      b.onChargeSubmitted(tx, e),
    );
    this.bus.register<ChargeConfirmed>('billing.charge-confirmed', (tx, e) =>
      b.onChargeConfirmed(tx, e),
    );
    this.bus.register<ChargeRejected>('billing.charge-rejected', (tx, e) =>
      b.onChargeRejected(tx, e),
    );
    this.bus.register<ChargeCancelled>('billing.charge-cancelled', (tx, e) =>
      b.onChargeCancelled(tx, e),
    );
    this.bus.register<MemberRemovedForNonPayment>(
      'billing.member-removed-for-non-payment',
      (tx, e) => b.onMemberRemovedForNonPayment(tx, e),
    );

    const g = this.groups;
    this.bus.register<MemberAdded>('groups.member-added', (tx, e) => g.onMemberAdded(tx, e));
    this.bus.register<MemberRemoved>('groups.member-removed', (tx, e) => g.onMemberRemoved(tx, e));
    this.bus.register<OwnerChanged>('groups.owner-changed', (tx, e) => g.onOwnerChanged(tx, e));
    this.bus.register<GroupClosed>('groups.closed', (tx, e) => g.onGroupClosed(tx, e));
    this.bus.register<GroupFrozen>('groups.frozen', (tx, e) => g.onGroupFrozen(tx, e));
    this.bus.register<UserSuspended>('users.suspended', (tx, e) => g.onUserSuspended(tx, e));

    const r = this.requests;
    this.bus.register<JoinRequestOpened>('join-requests.opened', (tx, e) => r.onOpened(tx, e));
    this.bus.register<PaymentDataSent>('join-requests.payment-data-sent', (tx, e) =>
      r.onPaymentDataSent(tx, e),
    );
    this.bus.register<ProofSubmitted>('join-requests.proof-submitted', (tx, e) =>
      r.onProofSubmitted(tx, e),
    );
    this.bus.register<DecisionReminderDue>('join-requests.decision-reminder-due', (tx, e) =>
      r.onDecisionReminderDue(tx, e),
    );
    this.bus.register<JoinRequestAccepted>('join-requests.accepted', (tx, e) =>
      r.onAccepted(tx, e),
    );
    this.bus.register<JoinRequestRejected>('join-requests.rejected', (tx, e) =>
      r.onRejected(tx, e),
    );
    this.bus.register<JoinRequestExpired>('join-requests.expired', (tx, e) => r.onExpired(tx, e));
    this.bus.register<ChatMessageSent>('join-requests.chat-message-sent', (tx, e) =>
      r.onChatMessageSent(tx, e),
    );
    this.bus.register<DisputeOpened>('join-requests.dispute-opened', (tx, e) =>
      r.onDisputeOpened(tx, e),
    );
    this.bus.register<DisputeResolved>('join-requests.dispute-resolved', (tx, e) =>
      r.onDisputeResolved(tx, e),
    );
  }
}
