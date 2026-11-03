import { DataError } from 'src/commons/errors/data.error'
import { MSG_BRANCH_OUT_OF_SCOPE } from 'src/features/srs-expense/rules/expense-rules'
import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { assertDealersInScope, dealerIdsInScope, expenseScopeOf } from './expense-dealer-scope'

const admin: SrsContext = { idUsuario: 76, idUsuarioRolrel: null, idRol: 2, idDealerProvider: 79, isUserDealer: false, isActive: true }
const restricted: SrsContext = { ...admin, idUsuario: 4972, idRol: 5 }

function deps(scopedIds: number[], restrictedIds: number[]) {
  const dealers = { findScopedByIds: jest.fn().mockResolvedValue(scopedIds.map((id) => ({ id }))) }
  const report = { dealerIdsInRestriction: jest.fn().mockResolvedValue(restrictedIds) }
  return { dealers, report }
}

describe('expense-dealer-scope (una sola definición del alcance de dealers: gasto, regla, empleados)', () => {
  it('expenseScopeOf: Admin (rol 1/2) sin RESTRICTION_DEALER_V2; otro rol con restricción', () => {
    expect(expenseScopeOf(admin)).toEqual({ idDealerProvider: 79, idUsuario: 76, skipDealerRestriction: true })
    expect(expenseScopeOf(restricted)).toEqual({ idDealerProvider: 79, idUsuario: 4972, skipDealerRestriction: false })
  })

  it('dealerIdsInScope: primero la empresa (findScopedByIds), después la restricción con el alcance del usuario', async () => {
    const { dealers, report } = deps([408, 86], [408])
    const allowed = await dealerIdsInScope(dealers, report, restricted, [408, 86, 86, 186])
    expect([...allowed]).toEqual([408])
    expect(dealers.findScopedByIds).toHaveBeenCalledWith([408, 86, 186], 79)
    expect(report.dealerIdsInRestriction).toHaveBeenCalledWith(expenseScopeOf(restricted), [408, 86])
  })

  it('dealerIdsInScope: sin ids no consulta nada', async () => {
    const { dealers, report } = deps([], [])
    expect([...(await dealerIdsInScope(dealers, report, admin, []))]).toEqual([])
    expect(dealers.findScopedByIds).not.toHaveBeenCalled()
  })

  it('assertDealersInScope: un id fuera del alcance da 400 en el campo que diga fieldOf, con el texto de T9', async () => {
    const { dealers, report } = deps([408, 86], [408])
    let error: unknown
    try {
      await assertDealersInScope(dealers, report, restricted, [408, 86], (id) => `branches.${[408, 86].indexOf(id)}.idDealer`)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).validationErrors).toEqual([{ field: 'branches.1.idDealer', message: MSG_BRANCH_OUT_OF_SCOPE }])
  })

  it('assertDealersInScope: un dealer de otra empresa no pasa ni para el Admin', async () => {
    const { dealers, report } = deps([408], [408])
    await expect(assertDealersInScope(dealers, report, admin, [408, 186], () => 'idDealers')).rejects.toMatchObject({
      validationErrors: [{ field: 'idDealers', message: MSG_BRANCH_OUT_OF_SCOPE }],
    })
    await expect(assertDealersInScope(dealers, report, admin, [408], () => 'idDealers')).resolves.toBeUndefined()
  })
})
