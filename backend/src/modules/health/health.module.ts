import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller.js';
import { HealthRepository } from './repositories/health.repository.js';
import { HealthService } from './services/health.service.js';

// DbService y Clock llegan de los módulos globales DbModule y ClockModule.
@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository],
})
export class HealthModule {}
