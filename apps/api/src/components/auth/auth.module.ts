import { loadAuthEnvironment } from '@best/config';
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_VERIFIER,
  AUTH_ENVIRONMENT,
  AUTH_IDENTITY_READER,
} from './auth.constants';
import { AuthIdentityService } from './auth-identity.service';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './tokens/auth.service';
import { CredentialLoginService } from './credentials/credential-login.service';
import { CredentialPasswordService } from './credentials/credential-password.service';
import { AuthGuard } from './guards/auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CredentialSessionService } from './credentials/credential-session.service';

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
    CredentialLoginService,
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
      provide: ACCESS_TOKEN_VERIFIER,
      useExisting: AuthService,
    },
    AuthGuard,
    RolesGuard,
    OptionalAuthGuard,
    CredentialSessionService,
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
