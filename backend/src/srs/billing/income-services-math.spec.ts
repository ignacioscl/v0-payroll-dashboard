import {
  billableLines,
  groupIncomeServices,
  groupServiceVehicles,
  type IncomeCar,
  type IncomeServiceLine,
} from './income-services-math'

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
    expect(d.ttk.income).toBe(60)
    expect(d.ttk.lines).toEqual([{ employee: 'Ann Roe', income: 60 }])
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

/** TTK por factura (plans/plan-income-by-dealer-ttk-y-autos T2 y T7). */
describe('groupIncomeServices — TTK por factura', () => {
  const ttk = (nro: string, dateFrom: string, employee: string, amount: number): IncomeServiceLine => ({
    dealerId: 10,
    kind: 'ttk',
    service: employee,
    qty: 1,
    amount,
    nro,
    dateFrom,
    dateTo: dateFrom.replace(/-(\d\d)$/, (_, d) => `-${String(Number(d) + 6).padStart(2, '0')}`),
  })

  it('el mismo empleado en dos facturas sale en cada una; lines por empleado sigue sumado como antes', () => {
    const y = groupIncomeServices(
      [ttk('B2', '2026-10-12', 'Ann Roe', 100), ttk('A1', '2026-10-05', 'Ann Roe', 40), ttk('A1', '2026-10-05', 'Bob Poe', 60)],
      cars,
      names,
      false,
    )
    const t = y.dealers[0].ttk
    expect(t.income).toBe(200)
    expect(t.lines).toEqual([
      { employee: 'Ann Roe', income: 140 },
      { employee: 'Bob Poe', income: 60 },
    ])
    expect(t.invoices).toEqual([
      {
        nro: 'A1',
        dateFrom: '2026-10-05',
        dateTo: '2026-10-11',
        income: 100,
        employees: [
          { employee: 'Bob Poe', income: 60 },
          { employee: 'Ann Roe', income: 40 },
        ],
      },
      { nro: 'B2', dateFrom: '2026-10-12', dateTo: '2026-10-18', income: 100, employees: [{ employee: 'Ann Roe', income: 100 }] },
    ])
  })

  it('las facturas suman el Income TTK al centavo y van por período y después por número (D3)', () => {
    const y = groupIncomeServices(
      [ttk('Z9', '2026-10-05', 'A', 0.1), ttk('A1', '2026-10-05', 'B', 0.2), ttk('M5', '2026-09-28', 'C', 0.3)],
      cars,
      names,
      false,
    )
    const t = y.dealers[0].ttk
    expect(t.invoices.map((i) => i.nro)).toEqual(['M5', 'A1', 'Z9'])
    const cents = t.invoices.reduce((a, i) => a + Math.round(i.income * 100), 0)
    expect(cents).toBe(Math.round(t.income * 100))
    expect(t.income).toBe(0.6)
  })

  it('sin TTK, invoices vacío', () => {
    expect(groupIncomeServices([wo(10, 'Tint', 100, 1)], cars, names, false).dealers[0].ttk.invoices).toEqual([])
  })
})

/** Los autos de un servicio (plans/plan-income-by-dealer-ttk-y-autos T3 y T7). */
describe('groupServiceVehicles', () => {
  const woN = (service: string, amount: number, idCar: number, nro: string, qty = 1): IncomeServiceLine => ({
    ...wo(10, service, amount, idCar, qty),
    nro,
  })

  it('un auto con dos WO del servicio es un renglón con las dos WO y Qty 2; otro servicio y $0 no entran', () => {
    const lines = [
      woN('Full Detail', 99, 1, 'W2'),
      woN('Full Detail', 99, 3, 'W1'), // otro registro de CAR con el mismo VIN
      woN('Full Detail', 99, 2, 'W3'),
      woN('Full Detail', 0, 2, 'W4'),
      woN('PDI', 80, 1, 'W5'),
    ]
    const v = groupServiceVehicles(lines, cars, 'Full Detail')
    expect(v.rows).toEqual([
      { vin: 'VIN1', make: 'BMW', model: 'X5', carYear: 2025, wos: ['W1', 'W2'], qty: 2, income: 198 },
      { vin: 'VIN2', make: 'BMW', model: 'X5', carYear: 2025, wos: ['W3'], qty: 1, income: 99 },
    ])
    expect(v.vehicles).toBe(2)
    expect(v.qty).toBe(3)
    expect(v.income).toBe(297)
  })

  it('«Others» y «Others » son un solo servicio, y sus autos se piden por el nombre recortado (la API recorta todo)', () => {
    const lines = [woN('Others', 150, 1, 'W1'), woN('Others ', 25, 2, 'W2'), woN('PDI', 80, 1, 'W3')]
    const services = groupIncomeServices(lines, cars, names, false).dealers[0].wo.services
    expect(services.map((s) => s.service)).toEqual(['Others', 'PDI'])
    expect(services[0]).toEqual({ service: 'Others', qty: 2, vehicles: 2, income: 175 })
    const v = groupServiceVehicles(lines, cars, 'Others')
    expect([v.vehicles, v.qty, v.income]).toEqual([2, 2, 175])
  })

  it('cuadra con la fila del servicio en groupIncomeServices (Qty, Vehicles e Income)', () => {
    const lines = [
      woN('Full Detail', 99, 1, 'W1'),
      woN('Full Detail', 49.5, 2, 'W2', 0.5),
      woN('Full Detail', -10, 2, 'W3'),
      { ...woN('PDI', 80, 1, 'W4'), kind: 'woUnbilled' as const },
      { ...woN('Full Detail', 99, 1, 'W6'), kind: 'woUnbilled' as const },
    ]
    const row = groupIncomeServices(lines, cars, names, false).dealers[0].wo.services.find((s) => s.service === 'Full Detail')!
    const v = groupServiceVehicles(lines, cars, 'Full Detail')
    expect([v.qty, v.vehicles, v.income]).toEqual([row.qty, row.vehicles, row.income])
    expect(v.rows.length).toBe(row.vehicles)
    expect(v.rows.reduce((a, r) => a + Math.round(r.income * 100), 0)).toBe(Math.round(row.income * 100))
  })

  it('un servicio sin nombre se pide como cadena vacía', () => {
    const v = groupServiceVehicles([woN('', 10, 1, 'W1'), woN('Tint', 5, 2, 'W2')], cars, '')
    expect(v.rows.map((r) => r.vin)).toEqual(['VIN1'])
  })
})
