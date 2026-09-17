import type { AuthEnvironment } from '@best/config';
import { Language } from '@best/database';
import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { AUTH_ENVIRONMENT } from './auth.constants';
import type {
  CredentialEmailSender,
  CredentialLoginCodeMessage,
} from './credential-email-sender.type';

@Injectable()
export class CredentialEmailService implements CredentialEmailSender {
  private readonly transporter: Transporter | undefined;

  constructor(
    @Inject(AUTH_ENVIRONMENT)
    private readonly environment: AuthEnvironment,
  ) {
    const email = environment.credentialEmail;

    if (email !== undefined) {
      this.transporter = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.secure,
        ...(email.user === undefined || email.password === undefined
          ? {}
          : { auth: { pass: email.password, user: email.user } }),
      });
    }
  }

  async sendLoginCode(message: CredentialLoginCodeMessage): Promise<void> {
    const email = this.environment.credentialEmail;

    if (this.transporter === undefined || email === undefined) {
      throw emailDeliveryUnavailableError();
    }

    const content = getEmailContent(message.language, message);

    try {
      await this.transporter.sendMail({
        from: email.from,
        subject: content.subject,
        text: content.text,
        to: message.to,
      });
    } catch {
      throw emailDeliveryUnavailableError();
    }
  }
}

function getEmailContent(
  language: Language,
  message: CredentialLoginCodeMessage,
): { subject: string; text: string } {
  switch (language) {
    case Language.RU:
      return {
        subject: 'Код входа BEST LC',
        text: `${message.displayName}, ваш код входа: ${message.code}. Код действует 5 минут. Никому его не сообщайте.`,
      };
    case Language.EN:
      return {
        subject: 'Your BEST LC login code',
        text: `${message.displayName}, your login code is ${message.code}. It expires in 5 minutes. Do not share it.`,
      };
    case Language.UZ:
      return {
        subject: 'BEST LC kirish kodi',
        text: `${message.displayName}, kirish kodingiz: ${message.code}. Kod 5 daqiqa amal qiladi. Uni hech kimga bermang.`,
      };
  }
}

function emailDeliveryUnavailableError(): ApplicationError {
  return new ApplicationError(
    ErrorCode.SERVICE_UNAVAILABLE,
    'Email verification is temporarily unavailable',
    503,
  );
}
