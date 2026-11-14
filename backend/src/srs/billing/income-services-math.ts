/**
 * Income by Dealer por servicio (plans/plan-income-by-dealer-por-servicio/PLAN.md §5.1 y T2): las líneas del
 * Closing de un año (incomeLinesForRange con withCar) agrupadas por dealer, en centavos enteros. Es el mismo
 * agrupado del Excel que aprobó GC (plans/plan-excel-gc-por-servicio/scripts/excel-gc.ts), salvo las ponchadas de
 * una genérica, que van con la Qty vacía.
 */
import type { ClosingLineKind } from '../shared/kpi/srs-kpi-billed-lines'
import { fromCents, toCents } from '../shared/kpi/srs-kpi-cents'
import type {
  IncomeServicesDealerDto,
  IncomeServicesYearDto,
  IncomeServiceVehiclesBodyDto,
  IncomeVehicleRowDto,
} from './dto/billing-kpi.dto'

export interface IncomeServiceLine {
  dealerId: number
  kind: ClosingLineKind
  service: string
  qty: number
  amount: number
  idCar?: number
  /** Number of the TTK invoice (or of the WO, in WO lines). Comes in ClosingLineDto. */
  nro?: string
  /** Period of the TTK invoice (YYYY-MM-DD). */
  dateFrom?: string
  dateTo?: string
}

export interface IncomeCar {
  vin: string
  make: string
  model: string
  year: number | null
}

export type IncomeServicesYearBody = Omit<IncomeServicesYearDto, 'year' | 'fechaDesde' | 'fechaHasta' | 'partial'>

const isWoLine = (kind: ClosingLineKind) => kind === 'wo' || kind === 'woUnbilled'

/**
 * Las líneas que cuentan: las de $0 no son facturación (p. ej. «Delivery» en $0 de una WO sin facturar) y no entran
 * ni en Qty ni en Vehicles; los créditos (negativos) sí.
 */
export function billableLines<L extends { amount: number }>(lines: L[]): L[] {
  return lines.filter((l) => toCents(l.amount) !== 0)
}

type Sum = { cents: number; qtyHundredths: number }
type WoSum = Sum & { vins: Set<string> }
type VehicleSum = Sum & { idCar: number; services: Map<string, number> }
type TtkInvoiceAcc = { nro: string; dateFrom: string; dateTo: string; cents: number; employees: Map<string, number> }
type DealerAcc = {
  dealerId: number
  cents: number
  wo: WoSum
  services: Map<string, WoSum>
  genCents: number
  gen: Map<string, Sum & { description: string; punch: boolean }>
  ttkCents: number
  ttk: Map<string, number>
  /** TTK by invoice (plans/plan-income-by-dealer-ttk-y-autos §5.1). The number does not repeat inside a dealer. */
  ttkInvoices: Map<string, TtkInvoiceAcc>
  vehicles: Map<string, VehicleSum>
}

/** The name a line is grouped and searched by: the same the screen gets after TrimResponseInterceptor. */
export const serviceName = (s: string): string => s.trim()

const byIncomeThenName =<T>(cents: (x: T) => number, name: (x: T) => string) => (a: T, b: T) =>
  cents(b) - cents(a) || name(a).localeCompare(name(b))

export function groupIncomeServices(
  lines: IncomeServiceLine[],
  cars: Map<number, IncomeCar>,
  dealerNames: Map<number, string>,
  withVehicles: boolean,
): IncomeServicesYearBody {
  const dealers = new Map<number, DealerAcc>()
  const yearVins = new Set<string>()
  let woQtyHundredths = 0
  let woCents = 0
  let otherCents = 0

  for (const raw of billableLines(lines)) {
    // The API trims every string it answers (TrimResponseInterceptor): «Others» and «Others » are one name on screen,
    // so they are one row here too, and the vehicles of that row are asked by the trimmed name.
    const l = { ...raw, service: serviceName(raw.service) }
    const cents = toCents(l.amount)
    const qtyHundredths = toCents(l.qty)
    let d = dealers.get(l.dealerId)
    if (!d) {
      d = {
        dealerId: l.dealerId,
        cents: 0,
        wo: { cents: 0, qtyHundredths: 0, vins: new Set() },
        services: new Map(),
        genCents: 0,
        gen: new Map(),
        ttkCents: 0,
        ttk: new Map(),
        ttkInvoices: new Map(),
        vehicles: new Map(),
      }
      dealers.set(l.dealerId, d)
    }
    d.cents += cents

    if (isWoLine(l.kind)) {
      const vin = l.idCar != null ? cars.get(l.idCar)?.vin || null : null
      woCents += cents
      woQtyHundredths += qtyHundredths
      d.wo.cents += cents
      d.wo.qtyHundredths += qtyHundredths
      let s = d.services.get(l.service)
      if (!s) {
        s = { cents: 0, qtyHundredths: 0, vins: new Set() }
        d.services.set(l.service, s)
      }
      s.cents += cents
      s.qtyHundredths += qtyHundredths
      if (vin) {
        yearVins.add(vin)
        d.wo.vins.add(vin)
        s.vins.add(vin)
        if (withVehicles) {
          let v = d.vehicles.get(vin)
          if (!v) {
            v = { idCar: l.idCar!, cents: 0, qtyHundredths: 0, services: new Map() }
            d.vehicles.set(vin, v)
          }
          v.cents += cents
          v.qtyHundredths += qtyHundredths
          v.services.set(l.service, (v.services.get(l.service) ?? 0) + qtyHundredths)
        }
      }
      continue
    }

    otherCents += cents
    if (l.kind === 'ttk') {
      d.ttkCents += cents
      d.ttk.set(l.service, (d.ttk.get(l.service) ?? 0) + cents)
      const nro = l.nro ?? ''
      let inv = d.ttkInvoices.get(nro)
      if (!inv) {
        inv = { nro, dateFrom: l.dateFrom ?? '', dateTo: l.dateTo ?? '', cents: 0, employees: new Map() }
        d.ttkInvoices.set(nro, inv)
      }
      inv.cents += cents
      inv.employees.set(l.service, (inv.employees.get(l.service) ?? 0) + cents)
      continue
    }
    // genericFree / genericPunch. Las ponchadas vienen con Qty fija 1: contarían ponchadas, no lo escrito en la invoice.
    const punch = l.kind === 'genericPunch'
    const key = `${punch ? 'p' : 'f'}|${l.service}`
    let g = d.gen.get(key)
    if (!g) {
      g = { description: l.service, punch, cents: 0, qtyHundredths: 0 }
      d.gen.set(key, g)
    }
    d.genCents += cents
    g.cents += cents
    g.qtyHundredths += qtyHundredths
  }

  const name = (id: number) => dealerNames.get(id) ?? ''
  const sorted = [...dealers.values()].sort(byIncomeThenName((d) => d.cents, (d) => name(d.dealerId)))

  const out: IncomeServicesDealerDto[] = sorted.map((d) => ({
    dealerId: d.dealerId,
    dealer: name(d.dealerId),
    income: fromCents(d.cents),
    wo: {
      qty: fromCents(d.wo.qtyHundredths),
      vehicles: d.wo.vins.size,
      income: fromCents(d.wo.cents),
      services: [...d.services]
        .sort(byIncomeThenName(([, s]) => s.cents, ([n]) => n))
        .map(([service, s]) => ({
          service,
          qty: fromCents(s.qtyHundredths),
          vehicles: s.vins.size,
          income: fromCents(s.cents),
        })),
    },
    generic: {
      income: fromCents(d.genCents),
      lines: [...d.gen.values()]
        .sort(byIncomeThenName((g) => g.cents, (g) => g.description))
        .map((g) => ({ description: g.description, qty: g.punch ? null : fromCents(g.qtyHundredths), income: fromCents(g.cents) })),
    },
    ttk: {
      income: fromCents(d.ttkCents),
      lines: [...d.ttk]
        .sort(byIncomeThenName(([, c]) => c, ([n]) => n))
        .map(([employee, c]) => ({ employee, income: fromCents(c) })),
      // D3: by period, oldest first, then by number. Employees inside: income desc, then name (as today).
      invoices: [...d.ttkInvoices.values()]
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom) || a.nro.localeCompare(b.nro))
        .map((inv) => ({
          nro: inv.nro,
          dateFrom: inv.dateFrom,
          dateTo: inv.dateTo,
          income: fromCents(inv.cents),
          employees: [...inv.employees]
            .sort(byIncomeThenName(([, c]) => c, ([n]) => n))
            .map(([employee, c]) => ({ employee, income: fromCents(c) })),
        })),
    },
  }))

  const body: IncomeServicesYearBody = {
    woQty: fromCents(woQtyHundredths),
    vehicles: yearVins.size,
    woIncome: fromCents(woCents),
    otherIncome: fromCents(otherCents),
    income: fromCents(woCents + otherCents),
    dealers: out,
  }

  if (withVehicles) {
    const list: IncomeVehicleRowDto[] = []
    for (const d of sorted) {
      for (const [vin, v] of [...d.vehicles].sort((a, b) => a[0].localeCompare(b[0]))) {
        const c = cars.get(v.idCar)
        list.push({
          dealerId: d.dealerId,
          dealer: name(d.dealerId),
          vin,
          make: c?.make ?? '',
          model: c?.model ?? '',
          carYear: c?.year ?? null,
          services: [...v.services].map(([service, q]) => ({ service, qty: fromCents(q) })),
          qty: fromCents(v.qtyHundredths),
          income: fromCents(v.cents),
        })
      }
    }
    body.vehiclesList = list
  }
  return body
}

/**
 * The vehicles of one service of one dealer (plans/plan-income-by-dealer-ttk-y-autos §5.2 and T3): one row per VIN with
 * the WO lines of that service, the same lines and the same VIN key as groupIncomeServices, so rows = its Vehicles and
 * the sums of Qty and Income = its Qty and Income, to the cent. Income desc, then VIN.
 */
export function groupServiceVehicles(
  lines: IncomeServiceLine[],
  cars: Map<number, IncomeCar>,
  service: string,
): IncomeServiceVehiclesBodyDto {
  // WO # → its date: the one the report uses for the period (creation, or Done with «Filter by completion date»).
  const byVin = new Map<string, Sum & { idCar: number; wos: Map<string, string> }>()
  let cents = 0
  let qtyHundredths = 0
  service = serviceName(service)
  for (const l of billableLines(lines)) {
    if (!isWoLine(l.kind) || serviceName(l.service) !== service) continue
    const lc = toCents(l.amount)
    const lq = toCents(l.qty)
    cents += lc
    qtyHundredths += lq
    const vin = l.idCar != null ? cars.get(l.idCar)?.vin || null : null
    if (!vin) continue
    let v = byVin.get(vin)
    if (!v) {
      v = { idCar: l.idCar!, cents: 0, qtyHundredths: 0, wos: new Map() }
      byVin.set(vin, v)
    }
    v.cents += lc
    v.qtyHundredths += lq
    if (l.nro && !v.wos.has(l.nro)) v.wos.set(l.nro, l.dateFrom ?? '')
  }
  const rows = [...byVin]
    .sort((a, b) => b[1].cents - a[1].cents || a[0].localeCompare(b[0]))
    .map(([vin, v]) => {
      const c = cars.get(v.idCar)
      const wos = [...v.wos.keys()].sort()
      return {
        vin,
        make: c?.make ?? '',
        model: c?.model ?? '',
        carYear: c?.year ?? null,
        wos,
        woDates: wos.map((n) => v.wos.get(n) ?? ''),
        qty: fromCents(v.qtyHundredths),
        income: fromCents(v.cents),
      }
    })
  return { service, qty: fromCents(qtyHundredths), vehicles: rows.length, income: fromCents(cents), rows }
}
