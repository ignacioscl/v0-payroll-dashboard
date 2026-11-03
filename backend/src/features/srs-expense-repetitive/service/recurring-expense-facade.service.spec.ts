jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}))

import { DataError } from 'src/commons/errors/data.error'
import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { MSG_BRANCH_OUT_OF_SCOPE } from 'src/features/srs-expense/rules/expense-rules'
import { RecurringExpenseFacadeService } from './recurring-expense-facade.service'

const PROVIDER = 79
const RULE = 9
const DEALER_A = 408
const DEALER_B = 86
const OTHER_DEALER = 186

const admin: SrsContext = { idUsuario: 76, idUsuarioRolrel: null, idRol: 2, idDealerProvider: PROVIDER, isUserDealer: false, isActive: true }
const restricted: SrsContext = { ...admin, idUsuario: 4972, idRol: 5 }

function build(scopedIds: number[], restrictedIds: number[]) {
  const rule = {
    id: RULE,
    idDealerProvider: PROVIDER,
    idCompany: 1,
    idCategory: 2,
    description: 'Regla',
    amount: '100.00',
    splitType: 1,
    startDate: '2026-11-01',
    endDate: null,
    frequency: 1,
    weekDay: null,
    status: 1,
  }
  const rules = { findOwned: jest.fn().mockResolvedValue(rule), updateAmount: jest.fn() }
  const assigns = {
    listForRule: jest.fn().mockResolvedValue([]),
    listForRuleWithNames: jest.fn().mockResolvedValue([]),
    dealerIdsInRule: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    updateAssign: jest.fn(),
  }
  const logs = { logRule: jest.fn().mockResolvedValue(undefined) }
  const dealers = { findScopedByIds: jest.fn().mockResolvedValue(scopedIds.map((id) => ({ id }))) }
  const catalog = {}
  const generic = { findOwned: jest.fn().mockResolvedValue({ id: 1, name: 'x' }) }
  const permissions = { assertRolAccion: jest.fn().mockResolvedValue(undefined) }
  const report = { dealerIdsInRestriction: jest.fn().mockResolvedValue(restrictedIds) }
  const db = { query: jest.fn().mockResolvedValue([]) }
  const facade = new RecurringExpenseFacadeService(
    rules as any,
    assigns as any,
    logs as any,
    dealers as any,
    catalog as any,
    generic as any,
    permissions as any,
    report as any,
    db as any,
  )
  return { facade, assigns, dealers, report }
}

describe('RecurringExpenseFacadeService.addDealers — los dealers de una regla pasan por el mismo alcance que los de un gasto', () => {
  it('usuario con restricción: un dealer de la empresa pero fuera de RESTRICTION_DEALER_V2 da 400 en idDealers', async () => {
    const { facade, assigns, dealers, report } = build([DEALER_A, DEALER_B], [DEALER_A])
    let error: unknown
    try {
      await facade.addDealers(restricted, RULE, { idDealers: [DEALER_A, DEALER_B] })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).validationErrors).toEqual([{ field: 'idDealers', message: MSG_BRANCH_OUT_OF_SCOPE }])
    expect(dealers.findScopedByIds).toHaveBeenCalledWith([DEALER_A, DEALER_B], PROVIDER)
    expect(report.dealerIdsInRestriction).toHaveBeenCalledWith(
      { idDealerProvider: PROVIDER, idUsuario: restricted.idUsuario, skipDealerRestriction: false },
      [DEALER_A, DEALER_B],
    )
    expect(assigns.create).not.toHaveBeenCalled()
  })

  it('un dealer de otra empresa da 400 aunque sea Admin', async () => {
    const { facade, assigns } = build([DEALER_A], [DEALER_A])
    await expect(facade.addDealers(admin, RULE, { idDealers: [DEALER_A, OTHER_DEALER] })).rejects.toMatchObject({
      validationErrors: [{ field: 'idDealers', message: MSG_BRANCH_OUT_OF_SCOPE }],
    })
    expect(assigns.create).not.toHaveBeenCalled()
  })

  it('con todos en el alcance se agregan como Automatic (sin repetir los que ya están)', async () => {
    const { facade, assigns, report } = build([DEALER_A, DEALER_B], [DEALER_A, DEALER_B])
    assigns.dealerIdsInRule.mockResolvedValue([DEALER_B])
    await facade.addDealers(admin, RULE, { idDealers: [DEALER_A, DEALER_B, DEALER_A] })
    expect(report.dealerIdsInRestriction).toHaveBeenCalledWith(expect.objectContaining({ skipDealerRestriction: true }), [DEALER_A, DEALER_B])
    expect(assigns.create).toHaveBeenCalledTimes(1)
    expect(assigns.create).toHaveBeenCalledWith({ idExpRepetitive: RULE, idDealer: DEALER_A, percentage: null, fixedAmount: null, hasAutomaticPercentaje: 1 })
  })
})
