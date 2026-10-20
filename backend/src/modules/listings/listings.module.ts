import { Module } from '@nestjs/common';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ListingsController } from './controllers/listings.controller.js';
import { ListingReportsRepository } from './repositories/listing-reports.repository.js';
import { ListingsRepository } from './repositories/listings.repository.js';
import { ListingsSearchRepository } from './repositories/listings-search.repository.js';
import { ListingsSearchService } from './services/listings-search.service.js';

// DbService y Clock llegan de módulos globales; el puerto de calificación, de `AdaptersModule`.
@Module({
  imports: [AuthModule, AdaptersModule],
  controllers: [ListingsController],
  providers: [
    ListingsRepository,
    ListingReportsRepository,
    ListingsSearchRepository,
    ListingsSearchService,
  ],
  exports: [ListingsRepository, ListingsSearchService],
})
export class ListingsModule {}
