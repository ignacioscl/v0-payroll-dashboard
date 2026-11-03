import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { ExpenseCatalogController } from './controller/expense-catalog.controller'
import { GenericData } from './entity/generic-data.entity'
import { GenericDataRepository } from './repository/generic-data.repository'
import { ExpenseCatalogService } from './service/expense-catalog.service'
import { GenericDataService } from './service/generic-data.service'

/** GENERIC_DATA (legacy): CRUD + el catálogo de Expenses (compañías 34 / categorías 35). */
@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([GenericData])],
  controllers: [ExpenseCatalogController],
  providers: [GenericDataRepository, GenericDataService, ExpenseCatalogService],
  exports: [GenericDataService, ExpenseCatalogService],
})
export class SrsGenericDataModule {}
