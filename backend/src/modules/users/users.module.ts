import { Module } from '@nestjs/common';
import { BannedIdentitiesRepository } from './repositories/banned-identities.repository.js';
import { UsersAccountRepository } from './repositories/users-account.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { IdentityService } from './services/identity.service.js';
import { UserSelfService } from './services/user-self.service.js';
import { UsersService } from './services/users.service.js';
import { UserAccountService } from './services/user-account.service.js';

// El controlador vive en AuthModule: necesita AUTH_SESSION_PORT, y AuthModule importa este módulo.
// TxEventBus, ConfigService y DbService llegan de módulos globales.
@Module({
  providers: [
    UsersService,
    UsersAccountRepository,
    UsersRepository,
    BannedIdentitiesRepository,
    UserAccountService,
    IdentityService,
    UserSelfService,
  ],
  exports: [UsersService, UserAccountService, IdentityService, UserSelfService],
})
export class UsersModule {}
