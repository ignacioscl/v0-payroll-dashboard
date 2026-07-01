import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { UserService } from '../../user/service/user.service'
import { TokenPayload } from '../types/token.payload.type'
import { User } from 'src/features/user/entity/user.entity'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(readonly configService: ConfigService, private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwtSecret'),
    })
  }

  async validate(payload: TokenPayload): Promise<User | null> {
    const { username } = payload
    //console.log(this.userService.findByUsername(username))
    const user = await this.userService.findByUsername(username)
    if (user) {
      const { password, tempPassword, ...userWithoutPassword } = user as any
      return userWithoutPassword as any
    }
    return null
  }
}
