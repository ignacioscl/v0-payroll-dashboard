import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { AuthService } from './service/auth.service'
import { AuthController } from './controller/auth.controller'
import { LocalStrategy } from './strategy/local.strategy'
import { JwtStrategy } from './strategy/jwt.strategy'
import { UserModule } from '../user/user.module'
import { CompanyModule } from '../company/company.module'
import { CommonsModule } from '../../commons/commons.module'
import { JwtRefreshStrategy } from './strategy/jwt.refresh.strategy'
import { ParametricDataModule } from '../parametric-data/parametric-data.module'

@Module({
  imports: [
    CommonsModule,
    UserModule,
    CompanyModule,
    ParametricDataModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: configService.get<string>('tokenExpiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
