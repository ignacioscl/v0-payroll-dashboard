import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserModule } from '../features/user/user.module'
import { CompanyModule } from '../features/company/company.module'
import { AuthUtils } from './utils/auth.utils'
@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => ConfigModule),
  ],
  providers: [AuthUtils],
  exports: [AuthUtils],
})
export class CommonsModule {}
