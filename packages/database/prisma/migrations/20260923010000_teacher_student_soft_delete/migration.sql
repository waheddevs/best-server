-- Keep student and membership records for audit and financial history.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';
