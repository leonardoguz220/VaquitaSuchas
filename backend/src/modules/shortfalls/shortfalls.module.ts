import { Module, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { AuthModule } from '../auth/auth.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { ShortfallDisputesController } from './controllers/shortfall-disputes.controller.js';
import { ShortfallsController } from './controllers/shortfalls.controller.js';
import { ShortfallsSweepJob } from './jobs/shortfalls-jobs.js';
import { ShortfallsRepository } from './repositories/shortfalls.repository.js';
import { ShortfallActionsService } from './services/shortfall-actions.service.js';
import { ShortfallDisputesService } from './services/shortfall-disputes.service.js';
import { ShortfallLifecycle } from './services/shortfall-lifecycle.js';
import { ShortfallSweeper } from './services/shortfall-sweeper.js';
import { ShortfallViewService } from './services/shortfall-view.service.js';
import { ShortfallsService } from './services/shortfalls.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales (como en join-requests). Los avisos
// los genera la spec 005 al escuchar los eventos `shortfalls.*`.
@Module({
  imports: [SubscriptionsModule, AuthModule],
  controllers: [ShortfallsController, ShortfallDisputesController],
  providers: [
    ShortfallsRepository,
    ShortfallLifecycle,
    ShortfallViewService,
    ShortfallsService,
    ShortfallActionsService,
    ShortfallSweeper,
    ShortfallDisputesService,
  ],
  exports: [ShortfallsService],
})
export class ShortfallsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly sweeper: ShortfallSweeper,
  ) {}

  onModuleInit(): void {
    this.registry.register(new ShortfallsSweepJob(this.sweeper));
  }
}
