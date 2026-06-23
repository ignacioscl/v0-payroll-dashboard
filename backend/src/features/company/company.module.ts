import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CompanyController } from './controller/company.controller'
import { Company } from './entity/company.entity'
import { CompanyRepository } from './repository/company.repository'
import { CompanyService } from './service/company.service'

@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers: [CompanyRepository, CompanyService],
  controllers: [CompanyController],
  exports: [CompanyService],
})
export class CompanyModule {}
