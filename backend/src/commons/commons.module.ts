import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserModule } from '../features/user/user.module'
import { CompanyModule } from '../features/company/company.module'
import { AuthUtils } from './utils/auth.utils'
import { EmailModule } from './email/email.module'
@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => ConfigModule),
    EmailModule,
  ],
  providers: [AuthUtils],
  exports: [AuthUtils, EmailModule],
})
export class CommonsModule {}
