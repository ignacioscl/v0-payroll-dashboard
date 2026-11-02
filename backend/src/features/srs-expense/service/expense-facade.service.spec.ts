jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}))

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'

import { DataError } from 'src/commons/errors/data.error'
import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_EDIT,
  ROL_ACCION_EXPENSES_ON_BEHALF,
} from 'src/srs/auth/srs-permission.repository'
import { toSingle, type GroupAggregate, type RawExpenseRow } from 'src/srs/expenses/expense-row-assembler'
import type { ExpenseGroupRow } from 'src/srs/expenses/dto/expense-row.dto'
import { MSG_RECEIPT_APPROVED, MSG_SOME_BRANCHES_OUTSIDE } from '../rules/expense-rules'
import { ExpenseFacadeService } from './expense-facade.service'

const PROVIDER = 79
const USER = 76
const EMPLOYEE = 137
const DEALER_A = 408
const DEALER_B = 86
const DEALER_C = 76
const GROUP = 5
const TICKET_DATE = '2015-06-15'

const admin: SrsContext = { idUsuario: USER, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }

function raw(partial: Partial<RawExpenseRow>): RawExpenseRow {
  return {
    id: 1,
    idExpGroup: null,
    ticketDate: TICKET_DATE,
    idCompany: 10,
    companyName: 'Home Depot',
    idCategory: 20,
    categoryName: 'Tools',
    idDealer: DEALER_A,
    dealerName: 'Acura of Melbourne',
    amount: '50.00',
    idAuthor: EMPLOYEE,
    authorName: 'Empleado',
    idCreatedBy: USER,
    createdByName: 'Javier',
    isApproved: null,
    idAuthorApproved: null,
    approvedByName: null,
    approvedDate: null,
    description: 'Rollos',
    receiptNumber: 'A-1',
    notes: '',
    estado: 1,
    idExpRepetitive: null,
    hasLog: 1,
    hasAttachment: 0,
    groupSplitType: null,
    groupAttachmentExpense: null,
    inScope: 1,
    ...partial,
  }
}

/** Dos filas de un grupo Equal de 100.00: la de 408 aprobada, la de 86 pendiente. */
function groupRows(patch: Partial<RawExpenseRow> = {}) {
  return [
    toSingle(raw({ id: 1, idExpGroup: GROUP, idDealer: DEALER_A, isApproved: 1, groupSplitType: 1, groupAttachmentExpense: 1, ...patch })),
    toSingle(raw({ id: 2, idExpGroup: GROUP, idDealer: DEALER_B, dealerName: 'Honda', groupSplitType: 1, groupAttachmentExpense: 1, ...patch })),
  ]
}

function aggregate(partial: Partial<GroupAggregate> = {}): GroupAggregate {
  return { total: 2, approved: 1, rejected: 0, inScope: 2, hasLog: false, totalCents: 10000, ...partial }
}

function build() {
  const expense = {
    id: 1,
    idDetailer: PROVIDER,
    idDealer: DEALER_A,
    idAuthor: EMPLOYEE,
    idCreatedBy: USER,
    idCompany: 10,
    idCategory: 20,
    idExpGroup: null,
    idExpRepetitive: null,
    amount: '125.50',
    ticketDate: TICKET_DATE,
    isApproved: null,
    estado: 1,
  }
  const expenses = {
    findOwned: jest.fn().mockResolvedValue(expense),
    updateById: jest.fn().mockResolvedValue(undefined),
    findByGroup: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  }
  const groups = {
    findOwned: jest.fn().mockResolvedValue({ id: GROUP, idDetailer: PROVIDER, splitType: 1, idAttachmentExpense: 1 }),
    setDeleted: jest.fn().mockResolvedValue(undefined),
    setAttachmentExpense: jest.fn().mockResolvedValue(undefined),
    setSplitType: jest.fn().mockResolvedValue(undefined),
  }
  const catalog = {
    requireOwned: jest.fn().mockImplementation(async (_ctx: unknown, _kind: unknown, id: number) => ({ id })),
    setLastCategory: jest.fn().mockResolvedValue(undefined),
    findOrCreate: jest.fn(),
  }
  const logs = { logExpense: jest.fn().mockResolvedValue(undefined), logGroup: jest.fn().mockResolvedValue(undefined) }
  const dealers = { findScopedByIds: jest.fn().mockImplementation(async (ids: number[]) => ids.map((id) => ({ id }))) }
  const rules = { findOwned: jest.fn() }
  const report = {
    rowsByIds: jest.fn().mockResolvedValue([toSingle(raw({}))]),
    rowsByGroup: jest.fn().mockResolvedValue(groupRows()),
    groupAggregates: jest.fn().mockResolvedValue(new Map([[GROUP, aggregate()]])),
    employeeAssigned: jest.fn().mockResolvedValue(true),
    dealerIdsInRestriction: jest.fn().mockImplementation(async (_scope: unknown, ids: number[]) => ids),
    genericNames: jest.fn().mockResolvedValue(new Map()),
    dealerNames: jest.fn().mockResolvedValue(new Map()),
    userNames: jest.fn().mockResolvedValue(new Map()),
    logRows: jest.fn().mockResolvedValue([]),
  }
  const permissions = { assertRolAccion: jest.fn().mockResolvedValue(undefined), userHasRolAccion: jest.fn().mockResolvedValue(false) }
  const facade = new ExpenseFacadeService(
    expenses as any,
    groups as any,
    catalog as any,
    logs as any,
    dealers as any,
    rules as any,
    report as any,
    permissions as any,
  )
  return { facade, expense, expenses, groups, catalog, logs, dealers, report, permissions }
}

const singleBody = (patch: Record<string, unknown> = {}) => ({
  ticketDate: TICKET_DATE,
  idCompany: 10,
  idCategory: 20,
  mode: 'single' as const,
  idDealer: DEALER_A,
  totalAmount: '125.50',
  description: 'Rollos',
  receiptNumber: 'A-1',
  kind: 'single' as const,
  ...patch,
})

const groupBody = (patch: Record<string, unknown> = {}) => ({
  ticketDate: TICKET_DATE,
  idCompany: 10,
  idCategory: 20,
  mode: 'equal' as const,
  totalAmount: '100.00',
  branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }],
  description: 'Rollos',
  receiptNumber: 'A-1',
  kind: 'group' as const,
  ...patch,
})

async function errorOf(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

describe('ExpenseFacadeService.update — idAuthor solo se valida si cambia (paridad ExpenseHelper.php:31-33)', () => {
  it('el mismo autor que tiene el gasto: ni 117 ni «empleado asignado», y queda el mismo', async () => {
    const { facade, expenses, report, permissions } = build()
    await facade.update(admin, 1, singleBody({ idAuthor: EMPLOYEE }))
    expect(permissions.assertRolAccion).toHaveBeenCalledWith(admin, ROL_ACCION_EXPENSES_EDIT)
    expect(permissions.assertRolAccion).not.toHaveBeenCalledWith(admin, ROL_ACCION_EXPENSES_ON_BEHALF)
    expect(report.employeeAssigned).not.toHaveBeenCalled()
    expect(expenses.updateById).toHaveBeenCalledWith(1, expect.objectContaining({ idAuthor: EMPLOYEE }))
  })

  it('sin idAuthor en el cuerpo se conserva el actual (no vuelve al usuario de la sesión)', async () => {
    const { facade, expenses, report } = build()
    await facade.update(admin, 1, singleBody())
    expect(report.employeeAssigned).not.toHaveBeenCalled()
    expect(expenses.updateById).toHaveBeenCalledWith(1, expect.objectContaining({ idAuthor: EMPLOYEE }))
  })

  it('otro autor: exige 117 y que esté asignado a la Branch; si no, 400 en idAuthor', async () => {
    const { facade, expenses, report, permissions } = build()
    await facade.update(admin, 1, singleBody({ idAuthor: 200 }))
    expect(permissions.assertRolAccion).toHaveBeenCalledWith(admin, ROL_ACCION_EXPENSES_ON_BEHALF)
    expect(report.employeeAssigned).toHaveBeenCalledWith(PROVIDER, 200, [DEALER_A])
    expect(expenses.updateById).toHaveBeenCalledWith(1, expect.objectContaining({ idAuthor: 200 }))

    report.employeeAssigned.mockResolvedValue(false)
    const e = await errorOf(() => facade.update(admin, 1, singleBody({ idAuthor: 201 })))
    expect(e).toBeInstanceOf(DataError)
    expect((e as DataError).validationErrors?.[0]?.field).toBe('idAuthor')
  })

  it('en un grupo sin aprobadas pasa lo mismo: el mismo autor no se valida, otro sí (contra los dealers del grupo)', async () => {
    const { facade, report } = build()
    report.rowsByGroup.mockResolvedValue(groupRows({ isApproved: null }))
    report.groupAggregates.mockResolvedValue(new Map([[GROUP, aggregate({ approved: 0 })]]))
    await facade.update(admin, GROUP, groupBody({ idAuthor: EMPLOYEE }))
    expect(report.employeeAssigned).not.toHaveBeenCalled()
    await facade.update(admin, GROUP, groupBody({ idAuthor: 200 }))
    expect(report.employeeAssigned).toHaveBeenCalledWith(PROVIDER, 200, [DEALER_A, DEALER_B])
  })

  it('un gasto suelto sin mode da 400 en mode', async () => {
    const { facade } = build()
    const e = await errorOf(() => facade.update(admin, 1, singleBody({ mode: undefined })))
    expect((e as DataError).validationErrors?.[0]?.field).toBe('mode')
  })
})

describe('ExpenseFacadeService.update — grupo con una fila aprobada: 409 solo si el reparto cambia de verdad', () => {
  it('el mismo reparto en el cuerpo (dealers, total y tipo iguales) no es un cambio: se aplican los textos a todas', async () => {
    const { facade, expenses, logs } = build()
    const out = (await facade.update(admin, GROUP, groupBody({ notes: 'Nota nueva' }))) as ExpenseGroupRow
    expect(out.kind).toBe('group')
    expect(expenses.updateById).toHaveBeenCalledTimes(2)
    expect(expenses.updateById).toHaveBeenCalledWith(1, { description: 'Rollos', receiptNumber: 'A-1', notes: 'Nota nueva' })
    expect(expenses.updateById).toHaveBeenCalledWith(2, { description: 'Rollos', receiptNumber: 'A-1', notes: 'Nota nueva' })
    expect(logs.logExpense).toHaveBeenCalledWith(1, USER, 'Notes: - -> Nota nueva')
  })

  it('el cuerpo de solo textos (sin ticketDate ni mode) se acepta', async () => {
    const { facade, expenses } = build()
    await facade.update(admin, GROUP, { description: 'Otra', receiptNumber: 'B-2', notes: '', kind: 'group' })
    expect(expenses.updateById).toHaveBeenCalledWith(1, { description: 'Otra', receiptNumber: 'B-2', notes: '' })
  })

  it.each([
    ['otro dealer', { branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_C }] }],
    ['un dealer más', { branches: [{ idDealer: DEALER_A }, { idDealer: DEALER_B }, { idDealer: DEALER_C }] }],
    ['otro total', { totalAmount: '200.00' }],
    ['otro tipo de reparto', { mode: 'percent', branches: [{ idDealer: DEALER_A, percentage: '50' }, { idDealer: DEALER_B, percentage: '50' }] }],
    ['otra fecha', { ticketDate: '2015-06-14' }],
    ['otra compañía', { idCompany: 11 }],
    ['otro autor', { idAuthor: 200 }],
  ])('%s → 409 «%s»', async (_name, patch) => {
    const { facade, expenses } = build()
    const e = await errorOf(() => facade.update(admin, GROUP, groupBody(patch)))
    expect(e).toBeInstanceOf(ConflictException)
    expect((e as Error).message).toBe(MSG_RECEIPT_APPROVED)
    expect(expenses.updateById).not.toHaveBeenCalled()
  })

  it('By amount: los mismos dealers con los mismos importes no cambian; un importe distinto sí', async () => {
    const { facade, groups, report, expenses } = build()
    groups.findOwned.mockResolvedValue({ id: GROUP, idDetailer: PROVIDER, splitType: 3, idAttachmentExpense: 1 })
    report.rowsByGroup.mockResolvedValue(groupRows({ groupSplitType: 3 }))
    const same = groupBody({ mode: 'amount', totalAmount: undefined, branches: [{ idDealer: DEALER_B, amount: '50.00' }, { idDealer: DEALER_A, amount: '50' }] })
    await facade.update(admin, GROUP, same)
    expect(expenses.updateById).toHaveBeenCalledTimes(2)
    const changed = groupBody({ mode: 'amount', totalAmount: undefined, branches: [{ idDealer: DEALER_A, amount: '60.00' }, { idDealer: DEALER_B, amount: '40.00' }] })
    await expect(facade.update(admin, GROUP, changed)).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('ExpenseFacadeService.logAttachment — «Attachment {filename}» en LOG_GENERIC', () => {
  it('con 110 alcanza; sin 110 exige 118', async () => {
    const { facade, permissions, logs } = build()
    permissions.userHasRolAccion.mockResolvedValue(true)
    await facade.logAttachment(admin, 1, { filename: 'receipt.jpg' })
    expect(permissions.userHasRolAccion).toHaveBeenCalledWith(admin, ROL_ACCION_EXPENSES_ADD)
    expect(permissions.assertRolAccion).not.toHaveBeenCalled()
    expect(logs.logExpense).toHaveBeenCalledWith(1, USER, 'Attachment receipt.jpg', null)

    permissions.userHasRolAccion.mockResolvedValue(false)
    await facade.logAttachment(admin, 1, { filename: 'other.pdf' })
    expect(permissions.assertRolAccion).toHaveBeenCalledWith(admin, ROL_ACCION_EXPENSES_EDIT)
  })

  it('la fila del adjunto de un grupo lleva también id_exp_group; otra fila del grupo, no', async () => {
    const { facade, report, logs } = build()
    const [attachmentRow, otherRow] = groupRows()
    report.rowsByIds.mockResolvedValueOnce([attachmentRow])
    await facade.logAttachment(admin, 1, { filename: 'a.jpg' })
    expect(logs.logExpense).toHaveBeenCalledWith(1, USER, 'Attachment a.jpg', GROUP)
    report.rowsByIds.mockResolvedValueOnce([otherRow])
    await facade.logAttachment(admin, 2, { filename: 'b.jpg' })
    expect(logs.logExpense).toHaveBeenCalledWith(2, USER, 'Attachment b.jpg', null)
  })

  it('un gasto de otra empresa o fuera del alcance da 404 y no escribe', async () => {
    const { facade, report, logs } = build()
    report.rowsByIds.mockResolvedValueOnce([])
    await expect(facade.logAttachment(admin, 99, { filename: 'x.jpg' })).rejects.toBeInstanceOf(NotFoundException)
    report.rowsByIds.mockResolvedValueOnce([toSingle(raw({ inScope: 0 }))])
    await expect(facade.logAttachment(admin, 1, { filename: 'x.jpg' })).rejects.toBeInstanceOf(NotFoundException)
    expect(logs.logExpense).not.toHaveBeenCalled()
  })
})

describe('ExpenseFacadeService.restoreGroup', () => {
  it('restaura todas las filas borradas (estado 1, sin quién ni cuándo), reabre el grupo y deja el log por fila y por grupo', async () => {
    const { facade, expenses, groups, logs, report } = build()
    report.groupAggregates.mockResolvedValueOnce(new Map([[GROUP, aggregate({ approved: 0 })]]))
    expenses.findByGroup.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    const out = (await facade.restoreGroup(admin, GROUP)) as ExpenseGroupRow
    expect(out.kind).toBe('group')
    expect(expenses.findByGroup).toHaveBeenCalledWith(GROUP, PROVIDER, 0)
    expect(expenses.updateById).toHaveBeenCalledWith(1, { estado: 1, idAuthorDel: null, deletedDate: null })
    expect(expenses.updateById).toHaveBeenCalledWith(2, { estado: 1, idAuthorDel: null, deletedDate: null })
    expect(logs.logExpense).toHaveBeenCalledWith(1, USER, 'Group restored (2 branches)')
    expect(logs.logExpense).toHaveBeenCalledWith(2, USER, 'Group restored (2 branches)')
    expect(logs.logGroup).toHaveBeenCalledWith(GROUP, USER, 'Group restored (2 branches)')
    expect(groups.setDeleted).toHaveBeenCalledWith(GROUP, false)
  })

  it('con alguna fila borrada fuera del alcance (D8) da 403 y no toca nada', async () => {
    const { facade, expenses, report } = build()
    report.groupAggregates.mockResolvedValueOnce(new Map([[GROUP, aggregate({ inScope: 1 })]]))
    const e = await errorOf(() => facade.restoreGroup(admin, GROUP))
    expect(e).toBeInstanceOf(ForbiddenException)
    expect((e as Error).message).toBe(MSG_SOME_BRANCHES_OUTSIDE)
    expect(expenses.updateById).not.toHaveBeenCalled()
  })

  it('un grupo de otra empresa da 404; sin filas borradas devuelve el grupo como está', async () => {
    const { facade, groups, report, expenses } = build()
    groups.findOwned.mockResolvedValueOnce(null)
    await expect(facade.restoreGroup(admin, GROUP)).rejects.toBeInstanceOf(NotFoundException)
    report.groupAggregates.mockResolvedValueOnce(new Map())
    const out = (await facade.restoreGroup(admin, GROUP)) as ExpenseGroupRow
    expect(out.groupId).toBe(GROUP)
    expect(expenses.updateById).not.toHaveBeenCalled()
  })

  it('el restore por fila también borra quién y cuándo la dio de baja', async () => {
    const { facade, expenses, expense } = build()
    expenses.findOwned.mockResolvedValueOnce({ ...expense, estado: 0 })
    await facade.restore(admin, 1)
    expect(expenses.updateById).toHaveBeenCalledWith(1, { estado: 1, idAuthorDel: null, deletedDate: null })
  })
})

describe('ExpenseFacadeService — rejectedCount en el grupo', () => {
  it('get de un grupo devuelve approvedCount y rejectedCount del agregado', async () => {
    const { facade, report } = build()
    report.rowsByIds.mockResolvedValueOnce([groupRows()[0]])
    report.groupAggregates.mockResolvedValueOnce(new Map([[GROUP, aggregate({ approved: 1, rejected: 1 })]]))
    const out = (await facade.get(admin, 1)) as ExpenseGroupRow
    expect(out.approvedCount).toBe(1)
    expect(out.rejectedCount).toBe(1)
  })
})
