import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DbService } from './db.service.js';
import { PG_POOL } from './pg-pool.js';

// Global para que los repositorios inyecten DbService sin importar este módulo.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      // DATABASE_URL ya la validó validateEnv al arrancar. `Pool` no abre conexiones hasta la
      // primera consulta, así que compilar la aplicación no exige una base levantada.
      useFactory: (config: ConfigService): Pool =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
      inject: [ConfigService],
    },
    DbService,
  ],
  exports: [DbService],
})
export class DbModule {}
