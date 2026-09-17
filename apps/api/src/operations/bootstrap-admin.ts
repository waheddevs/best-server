import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { createDatabaseClient, UserRole } from '@best/database';
import { createApplicationLogger } from '@best/logger';
import { argon2id, hash } from 'argon2';

const ROOT_ENVIRONMENT_FILE = resolve(process.cwd(), '../../.env');
const logger = createApplicationLogger({
  format: 'pretty',
  service: 'auth-admin-bootstrap',
});

void run();

async function run(): Promise<void> {
  try {
    const adminId = await bootstrapAdmin();
    logger.log({ adminId, event: 'auth_admin_bootstrap_completed' });
  } catch (error: unknown) {
    logger.error({
      event: 'auth_admin_bootstrap_failed',
      exceptionName: error instanceof Error ? error.name : 'UnknownException',
      message: error instanceof Error ? error.message : 'Bootstrap failed',
    });
    process.exitCode = 1;
  }
}

async function bootstrapAdmin(): Promise<string> {
  loadEnvFile(ROOT_ENVIRONMENT_FILE);
  const displayName = parseDisplayName(process.env.BOOTSTRAP_ADMIN_NAME);
  const email = parseEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = parsePassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const credentialPasswordHash = await hash(password, {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2id,
  });
  const database = createDatabaseClient();

  try {
    const existingAdmin = await database.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { email: true, id: true },
    });

    if (
      existingAdmin !== null &&
      existingAdmin.email !== null &&
      existingAdmin.email !== email
    ) {
      throw new Error(
        'An Admin already exists; use its exact email to rotate local bootstrap credentials',
      );
    }

    const admin = await database.$transaction(async (transaction) => {
      const user =
        existingAdmin === null
          ? await transaction.user.create({
              data: {
                credentialPasswordHash,
                displayName,
                email,
                role: UserRole.ADMIN,
              },
              select: { id: true },
            })
          : await transaction.user.update({
              where: { id: existingAdmin.id },
              data: { credentialPasswordHash, displayName, email },
              select: { id: true },
            });

      await transaction.auditLog.create({
        data: {
          action: 'AUTH_ADMIN_BOOTSTRAPPED',
          newValues: { email, role: UserRole.ADMIN },
          targetId: user.id,
          targetType: 'USER',
        },
      });

      return user;
    });

    return admin.id;
  } finally {
    await database.$disconnect();
  }
}

function parseDisplayName(value: string | undefined): string {
  const displayName = value?.normalize('NFKC').trim().replace(/\s+/g, ' ');

  if (
    displayName === undefined ||
    displayName.length < 1 ||
    displayName.length > 160
  ) {
    throw new Error('BOOTSTRAP_ADMIN_NAME must contain 1 to 160 characters');
  }

  return displayName;
}

function parseEmail(value: string | undefined): string {
  const email = value?.trim().toLowerCase();

  if (
    email === undefined ||
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }

  return email;
}

function parsePassword(value: string | undefined): string {
  if (value === undefined || value.length < 16 || value.length > 128) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must contain between 16 and 128 characters',
    );
  }

  return value;
}
