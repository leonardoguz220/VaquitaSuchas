import { Module } from '@nestjs/common';
import { BannedIdentitiesRepository } from './repositories/banned-identities.repository.js';
import { UsersAccountRepository } from './repositories/users-account.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { IdentityService } from './services/identity.service.js';
import { UserAccountService } from './services/user-account.service.js';

// TxEventBus, ConfigService y DbService llegan de módulos globales.
@Module({
  providers: [
    UsersAccountRepository,
    UsersRepository,
    BannedIdentitiesRepository,
    UserAccountService,
    IdentityService,
  ],
  exports: [UserAccountService, IdentityService],
})
export class UsersModule {}
