import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogController } from './controllers/catalog.controller.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CatalogService } from './services/catalog.service.js';

// DbService llega del módulo global. AuthModule aporta AUTH_SESSION_PORT para los guards.
@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
