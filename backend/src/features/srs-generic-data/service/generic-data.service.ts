import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { GenericDataQueryDto } from '../dto/generic-data.dto'
import { GenericData } from '../entity/generic-data.entity'
import { GenericDataRepository } from '../repository/generic-data.repository'

/** CRUD de GENERIC_DATA (conexión default). La lógica de catálogo de gastos está en ExpenseCatalogService. */
@Injectable()
export class GenericDataService extends GlobalBaseService<GenericData, GenericDataQueryDto> {
  constructor(@Inject(GenericDataRepository) private readonly repository: GenericDataRepository) {
    super()
  }

  protected getRepository(): GenericDataRepository {
    return this.repository
  }

  findOwned(id: number, idCategoria: number, idDealerProvider: number) {
    return this.repository.findOwned(id, idCategoria, idDealerProvider)
  }

  findActiveByName(name: string, idCategoria: number, idDealerProvider: number, excludeId?: number) {
    return this.repository.findActiveByName(name, idCategoria, idDealerProvider, excludeId)
  }

  findByNameActiveFirst(name: string, idCategoria: number, idDealerProvider: number) {
    return this.repository.findByNameActiveFirst(name, idCategoria, idDealerProvider)
  }

  listCatalog(input: Parameters<GenericDataRepository['listCatalog']>[0]) {
    return this.repository.listCatalog(input)
  }

  catalogNames(idCategoria: number, idDealerProvider: number) {
    return this.repository.catalogNames(idCategoria, idDealerProvider)
  }

  expensesCountOf(id: number, idCategoria: number) {
    return this.repository.expensesCountOf(id, idCategoria)
  }

  inUseOf(id: number, idCategoria: number) {
    return this.repository.inUseOf(id, idCategoria)
  }

  deleteOwned(id: number, idCategoria: number, idDealerProvider: number) {
    return this.repository.deleteOwned(id, idCategoria, idDealerProvider)
  }

  childrenOf(fromId: number, idCategoria: number, idDealerProvider: number) {
    return this.repository.childrenOf(fromId, idCategoria, idDealerProvider)
  }

  reassignParent(fromId: number, toId: number, idCategoria: number, idDealerProvider: number) {
    return this.repository.reassignParent(fromId, toId, idCategoria, idDealerProvider)
  }
}
