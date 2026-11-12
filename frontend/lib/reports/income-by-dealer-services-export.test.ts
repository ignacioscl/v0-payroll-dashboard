/**
 * «By dealer and service» del Export de Income by Dealer (plans/plan-income-by-dealer-por-servicio T4 y T6). Corre con
 * `pnpm vitest run`.
 */
import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'

import type { IncomeByDealer, IncomeServicesByDealer, IncomeServicesDealer, KpiQueryParams } from '@/lib/srs-kpis-api'
import {
  buildIncomeServicesWorkbook,
  collectIncomeServices,
  vehicleServicesText,
  type IncomeServicesExportLabels,
} from './income-by-dealer-services-export'

const dealer = (dealerId: number, name: string, income: number, wo = income): IncomeServicesDealer => ({
  dealerId,
  dealer: name,
  income,
  wo: { qty: 3, vehicles: 2, income: wo, services: [{ service: 'Tint', qty: 3, vehicles: 2, income: wo }] },
  generic: { income: income - wo, lines: income - wo ? [{ description: 'Hours', qty: 1.5, income: income - wo }] : [] },
  ttk: { income: 0, lines: [] },
})

const screen: IncomeByDealer = {
  years: [
    {
      year: 2026,
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-10-31',
      partial: true,
      total: 300.1,
      dealers: [
        { dealerId: 10, dealer: 'Alfa', wo: 0, ttk: 0, generic: 0, notInvoiced: 0, income: 200.1 },
        { dealerId: 20, dealer: 'Beta', wo: 0, ttk: 0, generic: 0, notInvoiced: 0, income: 100 },
      ],
    },
  ],
  grandTotal: 300.1,
}

function fakeFetch(incomes: Record<number, number>) {
  return vi.fn(async (p: KpiQueryParams): Promise<IncomeServicesByDealer> => {
    const id = Number(p.idDealer)
    return {
      years: [
        {
          year: 2026,
          fechaDesde: p.fechaDesde,
          fechaHasta: p.fechaHasta,
          partial: true,
          woQty: 3,
          vehicles: 2,
          woIncome: 0,
          otherIncome: 0,
          income: incomes[id],
          dealers: [dealer(id, `name ${id}`, incomes[id], 100)],
          vehiclesList: [
            { dealerId: id, dealer: '', vin: 'SHARED', make: 'BMW', model: 'X5', carYear: 2025, services: [{ service: 'Tint', qty: 2 }], qty: 2, income: 60 },
            { dealerId: id, dealer: '', vin: `OWN${id}`, make: 'BMW', model: 'X3', carYear: null, services: [{ service: 'Tint', qty: 1 }], qty: 1, income: 40 },
          ],
        },
      ],
    }
  })
}

describe('collectIncomeServices', () => {
  it('pide un dealer y un año por vez, con withVehicles y sin includeRemovedDealers', async () => {
    const fetchOne = fakeFetch({ 10: 200.1, 20: 100 })
    await collectIncomeServices(screen, { filterDateDone: true }, fetchOne)
    expect(fetchOne.mock.calls.map(([p]) => p)).toEqual([
      { fechaDesde: '2026-01-01', fechaHasta: '2026-10-31', idDealer: '10', filterDateDone: true, withVehicles: true },
      { fechaDesde: '2026-01-01', fechaHasta: '2026-10-31', idDealer: '20', filterDateDone: true, withVehicles: true },
    ])
  })

  it('Vehicles del año = VIN distintos de la unión: el auto que pasó por los dos dealers cuenta una vez', async () => {
    const [y] = await collectIncomeServices(screen, { filterDateDone: false }, fakeFetch({ 10: 200.1, 20: 100 }))
    expect(y.vehicles).toBe(3)
    expect(y.dealers.map((d) => d.dealer)).toEqual(['Alfa', 'Beta'])
    expect(y.income).toBe(300.1)
    expect(y.woIncome).toBe(200)
    expect(y.otherIncome).toBe(100.1)
  })

  it('si un dealer no da al centavo lo de la pantalla, no arma el archivo', async () => {
    await expect(collectIncomeServices(screen, { filterDateDone: false }, fakeFetch({ 10: 200.11, 20: 100 }))).rejects.toThrow(
      /Alfa \(10\)/,
    )
  })
})

describe('buildIncomeServicesWorkbook', () => {
  const labels: IncomeServicesExportLabels = {
    fileName: 'income-by-dealer-and-service',
    reportInfoSheet: 'Report Info',
    summarySheet: 'Summary',
    vehiclesSheet: 'Vehicles',
    title: 'Income by Dealer and Service',
    field: 'Field',
    value: 'Value',
    generated: 'Generated',
    dealer: 'Dealer',
    total: 'Total',
    grandTotal: 'Grand Total',
    removedSuffix: '(removed)',
    includesRemovedDealers: 'Includes removed dealers',
    sectionWo: 'Work Orders',
    sectionGeneric: 'Generic invoices',
    sectionTtk: 'TTK invoices',
    service: 'Service',
    description: 'Description',
    employee: 'Employee',
    qty: 'Qty',
    vehicles: 'Vehicles',
    income: 'Income',
    totalWo: 'Total Work Orders',
    totalGeneric: 'Total Generic invoices',
    totalTtk: 'Total TTK invoices',
    totalDealer: (d) => `Total ${d}`,
    woQty: 'WO Qty',
    woIncome: 'WO Income',
    otherIncome: 'Generic / TTK Income',
    period: 'Period',
    vin: 'VIN',
    make: 'Make',
    model: 'Model',
    carYear: 'Year',
    services: 'Services',
    yearLabel: (y) => `${y.year} YTD`,
    yearRange: () => '01/01/2026 – 10/31/2026',
  }

  it('hojas Report Info, Summary, el año y Vehicles; Grand Total sin Qty ni Vehicles', async () => {
    const years = await collectIncomeServices(screen, { filterDateDone: false }, fakeFetch({ 10: 200.1, 20: 100 }))
    const wb = buildIncomeServicesWorkbook(ExcelJS, {
      years,
      labels,
      reportInfo: [{ field: 'Vehicles', value: 'Different vehicles (VIN).' }],
      generatedBy: 'Test',
      removedIds: new Set([20]),
      removedNames: ['Beta'],
    })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', '2026 YTD', 'Vehicles'])

    const sum = wb.getWorksheet('Summary')!
    const rows: unknown[][] = []
    sum.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
    expect(rows.find((r) => r[0] === 'Alfa')).toEqual(['Alfa', 3, 2, 100, 100.1, 200.1])
    expect(rows.find((r) => r[0] === 'Beta (removed)')).toBeTruthy()
    expect(rows.find((r) => r[0] === 'Total 2026 YTD')).toEqual(['Total 2026 YTD', 6, 3, 200, 100.1, 300.1])
    expect(rows.find((r) => r[0] === 'Grand Total')).toEqual(['Grand Total', '', '', 200, 100.1, 300.1])
    expect(rows.some((r) => r[0] === 'Includes removed dealers: Beta')).toBe(true)

    const vh = wb.getWorksheet('Vehicles')!
    const vRows: unknown[][] = []
    vh.eachRow((row) => vRows.push((row.values as unknown[]).slice(1)))
    const header = vRows.findIndex((r) => r[0] === 'Period')
    expect(vRows[header]).toEqual(['Period', 'Dealer', 'VIN', 'Make', 'Model', 'Year', 'Services', 'Qty', 'Income'])
    vRows.splice(0, header + 1)
    expect(vRows).toHaveLength(4)
    expect(vRows[0]).toEqual(['2026 YTD', 'Alfa', 'SHARED', 'BMW', 'X5', 2025, 'Tint ×2', 2, 60])
    // Qty entera sin punto al final («2.» con el formato 0.##): el mismo formato que las demás hojas.
    expect(vh.getCell(header + 2, 8).numFmt).toBe('#,##0')
  })

  it('servicios del auto con su cantidad', () => {
    expect(vehicleServicesText([{ service: 'NewCarDetail', qty: 1 }, { service: 'Cilajet', qty: 2 }])).toBe('NewCarDetail, Cilajet ×2')
  })
})
