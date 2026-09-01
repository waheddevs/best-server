import { loadAuthEnvironment } from '@best/config';
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import { ACCESS_TOKEN_VERIFIER, AUTH_IDENTITY_READER } from './auth.constants';
import { AuthIdentityService } from './auth-identity.service';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
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
    AuthIdentityService,
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
  ],
  exports: [AuthService, AuthGuard, RolesGuard, OptionalAuthGuard],
})
export class AuthModule {}
