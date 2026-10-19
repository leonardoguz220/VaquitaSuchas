import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

// argon2id con 19 MiB, 2 iteraciones y 1 hilo (plan de la spec 003).
@Injectable()
export class PasswordHasher {
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
}
