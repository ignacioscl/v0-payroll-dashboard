import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserController } from './controller/user.controller'
import { User } from './entity/user.entity'
import { UserExtended } from './entity/user-extended.entity'
import { UserRepository } from './repository/user.repository'
import { UserService } from './service/user.service'
import { EmailModule } from '../../commons/email/email.module'
import { UserCompanyRelModule } from '../user.company.rel/user.company.rel.module'
import { UserCompanyRelService } from '../user.company.rel/service/user.company.rel.service'
import { CompanyModule } from '../company/company.module'

@Module({
  imports: [TypeOrmModule.forFeature([User, UserExtended]), EmailModule, UserCompanyRelModule],
  providers: [UserRepository, UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
