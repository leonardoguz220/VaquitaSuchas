import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

// argon2id con 19 MiB, 2 iteraciones y 1 hilo (plan de la spec 003).
@Injectable()
export class PasswordHasher {
  private dummy: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /**
   * Verifica contra `hash`, o contra un hash de relleno si es null, para que tardar lo mismo no
   * delate si la cuenta existe (RNF-003-03). Con hash de relleno siempre devuelve false.
   */
  async verifyAgainst(hash: string | null, password: string): Promise<boolean> {
    if (hash === null) {
      this.dummy ??= this.hash('relleno-sin-cuenta-1');
      await argon2.verify(await this.dummy, password);
      return false;
    }
    return this.verify(hash, password);
  }
}
