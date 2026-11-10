import { billableLines, groupIncomeServices, type IncomeCar, type IncomeServiceLine } from './income-services-math'

/** Agrupado de Income by Dealer por servicio (plans/plan-income-by-dealer-por-servicio T2 y T6). */
const car = (vin: string, make = 'BMW', model = 'X5', year: number | null = 2025): IncomeCar => ({ vin, make, model, year })
const cars = new Map<number, IncomeCar>([
  [1, car('VIN1')],
  [2, car('VIN2')],
  [3, car('VIN1')], // otro registro de CAR con el mismo VIN
])
const names = new Map([
  [10, 'Dealer A'],
  [20, 'Dealer B'],
])
const wo = (dealerId: number, service: string, amount: number, idCar: number, qty = 1): IncomeServiceLine => ({
  dealerId,
  kind: 'wo',
  service,
  qty,
  amount,
  idCar,
})

describe('billableLines', () => {
  it('saca las líneas en $0 y deja los créditos', () => {
    const lines = [wo(10, 'Delivery', 0, 1), wo(10, 'Delivery', 0.004, 1), wo(10, 'Credit', -50, 1), wo(10, 'Tint', 75, 2)]
    expect(billableLines(lines).map((l) => l.service)).toEqual(['Credit', 'Tint'])
  })
})

describe('groupIncomeServices', () => {
  it('un auto con dos servicios cuenta 1 en Vehicles y 2 en Qty', () => {
    const y = groupIncomeServices([wo(10, 'Tint', 100, 1), wo(10, 'Detail', 50, 1)], cars, names, false)
    const d = y.dealers[0]
    expect(d.wo.qty).toBe(2)
    expect(d.wo.vehicles).toBe(1)
    expect(d.wo.services.map((s) => [s.service, s.qty, s.vehicles, s.income])).toEqual([
      ['Tint', 1, 1, 100],
      ['Detail', 1, 1, 50],
    ])
    expect(d.income).toBe(150)
  })

  it('el mismo VIN en dos dealers cuenta 1 en el total del año y 1 en cada dealer', () => {
    const y = groupIncomeServices([wo(10, 'Tint', 100, 1), wo(20, 'Tint', 80, 3)], cars, names, false)
    expect(y.vehicles).toBe(1)
    expect(y.woQty).toBe(2)
    expect(y.dealers.map((d) => [d.dealer, d.wo.vehicles])).toEqual([
      ['Dealer A', 1],
      ['Dealer B', 1],
    ])
  })

  it('una línea en $0 no entra; un crédito sí', () => {
    const y = groupIncomeServices([wo(10, 'Tint', 100, 1), wo(10, 'Delivery', 0, 2), wo(10, 'Credit', -20, 2)], cars, names, false)
    const d = y.dealers[0]
    expect(d.wo.services.map((s) => s.service)).toEqual(['Tint', 'Credit'])
    expect(d.wo.qty).toBe(2)
    expect(d.wo.vehicles).toBe(2)
    expect(d.income).toBe(80)
  })

  it('Generic con Qty 1.5 suma 1.5 y no se mezcla con la Qty de WO; las ponchadas van sin Qty', () => {
    const lines: IncomeServiceLine[] = [
      wo(10, 'Tint', 100, 1, 2),
      { dealerId: 10, kind: 'genericFree', service: 'Detail hours', qty: 1.5, amount: 30 },
      { dealerId: 10, kind: 'genericFree', service: 'Detail hours', qty: 0.1, amount: 2 },
      { dealerId: 10, kind: 'genericPunch', service: 'John Doe', qty: 1, amount: 40 },
      { dealerId: 10, kind: 'ttk', service: 'Ann Roe', qty: 1, amount: 60 },
    ]
    const y = groupIncomeServices(lines, cars, names, false)
    const d = y.dealers[0]
    expect(d.wo.qty).toBe(2)
    expect(d.generic.lines).toEqual([
      { description: 'John Doe', qty: null, income: 40 },
      { description: 'Detail hours', qty: 1.6, income: 32 },
    ])
    expect(d.generic.income).toBe(72)
    expect(d.ttk).toEqual({ income: 60, lines: [{ employee: 'Ann Roe', income: 60 }] })
    expect(d.income).toBe(232)
    expect(y.woQty).toBe(2)
    expect(y.woIncome).toBe(100)
    expect(y.otherIncome).toBe(132)
    expect(y.income).toBe(232)
  })

  it('suma en centavos: 0.1 + 0.2 da 0.3 exacto', () => {
    const y = groupIncomeServices([wo(10, 'A', 0.1, 1), wo(10, 'A', 0.2, 2)], cars, names, false)
    expect(y.dealers[0].income).toBe(0.3)
  })

  it('ordena dealers y servicios por Income de mayor a menor y después por nombre', () => {
    const y = groupIncomeServices(
      [wo(20, 'B', 50, 1), wo(20, 'A', 50, 2), wo(10, 'C', 100, 1)],
      cars,
      new Map([
        [10, 'Zeta'],
        [20, 'Alfa'],
      ]),
      false,
    )
    expect(y.dealers.map((d) => d.dealer)).toEqual(['Alfa', 'Zeta'])
    expect(y.dealers[0].wo.services.map((s) => s.service)).toEqual(['A', 'B'])
  })

  it('sin withVehicles no manda la lista; con withVehicles un renglón por VIN y dealer', () => {
    expect(groupIncomeServices([wo(10, 'Tint', 100, 1)], cars, names, false).vehiclesList).toBeUndefined()
    const y = groupIncomeServices(
      [wo(10, 'Cilajet', 30, 1), wo(10, 'Cilajet', 30, 3), wo(10, 'NewCarDetail', 100, 1), wo(10, 'Tint', 80, 2)],
      cars,
      names,
      true,
    )
    expect(y.vehiclesList).toEqual([
      {
        dealerId: 10,
        dealer: 'Dealer A',
        vin: 'VIN1',
        make: 'BMW',
        model: 'X5',
        carYear: 2025,
        services: [
          { service: 'Cilajet', qty: 2 },
          { service: 'NewCarDetail', qty: 1 },
        ],
        qty: 3,
        income: 160,
      },
      {
        dealerId: 10,
        dealer: 'Dealer A',
        vin: 'VIN2',
        make: 'BMW',
        model: 'X5',
        carYear: 2025,
        services: [{ service: 'Tint', qty: 1 }],
        qty: 1,
        income: 80,
      },
    ])
  })
})
