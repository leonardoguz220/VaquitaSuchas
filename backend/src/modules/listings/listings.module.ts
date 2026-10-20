import { Module, type OnModuleInit } from '@nestjs/common';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import type { JoinRequestAccepted } from '../../shared/events/join-request-events.js';
import { AuthModule } from '../auth/auth.module.js';
import { JoinRequestsModule } from '../join-requests/join-requests.module.js';
import { GroupListingController } from './controllers/group-listing.controller.js';
import { ListingsController } from './controllers/listings.controller.js';
import { ListingReportsRepository } from './repositories/listing-reports.repository.js';
import { ListingsRepository } from './repositories/listings.repository.js';
import { ListingsSearchRepository } from './repositories/listings-search.repository.js';
import { ListingsSearchService } from './services/listings-search.service.js';
import { ListingsService } from './services/listings.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales; el puerto de calificación, de
// `AdaptersModule`. `listings` depende de `join-requests` (abrir y rechazar solicitudes); la
// dirección contraria pasa por `ListingQuotaPort` en `app-adapters/`, sin ciclos.
@Module({
  imports: [AuthModule, AdaptersModule, JoinRequestsModule],
  controllers: [ListingsController, GroupListingController],
  providers: [
    ListingsRepository,
    ListingReportsRepository,
    ListingsSearchRepository,
    ListingsSearchService,
    ListingsService,
  ],
  exports: [ListingsRepository, ListingsSearchService, ListingsService],
})
export class ListingsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly service: ListingsService,
  ) {}

  onModuleInit(): void {
    this.bus.register<JoinRequestAccepted>('join-requests.accepted', (tx, event) =>
      this.service.onRequestAccepted(tx, event),
    );
  }
}
