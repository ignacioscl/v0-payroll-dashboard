import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ParametricDataCategoryController } from './controller/parametric-data-category.controller'
import { ParametricDataCategory } from './entity/parametric-data-category.entity'
import { ParametricDataCategoryRepository } from './repository/parametric-data-category.repository'
import { ParametricDataCategoryService } from './service/parametric-data-category.service'

@Module({
  imports: [TypeOrmModule.forFeature([ParametricDataCategory])],
  providers: [ParametricDataCategoryRepository, ParametricDataCategoryService],
  controllers: [ParametricDataCategoryController],
  exports: [ParametricDataCategoryService],
})
export class ParametricDataCategoryModule {}
