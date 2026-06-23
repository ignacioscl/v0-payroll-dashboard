import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { UserService } from '../../user/service/user.service'
import { TokenPayload } from '../types/token.payload.type'

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(readonly configService: ConfigService, private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwtSecret'),
    })
  }

  async validate(payload: TokenPayload) {
    const { username } = payload
    return this.userService.findByUsername(username)
  }
}
