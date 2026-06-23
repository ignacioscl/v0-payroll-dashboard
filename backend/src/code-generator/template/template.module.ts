import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { TemplateController } from './controller/template'
import { Template } from './entity/template'
import { TemplateRepository } from './repository/template'
import { TemplateService } from './service/template'

@Module({
  imports: [TypeOrmModule.forFeature([Template])],
  providers: [TemplateRepository, TemplateService],
  controllers: [TemplateController],
  exports: [TemplateService],
})
export class TemplateModule {}
