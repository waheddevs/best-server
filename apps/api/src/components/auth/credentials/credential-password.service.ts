import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2id,
} as const;
const DUMMY_PASSWORD = 'not-a-real-best-account-password';

@Injectable()
export class CredentialPasswordService {
  private dummyHash: Promise<string> | undefined;

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(
    password: string,
    passwordHash: string | null | undefined,
  ): Promise<boolean> {
    const digest = passwordHash ?? (await this.getDummyHash());

    try {
      const matches = await verify(digest, password);
      return passwordHash !== null && passwordHash !== undefined && matches;
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hashPassword(DUMMY_PASSWORD);
    return this.dummyHash;
  }
}
