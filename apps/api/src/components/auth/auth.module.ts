import { loadAuthEnvironment } from '@best/config';
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_VERIFIER,
  AUTH_ENVIRONMENT,
  AUTH_IDENTITY_PROVISIONER,
  AUTH_IDENTITY_READER,
} from './auth.constants';
import { AuthExchangeController } from './auth-exchange.controller';
import { AuthExchangeService } from './auth-exchange.service';
import { AuthIdentityService } from './auth-identity.service';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
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
    AuthExchangeService,
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
      provide: AUTH_IDENTITY_PROVISIONER,
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
  exports: [
    ACCESS_TOKEN_VERIFIER,
    AuthService,
    AuthGuard,
    RolesGuard,
    OptionalAuthGuard,
  ],
  controllers: [AuthExchangeController],
})
export class AuthModule {}
