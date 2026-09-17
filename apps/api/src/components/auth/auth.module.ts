import { loadAuthEnvironment } from '@best/config';
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_VERIFIER,
  AUTH_ENVIRONMENT,
  AUTH_IDENTITY_READER,
  CREDENTIAL_EMAIL_SENDER,
} from './auth.constants';
import { AuthIdentityService } from './auth-identity.service';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { CredentialAuthService } from './credential-auth.service';
import { CredentialEmailService } from './credential-email.service';
import { CredentialPasswordService } from './credential-password.service';
import { AuthGuard } from './guards/auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const environment = loadAuthEnvironment();

        return {
          secret: environment.accessTokenSecret,
          signOptions: {
            algorithm: 'HS256',
            audience: environment.accessTokenAudience,
            expiresIn: environment.accessTokenTtlSeconds,
            issuer: environment.accessTokenIssuer,
          },
          verifyOptions: {
            algorithms: ['HS256'],
            audience: environment.accessTokenAudience,
            issuer: environment.accessTokenIssuer,
          },
        };
      },
    }),
  ],
  providers: [
    AuthResolver,
    AuthService,
    CredentialAuthService,
    CredentialEmailService,
    CredentialPasswordService,
    AuthIdentityService,
    {
      provide: AUTH_ENVIRONMENT,
      useFactory: loadAuthEnvironment,
    },
    {
      provide: AUTH_IDENTITY_READER,
      useExisting: AuthIdentityService,
    },
    {
      provide: CREDENTIAL_EMAIL_SENDER,
      useExisting: CredentialEmailService,
    },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      useExisting: AuthService,
    },
    AuthGuard,
    RolesGuard,
    OptionalAuthGuard,
  ],
  exports: [
    ACCESS_TOKEN_VERIFIER,
    AuthService,
    CredentialPasswordService,
    AuthGuard,
    RolesGuard,
    OptionalAuthGuard,
  ],
})
export class AuthModule {}
