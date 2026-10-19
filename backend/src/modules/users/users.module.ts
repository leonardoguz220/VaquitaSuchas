import { Module } from '@nestjs/common';
import { UsersAccountRepository } from './repositories/users-account.repository.js';
import { UserAccountService } from './services/user-account.service.js';

// TxEventBus llega del EventsModule global.
@Module({
  providers: [UsersAccountRepository, UserAccountService],
  exports: [UserAccountService],
})
export class UsersModule {}
