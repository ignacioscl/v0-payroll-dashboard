import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { WorkOrderQueryDto } from '../dto/work-order.dto'
import { WorkOrder } from '../entity/work-order.entity'
import { WorkOrderRepository } from '../repository/work-order.repository'

export type RoPoSemiFlags = { roSemi: boolean; poSemi: boolean; stockSemi: boolean }

/**
 * `INVOICE` (la WO). Escribe solo las columnas que cambian (D12): legacy reescribe la fila entera con lo que leyó antes.
 * Cada `UPDATE` es condicional, va acotado a la empresa y devuelve las filas que tocó (el que llama exige una).
 */
@Injectable()
export class WorkOrderService extends GlobalBaseService<WorkOrder, WorkOrderQueryDto> {
  constructor(@Inject(WorkOrderRepository) private readonly repository: WorkOrderRepository) {
    super()
  }

  protected getRepository(): WorkOrderRepository {
    return this.repository
  }

  /** Eliminar: `estado = 0` solo si sigue activa (T5, paso 7). */
  async markDeleted(id: number, idDealerProvider: number): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(WorkOrder)
      .set({ estado: 0 })
      .where('id = :id AND id_dealer_provider = :prov AND estado = 1', { id, prov: idDealerProvider })
      .execute()
    return Number(result.affected ?? 0)
  }

  /**
   * RO# o PO# y las tres marcas de semi-obligatorio en **un solo `UPDATE`** (T6, paso 6). Las marcas se calculan en la
   * propia sentencia con lo que la fila tiene al escribir: el campo que se edita se compara por parámetro y los otros
   * dos por columna, así el resultado no depende del orden en que la base evalúa las asignaciones.
   */
  async updateRoPo(
    id: number,
    idDealerProvider: number,
    field: 'ro' | 'po',
    value: string | null,
    flags: RoPoSemiFlags,
  ): Promise<number> {
    const semi = (flag: boolean, edited: boolean, column: string) =>
      edited
        ? `IF(${flag ? 1 : 0} = 1 AND COALESCE(:nuevo, '') = '', 1, 0)`
        : `IF(${flag ? 1 : 0} = 1 AND COALESCE(${column}, '') = '', 1, 0)`
    const result = await this.repository
      .createQueryBuilder()
      .update(WorkOrder)
      .set({
        ...(field === 'ro' ? { ro: value } : { po: value }),
        roSemiReq: () => semi(flags.roSemi, field === 'ro', 'ro'),
        poSemiReq: () => semi(flags.poSemi, field === 'po', 'po'),
        stockSemiReq: () => semi(flags.stockSemi, false, 'stock_number'),
      })
      .where('id = :id AND id_dealer_provider = :prov AND estado = 1', { id, prov: idDealerProvider })
      .setParameter('nuevo', value)
      .execute()
    return Number(result.affected ?? 0)
  }
}
