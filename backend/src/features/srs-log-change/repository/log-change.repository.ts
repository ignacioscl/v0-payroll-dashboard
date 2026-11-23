import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { LogChangeQueryDto } from '../dto/log-change.dto'
import { LogChange } from '../entity/log-change.entity'

@Injectable()
export class LogChangeRepository extends BaseRepository<LogChange, LogChangeQueryDto> {
  constructor(
    @InjectRepository(LogChange)
    private readonly _: Repository<LogChange>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: LogChangeQueryDto): Promise<PaginationDto<LogChange>> {
    const query = this.createQueryBuilder('l')
    if (payload.id != null) query.andWhere('l.id = :id', { id: payload.id })
    if (payload.idExpRepetitive != null) {
      query.andWhere('l.idExpRepetitive = :rule', { rule: payload.idExpRepetitive })
    }
    query.orderBy('l.id', 'DESC')
    return this.applyPagination(query, payload)
  }

  listForRule(idExpRepetitive: number, take = 200): Promise<LogChange[]> {
    return this.find({ where: { idExpRepetitive }, order: { id: 'DESC' }, take })
  }

  /**
   * T5b (plans/plan-reunion-juan-18-11 v9): el último que tocó cada WO y cuándo, entre `LOG_CHANGE` (edición de la WO)
   * y `LOG_WO_WORKFLOW_CHANGE` (cambio de estado). Solo dice quién y cuándo: no explica el motivo de un cambio de monto.
   * Las WO van acotadas a la empresa (`INVOICE.id_dealer_provider`).
   */
  async lastWorkOrderChanges(idContratista: number, invoiceIds: readonly number[]): Promise<Map<number, { idAutor: number; fecha: string }>> {
    const out = new Map<number, { idAutor: number; fecha: string }>()
    if (!invoiceIds.length) return out
    const marks = invoiceIds.map(() => '?').join(',')
    const rows: { idInvoice: unknown; idAutor: unknown; fecha: unknown }[] = await this.query(
      `SELECT x.idInvoice, x.idAutor, x.fecha FROM (
         SELECT lc.id_invoice AS idInvoice, lc.id_autor AS idAutor, lc.fecha AS fecha
           FROM LOG_CHANGE lc
           JOIN INVOICE i ON i.id = lc.id_invoice AND i.id_dealer_provider = ?
          WHERE lc.id_invoice IN (${marks})
         UNION ALL
         SELECT lw.id_work_order, lw.id_author, lw.fecha
           FROM LOG_WO_WORKFLOW_CHANGE lw
           JOIN INVOICE i ON i.id = lw.id_work_order AND i.id_dealer_provider = ?
          WHERE lw.id_work_order IN (${marks})
       ) x
       ORDER BY x.fecha DESC`,
      [idContratista, ...invoiceIds, idContratista, ...invoiceIds],
    )
    for (const r of rows) {
      const id = Number(r.idInvoice)
      if (!out.has(id)) out.set(id, { idAutor: Number(r.idAutor), fecha: String(r.fecha) })
    }
    return out
  }
}
