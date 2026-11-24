import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { Transactional } from 'typeorm-transactional'

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { lockDealerForBilling } from 'src/srs/billing/billing-dealer-lock'
import { checkDateFreezeSql, MSG_BILLING_BLOCKED } from 'src/srs/billing/billing-dealer-scope'
import {
  INVOICE_TYPE_SELECTED_SERVICES,
  WoInvoiceType,
  WoToBeBilledFilterDto,
} from 'src/srs/billing/dto/wo-to-be-billed.dto'
import { GenericInvoiceConflictError } from 'src/srs/billing/generic-invoice-conflict.error'
import { isDupEntry, mysqlErrno } from 'src/srs/billing/generic-invoice-write-errors'
import { nextInvoiceNumber } from 'src/srs/billing/invoice-number'
import { WoToBeBilledRepository } from 'src/srs/billing/repository/wo-to-be-billed.repository'
import {
  MSG_NOTHING_TO_INVOICE,
  ResolvedWoFilter,
  WoToBeBilledService,
} from 'src/srs/billing/service/wo-to-be-billed.service'
import { buildWoInvoicePlan, PlannedInvoice } from 'src/srs/billing/wo-invoice-plan'
import { WorkOrderRulesRepository } from 'src/features/srs-invoice/repository/work-order-rules.repository'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import {
  CreatedWoInvoiceDto,
  GenerateIndividualInvoiceDto,
  GenerateWoInvoicesResponseDto,
} from '../dto/invoice-statement.dto'
import { InvoiceStatementInvRelService } from './invoice-statement-inv-rel.service'
import { InvoiceStatementSelSerRelService } from './invoice-statement-sel-ser-rel.service'
import { InvoiceStatementService } from './invoice-statement.service'

/** `INVOICE_STATEMENT.statement_type` de la invoice individual. */
export const STATEMENT_TYPE_INDIVIDUAL = 1

export const MSG_WO_ALREADY_INVOICED = 'Work order already invoiced'
export const MSG_SERVER_BUSY = 'The system is busy right now. Please try again in a minute.'
export const msgWoWithoutServices = (idInvoice: number) => `Work order ${idInvoice} with out services`
export const msgLogBatch = (workOrders: number) => `Invoice created from WO to be Billed (${workOrders} work orders)`
export const msgLogIndividual = (fullNro: string) => `Individual invoice created from WO #${fullNro}`

/** 1205 (espera de candado vencida) y 1213 (interbloqueo): 409 `RETRY`, que el front muestra como «servidor ocupado». */
function busyFromMysql(err: unknown): GenericInvoiceConflictError | null {
  const errno = mysqlErrno(err)
  if (errno === 1205 || errno === 1213) return new GenericInvoiceConflictError('RETRY', MSG_SERVER_BUSY)
  return null
}

/**
 * WO to be Billed: generar invoices desde Pro (plans/plan-wo-to-be-billed-v0, T3 y §8.3). Todo en **una** transacción:
 * o se crean todas las invoices con todas sus líneas, o ninguna. **La primera sentencia de la transacción es el
 * candado** del dealer (`lockDealerForBilling`); el Lock Date y las líneas pendientes se leen después, por la misma
 * conexión. Nada externo adentro: el PDF lo pide el front después, con la invoice ya confirmada.
 */
@Injectable()
export class WoInvoiceFacadeService {
  constructor(
    private readonly statements: InvoiceStatementService,
    private readonly invRels: InvoiceStatementInvRelService,
    private readonly selSerRels: InvoiceStatementSelSerRelService,
    private readonly logs: LogChangeService,
    private readonly screen: WoToBeBilledService,
    private readonly woToBeBilled: WoToBeBilledRepository,
    private readonly workOrderRules: WorkOrderRulesRepository,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ------------------------------------------------------------------ por tanda

  /** Fuera de la transacción: permisos, sesión interna, dealer en alcance y el filtro (§8.3, pasos 1 a 3). */
  async generate(ctx: SrsContext, dto: WoToBeBilledFilterDto): Promise<GenerateWoInvoicesResponseDto> {
    await this.screen.assertScreenAccess(ctx)
    const resolved = await this.screen.resolveFilter(ctx, dto, { forGenerate: true })
    return this.withRetry(() => this.generateTx(ctx, resolved))
  }

  @Transactional()
  async generateTx(ctx: SrsContext, resolved: ResolvedWoFilter): Promise<GenerateWoInvoicesResponseDto> {
    const f = resolved.filter
    // 5. El candado, primera sentencia.
    if (!(await lockDealerForBilling(this.db, f.idDealer, f.idDealerProvider))) {
      throw new ForbiddenException('Forbidden')
    }
    // 5 bis. Lock Date con el candado tomado: 0 corta; 1 y 2 pasan (`api.billing.php:74`).
    if ((await checkDateFreezeSql(this.db, ctx.idUsuario, f.idDealer, f.idDealerProvider, f.dateFrom)) === 0) {
      throw new BadRequestException(MSG_BILLING_BLOCKED)
    }
    // 6 y 7. Las líneas pendientes, por la misma conexión, y el plan.
    const lines = await this.woToBeBilled.pendingLines(f)
    const plan = buildWoInvoicePlan(
      { invoiceType: resolved.invoiceType as WoInvoiceType, departments: f.departments, services: f.services },
      lines,
    )
    if (!plan.invoices.length) throw new BadRequestException(MSG_NOTHING_TO_INVOICE)

    // 8. Cada invoice: número, cabecera, servicios elegidos, líneas y log.
    const invoices: CreatedWoInvoiceDto[] = []
    for (const planned of plan.invoices) {
      invoices.push(await this.insertBatchInvoice(ctx, resolved, planned))
    }
    return { invoices, workOrders: plan.workOrders }
  }

  private async insertBatchInvoice(
    ctx: SrsContext,
    resolved: ResolvedWoFilter,
    planned: PlannedInvoice,
  ): Promise<CreatedWoInvoiceDto> {
    const f = resolved.filter
    const isSelected = planned.statementType === INVOICE_TYPE_SELECTED_SERVICES
    const number = await nextInvoiceNumber(this.db, f.idDealer, f.idDealerProvider)
    const id = await this.statements.insertWoStatement({
      idDealer: f.idDealer,
      idDealerProvider: f.idDealerProvider,
      idDepartment: planned.idDepartment,
      idInvoiceService: planned.idInvoiceService,
      idAuthor: ctx.idUsuario,
      invoicePrefix: number.prefix,
      invoiceNro: number.invoiceNro,
      fullNro: number.fullNro,
      statementType: planned.statementType,
      fechaDesde: f.dateFrom,
      fechaHasta: f.dateTo,
      invoiceServiceSelRel: isSelected ? resolved.serviceNames.join(', ') : null,
      po: null,
    })
    if (isSelected) await this.selSerRels.insertSelected(id, f.services)
    await this.invRels.insertWoLines(id, planned.lines)
    const workOrders = new Set(planned.lines.map((l) => l.idInvoice)).size
    await this.logs.logInvoiceStatement(id, ctx.idUsuario, msgLogBatch(workOrders))
    return { id, fullNro: number.fullNro, dateFrom: f.dateFrom, dateTo: f.dateTo }
  }

  // ------------------------------------------------------------------ individual

  /** Fuera de la transacción: permisos, sesión interna, y la WO de la empresa y de un dealer en alcance (si no, 403). */
  async generateIndividual(
    ctx: SrsContext,
    idInvoice: number,
    dto: GenerateIndividualInvoiceDto,
  ): Promise<CreatedWoInvoiceDto> {
    await this.screen.assertScreenAccess(ctx)
    const wo = await this.workOrderRules.loadScoped(idInvoice, ctx.idDealerProvider)
    if (!wo) throw new ForbiddenException('Forbidden')
    await this.screen.assertDealerInScope(ctx, wo.idDealer)
    // De esta lectura solo se usa el dealer, para saber qué candado tomar.
    return this.withRetry(() => this.generateIndividualTx(ctx, idInvoice, wo.idDealer, dto.includeZero === true))
  }

  @Transactional()
  async generateIndividualTx(
    ctx: SrsContext,
    idInvoice: number,
    idDealer: number,
    includeZero: boolean,
  ): Promise<CreatedWoInvoiceDto> {
    if (!(await lockDealerForBilling(this.db, idDealer, ctx.idDealerProvider))) {
      throw new ForbiddenException('Forbidden')
    }
    // Todo lo que decide se vuelve a leer por la conexión de la transacción.
    const wo = await this.workOrderRules.loadScoped(idInvoice, ctx.idDealerProvider)
    if (!wo || wo.estado !== 1 || wo.idDealer !== idDealer) {
      throw new ConflictException('The work order changed. Reload and try again.')
    }
    if ((await checkDateFreezeSql(this.db, ctx.idUsuario, wo.idDealer, ctx.idDealerProvider, wo.fechaAltaDate)) === 0) {
      throw new BadRequestException(MSG_BILLING_BLOCKED)
    }
    if (await this.workOrderRules.woHaveInvoice(wo.id)) throw new ConflictException(MSG_WO_ALREADY_INVOICED)
    const services = await this.workOrderRules.servicesOfWorkOrder(wo.id)
    if (!services.length) throw new BadRequestException(msgWoWithoutServices(wo.id))
    const lines = services
      .filter((s) => includeZero || s.price > 0)
      .map((s) => ({ idInvoice: wo.id, idServiceInvoice: s.idServiceInvoice }))
    if (!lines.length) throw new BadRequestException(MSG_NOTHING_TO_INVOICE)

    const number = await nextInvoiceNumber(this.db, wo.idDealer, ctx.idDealerProvider)
    const id = await this.statements.insertWoStatement({
      idDealer: wo.idDealer,
      idDealerProvider: ctx.idDealerProvider,
      idDepartment: wo.idDepartment,
      idInvoiceService: null,
      // D14: la invoice individual queda a nombre del autor de la WO; quién hizo clic queda en el Log.
      idAuthor: wo.idAuthor,
      invoicePrefix: number.prefix,
      invoiceNro: number.invoiceNro,
      fullNro: number.fullNro,
      statementType: STATEMENT_TYPE_INDIVIDUAL,
      fechaDesde: wo.fechaAltaDate,
      fechaHasta: wo.fechaAltaDate,
      invoiceServiceSelRel: null,
      po: wo.po,
    })
    await this.invRels.insertWoLines(id, lines)
    await this.logs.logInvoiceStatement(id, ctx.idUsuario, msgLogIndividual(wo.fullNro))
    return { id, fullNro: number.fullNro, dateFrom: wo.fechaAltaDate, dateTo: wo.fechaAltaDate }
  }

  // ------------------------------------------------------------------ errores de la base

  /**
   * Número duplicado (el motor PHP numeró a la vez): se reintenta **una vez** la transacción entera, como Generic. Espera
   * de candado vencida o interbloqueo: 409 `RETRY`. Cualquier otro sigue al filtro global (500 sin mensaje).
   */
  private async withRetry<T>(run: () => Promise<T>): Promise<T> {
    try {
      try {
        return await run()
      } catch (err) {
        if (!isDupEntry(err)) throw err
        return await run()
      }
    } catch (err) {
      const busy = busyFromMysql(err)
      if (busy) throw busy
      throw err
    }
  }
}
