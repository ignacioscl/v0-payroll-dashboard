import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthUtils {
  async comparePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash)
  }
}
