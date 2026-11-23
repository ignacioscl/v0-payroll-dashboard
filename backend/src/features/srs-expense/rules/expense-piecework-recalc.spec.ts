import {
  PIECEWORK_REASON,
  PieceworkInputs,
  StoredPieceworkRow,
  amountsByExpenseRow,
  changeReasons,
  currentAmount,
  decideRow,
  encodeReasons,
} from './expense-piecework-recalc'

const inputs = (over: Partial<PieceworkInputs> = {}): PieceworkInputs => ({
  woEstado: 1,
  hasService: 1,
  hasVendor: 1,
  servicePiecework: '30.00',
  servicePrice: '100.00',
  employeePiecework: null,
  employeeCount: 2,
  ...over,
})

const stored = (over: Partial<StoredPieceworkRow> = {}): StoredPieceworkRow => ({
  amount: '15.00',
  idDealer: 10,
  workDate: '2026-10-05',
  checkedAt: new Date('2026-10-20T00:00:00Z'),
  inputs: inputs(),
  ...over,
})

const codes = (rs: { code: string }[]) => rs.map((r) => r.code)

describe('currentAmount (R1: la ponchada no cuenta; la WO, el servicio y el vendor sí)', () => {
  it('toma el piecework de la función', () => expect(currentAmount('15', inputs())).toBe('15.00'))
  it('WO eliminada → $0', () => expect(currentAmount('15', inputs({ woEstado: 0 }))).toBe('0.00'))
  it('sin el servicio → $0', () => expect(currentAmount('15', inputs({ hasService: 0 }))).toBe('0.00'))
  it('sin el vendor → $0', () => expect(currentAmount('15', inputs({ hasVendor: 0 }))).toBe('0.00'))
})

describe('changeReasons (R4)', () => {
  it('cambió el piecework del servicio', () => {
    const r = changeReasons(stored(), { piecework: '20', idDealer: 10, workDate: '2026-10-05', inputs: inputs({ servicePiecework: '40' }) }, '20.00')
    expect(r).toEqual([{ code: PIECEWORK_REASON.servicePiecework, from: '30.00', to: '40.00' }])
  })

  it('sumaron un empleado a la WO: el piecework se reparte', () => {
    const r = changeReasons(stored(), { piecework: '10', idDealer: 10, workDate: '2026-10-05', inputs: inputs({ employeeCount: 3 }) }, '10.00')
    expect(r).toEqual([{ code: PIECEWORK_REASON.employeeCount, from: '2', to: '3' }])
  })

  it('WO eliminada y vuelta a activar', () => {
    const deleted = changeReasons(stored(), { piecework: '15', idDealer: 10, workDate: '2026-10-05', inputs: inputs({ woEstado: 0 }) }, '0.00')
    expect(codes(deleted)).toEqual([PIECEWORK_REASON.woDeleted])
    const back = changeReasons(
      stored({ amount: '0.00', inputs: inputs({ woEstado: 0 }) }),
      { piecework: '15', idDealer: 10, workDate: '2026-10-05', inputs: inputs() },
      '15.00',
    )
    expect(codes(back)).toEqual([PIECEWORK_REASON.woActiveAgain])
  })

  it('nada de lo guardado lo explica → calc, nunca otro motivo', () => {
    const r = changeReasons(stored(), { piecework: '18', idDealer: 10, workDate: '2026-10-05', inputs: inputs() }, '18.00')
    expect(codes(r)).toEqual([PIECEWORK_REASON.calc])
  })

  it('fila de T5 sin revisar (checked_at NULL) que cambia de monto → calc', () => {
    const r = changeReasons(
      stored({ checkedAt: null, inputs: inputs({ servicePiecework: null, employeeCount: null }) }),
      { piecework: '18', idDealer: 10, workDate: '2026-10-05', inputs: inputs() },
      '18.00',
    )
    expect(codes(r)).toEqual([PIECEWORK_REASON.calc])
  })

  it('fila de T5 sin revisar con el mismo monto → sin motivo (no deja histórico)', () => {
    const r = changeReasons(
      stored({ checkedAt: null, inputs: inputs({ servicePiecework: null }) }),
      { piecework: '15', idDealer: 10, workDate: '2026-10-05', inputs: inputs() },
      '15.00',
    )
    expect(r).toEqual([])
  })

  it('cambió el dealer y la fecha, mismo monto', () => {
    const r = changeReasons(stored(), { piecework: '15', idDealer: 11, workDate: '2026-10-07', inputs: inputs() }, '15.00')
    expect(r).toEqual([{ code: PIECEWORK_REASON.dealer }, { code: PIECEWORK_REASON.date, from: '2026-10-05', to: '2026-10-07' }])
  })

  it('cambió el dealer y el cálculo: calc va primero', () => {
    const r = changeReasons(stored(), { piecework: '18', idDealer: 11, workDate: '2026-10-05', inputs: inputs() }, '18.00')
    expect(codes(r)).toEqual([PIECEWORK_REASON.calc, PIECEWORK_REASON.dealer])
  })
})

describe('encodeReasons', () => {
  it('code y code:antes>después separados por |', () => {
    expect(encodeReasons([{ code: 'wo_deleted' }, { code: 'employee_count', from: '2', to: '3' }])).toBe('wo_deleted|employee_count:2>3')
  })
})

describe('decideRow (R2 de los ciclos 1 y 2, D20)', () => {
  const window = { from: '2026-06-20', to: '2026-11-20' }
  const juneA = { desde: '2026-05-31', hasta: '2026-06-15' } // congelado
  const juneB = { desde: '2026-06-16', hasta: '2026-06-30' } // vivo
  const julyA = { desde: '2026-07-01', hasta: '2026-07-15' }
  const june = [juneA, juneB]

  it('mismo pay period vivo → update', () => expect(decideRow(juneB, juneB, june, window)).toEqual({ kind: 'update' }))
  it('origen congelado → keep, aunque el destino esté vivo', () => expect(decideRow(juneA, juneB, june, window)).toEqual({ kind: 'keep' }))
  it('origen vivo, destino congelado de la misma expense → $0 en el origen', () =>
    expect(decideRow(juneB, juneA, june, window)).toEqual({ kind: 'zero_in_origin' }))
  it('destino fuera de los pay periods de la expense → release (D20)', () =>
    expect(decideRow(juneB, julyA, june, window)).toEqual({ kind: 'release' }))
  it('sin pay period de destino → release', () => expect(decideRow(juneB, null, june, window)).toEqual({ kind: 'release' }))
})

describe('amountsByExpenseRow', () => {
  it('suma por fila de EXP_EXPENSE', () => {
    const m = amountsByExpenseRow([
      { idExpense: 1, amount: '10.10' },
      { idExpense: 1, amount: '0.20' },
      { idExpense: 2, amount: '5' },
    ])
    expect([...m.entries()]).toEqual([
      [1, '10.30'],
      [2, '5.00'],
    ])
  })
})
