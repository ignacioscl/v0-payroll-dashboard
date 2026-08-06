import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { SrsJwtGuard } from './srs-jwt.guard'
import { SrsAuthContextService } from './srs-auth-context.service'
import { SrsPermissionRepository } from './srs-permission.repository'

/**
 * Auth de los endpoints SRS: valida el JWT de PHP y resuelve el contexto del
 * usuario (provider + tipo). El secret es el mismo JWT_AUTH de PHP (JWT_SECRET).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('jwtSecret') }),
    }),
  ],
  providers: [SrsJwtGuard, SrsAuthContextService, SrsPermissionRepository],
  // JwtModule must be exported so SrsJwtGuard can inject JwtService in KPI modules.
  exports: [SrsJwtGuard, SrsAuthContextService, SrsPermissionRepository, JwtModule],
})
export class SrsAuthModule {}
