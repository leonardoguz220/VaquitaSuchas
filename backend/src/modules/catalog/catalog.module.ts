import { Module } from '@nestjs/common';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CatalogService } from './services/catalog.service.js';

// DbService llega del módulo global. Los controladores del catálogo se agregan en la spec 004 T010.
@Module({
  providers: [CatalogRepository, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
