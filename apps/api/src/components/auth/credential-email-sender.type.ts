import type { Language } from '@best/database';

export interface CredentialLoginCodeMessage {
  readonly code: string;
  readonly displayName: string;
  readonly language: Language;
  readonly to: string;
}

export interface CredentialEmailSender {
  sendLoginCode(message: CredentialLoginCodeMessage): Promise<void>;
}
