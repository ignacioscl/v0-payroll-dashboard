jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}))

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'

import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { GenericInvoiceConflictError } from 'src/srs/billing/generic-invoice-conflict.error'
import type { PendingLine } from 'src/srs/billing/repository/wo-to-be-billed.repository'
import type { ResolvedWoFilter } from 'src/srs/billing/service/wo-to-be-billed.service'
import type { WoToBeBilledFilter } from 'src/srs/billing/wo-to-be-billed-sql'
import { msgLogBatch, msgLogIndividual, WoInvoiceFacadeService } from './wo-invoice-facade.service'

/** WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): el orquestador de generar, con dobles. */

const ctx: SrsContext = { idUsuario: 46, idUsuarioRolrel: null, idRol: 2, idDealerProvider: 232, isUserDealer: false, isActive: true }

const filter: WoToBeBilledFilter = {
  idDealerProvider: 232,
  idDealer: 594,
  dateFrom: '2026-10-01',
  dateTo: '2026-11-12',
  status: [],
  departments: [],
  services: [],
  invoiceType: 3,
  includeZero: false,
  approved: '',
  wo: null,
  stock: null,
  price: null,
  ro: null,
  po: null,
  woIds: [],
}

const line = (idInvoice: number, idServiceInvoice: number, serviceDepartment = 492): PendingLine => ({
  idInvoice,
  idServiceInvoice,
  price: 10,
  serviceDepartment,
  serviceName: `S${idServiceInvoice}`,
  useQty: 0,
})

function mysqlError(errno: number): QueryFailedError {
  const err = new QueryFailedError('q', [], new Error('x'))
  ;(err as unknown as { driverError: { errno: number } }).driverError = { errno }
  return err
}

function build(over: { lines?: PendingLine[]; freeze?: number; lock?: boolean; haveInvoice?: boolean; services?: Array<{ idServiceInvoice: number; price: number }> } = {}) {
  const calls: string[] = []
  const queries: string[] = []
  let nro = 100
  const db = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      if (sql.includes('FROM DEALER_REL') && sql.includes('FOR UPDATE')) {
        calls.push('lock')
        return over.lock === false ? [] : [{ id: 1 }]
      }
      if (sql.includes('CHECK_DATE_FREEZE')) {
        calls.push('freeze')
        return [{ res: over.freeze ?? 1 }]
      }
      if (sql.includes('MAX(invoice_nro)')) return [{ nro: nro++ }]
      if (sql.includes('ini_nro_inv')) return [{ ini_nro_inv: 1, prefix_invoice: 'a' }]
      throw new Error(`consulta inesperada: ${sql}`)
    }),
  }
  let statementsCount = 0
  const statements = { insertWoStatement: jest.fn(async (_row: Record<string, unknown>) => 7000 + statementsCount++) }
  const invRels = { insertWoLines: jest.fn(async () => undefined) }
  const selSerRels = { insertSelected: jest.fn(async () => undefined) }
  const logs = { logInvoiceStatement: jest.fn(async () => undefined) }
  const screen = {
    assertScreenAccess: jest.fn(async () => calls.push('screen')),
    resolveFilter: jest.fn(),
    assertDealerInScope: jest.fn(async () => calls.push('scope')),
  }
  const woToBeBilled = {
    pendingLines: jest.fn(async () => {
      calls.push('lines')
      return over.lines ?? [line(1, 100), line(2, 100)]
    }),
  }
  const workOrderRules = {
    loadScoped: jest.fn(async () => ({
      id: 55,
      idDealer: 594,
      idDepartment: 492,
      idWorkflow: 7,
      idAuthor: 999,
      fullNro: 'T55',
      fechaAltaDate: '2026-10-05',
      estado: 1,
      ro: null,
      po: 'P9',
      stockNumber: null,
    })),
    woHaveInvoice: jest.fn(async () => over.haveInvoice ?? false),
    servicesOfWorkOrder: jest.fn(async () => over.services ?? [{ idServiceInvoice: 100, price: 10 }, { idServiceInvoice: 101, price: 0 }]),
  }
  const facade = new WoInvoiceFacadeService(
    statements as any,
    invRels as any,
    selSerRels as any,
    logs as any,
    screen as any,
    woToBeBilled as any,
    workOrderRules as any,
    db as any,
  )
  return { facade, calls, queries, db, statements, invRels, selSerRels, logs, screen, woToBeBilled, workOrderRules }
}

const resolved = (patch: Partial<WoToBeBilledFilter> = {}, serviceNames: string[] = []): ResolvedWoFilter => ({
  filter: { ...filter, ...patch },
  invoiceType: (patch.invoiceType ?? filter.invoiceType) as any,
  serviceNames,
})

describe('WoInvoiceFacadeService.generateTx', () => {
  it('el candado es la primera sentencia; después el Lock Date y las líneas, por la misma conexión', async () => {
    const t = build()
    await t.facade.generateTx(ctx, resolved())
    expect(t.calls.slice(0, 3)).toEqual(['lock', 'freeze', 'lines'])
    expect(t.queries[0]).toContain('FOR UPDATE')
  })

  it('Lock Date 0 corta sin escribir; 1 y 2 pasan', async () => {
    const blocked = build({ freeze: 0 })
    await expect(blocked.facade.generateTx(ctx, resolved())).rejects.toThrow('The billing has been blocked')
    expect(blocked.statements.insertWoStatement).not.toHaveBeenCalled()
    for (const freeze of [1, 2]) {
      const ok = build({ freeze })
      await expect(ok.facade.generateTx(ctx, resolved())).resolves.toMatchObject({ workOrders: 2 })
    }
  })

  it('sin relación activa del dealer: 403 y no escribe', async () => {
    const t = build({ lock: false })
    await expect(t.facade.generateTx(ctx, resolved())).rejects.toBeInstanceOf(ForbiddenException)
    expect(t.statements.insertWoStatement).not.toHaveBeenCalled()
  })

  it('sin rango: «Select a date range to generate invoices», antes del candado y sin escribir', async () => {
    const t = build()
    await expect(t.facade.generateTx(ctx, resolved({ dateFrom: null, dateTo: null }))).rejects.toThrow(
      'Select a date range to generate invoices',
    )
    expect(t.calls).toEqual([])
    expect(t.statements.insertWoStatement).not.toHaveBeenCalled()
  })

  it('plan vacío: «There is nothing to invoice with these filters» y no escribe (D10)', async () => {
    const t = build({ lines: [] })
    await expect(t.facade.generateTx(ctx, resolved())).rejects.toThrow('There is nothing to invoice with these filters')
    expect(t.statements.insertWoStatement).not.toHaveBeenCalled()
  })

  it('Multi-Services: una invoice con las 19 columnas de legacy, sus líneas y su log', async () => {
    const t = build()
    const res = await t.facade.generateTx(ctx, resolved())
    expect(t.statements.insertWoStatement).toHaveBeenCalledTimes(1)
    expect(t.statements.insertWoStatement.mock.calls[0][0]).toEqual({
      idDealer: 594,
      idDealerProvider: 232,
      idDepartment: null,
      idInvoiceService: null,
      idAuthor: 46,
      invoicePrefix: 'A',
      invoiceNro: 101,
      fullNro: 'A101',
      statementType: 3,
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-11-12',
      invoiceServiceSelRel: null,
      po: null,
    })
    expect(t.invRels.insertWoLines).toHaveBeenCalledWith(7000, [
      { idInvoice: 1, idServiceInvoice: 100 },
      { idInvoice: 2, idServiceInvoice: 100 },
    ])
    expect(t.logs.logInvoiceStatement).toHaveBeenCalledWith(7000, 46, msgLogBatch(2))
    expect(res).toEqual({ invoices: [{ id: 7000, fullNro: 'A101', dateFrom: '2026-10-01', dateTo: '2026-11-12' }], workOrders: 2 })
  })

  it('by Services sin servicio: una por servicio, cada una con su número', async () => {
    const t = build({ lines: [line(1, 100), line(1, 200, 493), line(2, 100)] })
    const res = await t.facade.generateTx(ctx, resolved({ invoiceType: 2 }))
    expect(res.invoices.map((i) => i.fullNro)).toEqual(['A101', 'A102'])
    expect(t.statements.insertWoStatement.mock.calls.map((c: any[]) => [c[0].idInvoiceService, c[0].idDepartment])).toEqual([
      [100, 492],
      [200, 493],
    ])
  })

  it('Selected Services: el nombre de todos los servicios elegidos y una fila por cada uno, tenga o no líneas', async () => {
    const t = build({ lines: [line(1, 100)] })
    await t.facade.generateTx(ctx, resolved({ invoiceType: 4, services: [100, 300] }, ['Wash', 'Wax']))
    expect(t.statements.insertWoStatement.mock.calls[0][0]).toMatchObject({ statementType: 4, invoiceServiceSelRel: 'Wash, Wax' })
    expect(t.selSerRels.insertSelected).toHaveBeenCalledWith(7000, [100, 300])
  })
})

describe('WoInvoiceFacadeService.generate — errores de la base', () => {
  it('número duplicado: reintenta una vez la transacción entera', async () => {
    const t = build()
    t.screen.resolveFilter.mockResolvedValue(resolved())
    const spy = jest
      .spyOn(t.facade, 'generateTx')
      .mockRejectedValueOnce(mysqlError(1062))
      .mockResolvedValueOnce({ invoices: [], workOrders: 0 })
    await t.facade.generate(ctx, {} as any)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it.each([1205, 1213])('%i (candado vencido / interbloqueo): 409 RETRY', async (errno) => {
    const t = build()
    t.screen.resolveFilter.mockResolvedValue(resolved())
    jest.spyOn(t.facade, 'generateTx').mockRejectedValue(mysqlError(errno))
    const err = await t.facade.generate(ctx, {} as any).catch((e) => e)
    expect(err).toBeInstanceOf(GenericInvoiceConflictError)
    expect(err.code).toBe('RETRY')
  })

  it('permisos y filtro van antes de la transacción', async () => {
    const t = build()
    t.screen.assertScreenAccess.mockRejectedValue(new ForbiddenException('Forbidden'))
    const spy = jest.spyOn(t.facade, 'generateTx')
    await expect(t.facade.generate(ctx, {} as any)).rejects.toBeInstanceOf(ForbiddenException)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('WoInvoiceFacadeService.generateIndividualTx', () => {
  it('candado primero; la WO a nombre de su autor (D14), fechas de la WO, PO de la WO; sin ceros', async () => {
    const t = build()
    const res = await t.facade.generateIndividualTx(ctx, 55, 594, false)
    expect(t.calls[0]).toBe('lock')
    expect(t.statements.insertWoStatement.mock.calls[0][0]).toMatchObject({
      statementType: 1,
      idAuthor: 999,
      idDepartment: 492,
      idInvoiceService: null,
      fechaDesde: '2026-10-05',
      fechaHasta: '2026-10-05',
      po: 'P9',
    })
    expect(t.invRels.insertWoLines).toHaveBeenCalledWith(7000, [{ idInvoice: 55, idServiceInvoice: 100 }])
    expect(t.logs.logInvoiceStatement).toHaveBeenCalledWith(7000, 46, msgLogIndividual('T55'))
    expect(res).toMatchObject({ dateFrom: '2026-10-05', dateTo: '2026-10-05' })
  })

  it('ya facturada: 409 «Work order already invoiced»', async () => {
    const t = build({ haveInvoice: true })
    await expect(t.facade.generateIndividualTx(ctx, 55, 594, false)).rejects.toBeInstanceOf(ConflictException)
    expect(t.statements.insertWoStatement).not.toHaveBeenCalled()
  })

  it('Lock Date contra la fecha de alta (§3, pregunta 2)', async () => {
    const t = build({ freeze: 0 })
    await expect(t.facade.generateIndividualTx(ctx, 55, 594, false)).rejects.toThrow('The billing has been blocked')
  })

  it('solo servicios en cero y sin «Include Zero Value»: no crea una invoice vacía (D10)', async () => {
    const t = build({ services: [{ idServiceInvoice: 100, price: 0 }] })
    await expect(t.facade.generateIndividualTx(ctx, 55, 594, false)).rejects.toBeInstanceOf(BadRequestException)
    await expect(t.facade.generateIndividualTx(ctx, 55, 594, true)).resolves.toBeDefined()
  })

  it('el dealer de la WO cambió entre la lectura y el candado: 409', async () => {
    const t = build()
    await expect(t.facade.generateIndividualTx(ctx, 55, 111, false)).rejects.toBeInstanceOf(ConflictException)
  })
})
