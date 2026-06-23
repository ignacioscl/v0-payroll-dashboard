import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserCompanyRelController } from './controller/user.company.rel.controller'
import { UserCompanyRel } from './entity/user.company.rel.entity'
import { UserCompanyRelRepository } from './repository/user.company.rel.repository'
import { UserCompanyRelService } from './service/user.company.rel.service'

@Module({
  imports: [TypeOrmModule.forFeature([UserCompanyRel])],
  providers: [UserCompanyRelRepository, UserCompanyRelService],
  controllers: [UserCompanyRelController],
  exports: [UserCompanyRelService],
})
export class UserCompanyRelModule {}
