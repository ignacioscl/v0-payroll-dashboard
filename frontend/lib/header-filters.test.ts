/**
 * La tabla de filtros de la barra da, para cada pantalla, lo mismo que decidía `header.tsx` con sus `pathname ===`
 * antes de la etapa 4 (plans/plan-buenas-practicas-v0, 4.7, P8).
 */
import { describe, expect, it } from 'vitest'

import { getHeaderFilters } from './header-filters'

describe('getHeaderFilters', () => {
  it('Invoices: buscador, distrito y período de la factura', () => {
    expect(getHeaderFilters('/billing/invoices')).toEqual({ search: true, district: true, date: 'invoice' })
  })
  it('Roles y Role Templates: sin fecha', () => {
    expect(getHeaderFilters('/roles').date).toBeNull()
    expect(getHeaderFilters('/roles/templates').date).toBeNull()
  })
  it('Expenses (todas): sin buscador de empleado, con rango', () => {
    for (const p of ['/expenses', '/expenses/analytics', '/expenses/recurring', '/expenses/settings']) {
      expect(getHeaderFilters(p), p).toEqual({ search: false, district: false, date: 'range' })
    }
  })
  it('Punch Report: rango con tope de 1 año', () => {
    expect(getHeaderFilters('/issues')).toEqual({ search: true, district: false, date: 'range', maxRangeYears: 1 })
  })
  it('Income by Dealer: año; los dos Closing: mes', () => {
    expect(getHeaderFilters('/reports/income-by-dealer').date).toBe('year')
    expect(getHeaderFilters('/reports/monthly-closing').date).toBe('month')
    expect(getHeaderFilters('/reports/window-tint-closing').date).toBe('month')
  })
  it('Open Invoices: el domingo «As of» en la barra; la comparación de una foto, sin fecha', () => {
    expect(getHeaderFilters('/reports/open-invoices').date).toBe('sunday')
    expect(getHeaderFilters('/reports/open-invoices/snapshots/7').date).toBeNull()
  })
  it('el resto: buscador y rango, sin distrito ni tope', () => {
    for (const p of ['/', '/reports/business-kpis', '/reports/production-vs-goal', '/settings/system', '/components']) {
      expect(getHeaderFilters(p), p).toEqual({ search: true, district: false, date: 'range' })
    }
  })
})
