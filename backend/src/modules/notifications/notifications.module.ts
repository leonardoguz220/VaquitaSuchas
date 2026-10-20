import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import { NotificationService } from './services/notification.service.js';

// DbService y Clock llegan de módulos globales. AuthModule aporta AUTH_SESSION_PORT para AuthGuard.
// NotificationService se exporta para los manejadores de eventos de las specs 001, 002, 009 y 010.
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
