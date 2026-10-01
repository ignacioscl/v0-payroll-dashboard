import { balanceCents, moneyToCents, rowMoneyByKey } from './srs-kpi-row-money'

describe('moneyToCents', () => {
  it('redondea como ROUND(x, 2) de MySQL: la mitad se aleja del cero', () => {
    expect(moneyToCents('178.1250000000')).toBe(17813)
    expect(moneyToCents('296.8749999999')).toBe(29687)
    expect(moneyToCents('-178.125')).toBe(-17813)
    expect(moneyToCents('1.005')).toBe(101)
    expect(moneyToCents('0')).toBe(0)
    expect(moneyToCents(null)).toBe(0)
  })
})

describe('rowMoneyByKey', () => {
  it('KNN195: la fila de saldo es el total menos el cobro, sin el centavo de más', () => {
    // 8 WO de $95 = $760, descuento fijo $285 (factor 0.625); un cobro cubre 5 de las 8.
    const money = rowMoneyByKey([
      { stmtId: 377628, rowKind: 3, rowIdBilling: 23162, rowNroBilled: 1, rowSubtotal: '475.00', rowTotal: '296.875000' },
      { stmtId: 377628, rowKind: 1, rowIdBilling: null, rowNroBilled: null, rowSubtotal: '285.00', rowTotal: '178.125000' },
    ])
    expect(money.get('377628|3|23162|1')).toEqual({ subtotal: 47500, total: 29688 })
    expect(money.get('377628|1||')).toEqual({ subtotal: 28500, total: 17812 })
    expect(balanceCents(money, 377628)).toBe(17812)
  })

  it('dos filas del mismo cheque se separan por nro_billed (TW641, cobro 2871)', () => {
    const money = rowMoneyByKey([
      { stmtId: 36348, rowKind: 3, rowIdBilling: 2871, rowNroBilled: 3, rowSubtotal: '100', rowTotal: '100' },
      { stmtId: 36348, rowKind: 3, rowIdBilling: 2871, rowNroBilled: 5, rowSubtotal: '900', rowTotal: '900' },
    ])
    expect(money.get('36348|3|2871|3')?.total).toBe(10000)
    expect(money.get('36348|3|2871|5')?.total).toBe(90000)
    expect(balanceCents(money, 36348)).toBe(0)
  })

  it('suma las partes de una misma fila (líneas libres y ponchadas de una generic)', () => {
    const money = rowMoneyByKey([
      { stmtId: 1, rowKind: 1, rowIdBilling: null, rowNroBilled: null, rowSubtotal: '10.004', rowTotal: '10.004' },
      { stmtId: 1, rowKind: 1, rowIdBilling: null, rowNroBilled: null, rowSubtotal: '10.004', rowTotal: '10.004' },
    ])
    // 20.008 redondea una sola vez: 20.01, no 10.00 + 10.00.
    expect(money.get('1|1||')).toEqual({ subtotal: 2001, total: 2001 })
  })

  it('una nota de crédito resta y no se pisa a cero', () => {
    const money = rowMoneyByKey([
      { stmtId: 547373, rowKind: 1, rowIdBilling: null, rowNroBilled: null, rowSubtotal: '-100.00', rowTotal: '-100.00' },
    ])
    expect(balanceCents(money, 547373)).toBe(-10000)
  })

  it('una invoice sin líneas impagas no tiene saldo', () => {
    const money = rowMoneyByKey([
      { stmtId: 7, rowKind: 2, rowIdBilling: 9, rowNroBilled: null, rowSubtotal: '50', rowTotal: '50' },
    ])
    expect(money.has('7|1||')).toBe(false)
    expect(balanceCents(money, 7)).toBe(0)
  })
})
