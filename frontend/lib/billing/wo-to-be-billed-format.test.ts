import { describe, expect, it } from 'vitest'

import type { WoToBeBilledRow } from '@/lib/srs-wo-to-be-billed-api'
import { formatWoAge, woApprovedDisplay, woServicesDisplay, woUsDate, woUsDateTime } from './wo-to-be-billed-format'

const texts = { minutes: (n: number) => `${n} Minutes`, minute: '1 Minute', now: 'Now' }

describe('formatWoAge (parseDiffDate2Screen de legacy)', () => {
  it('días, horas y minutos', () => {
    expect(formatWoAge('50:05', 5, texts)).toBe('2D 2H 5M')
    expect(formatWoAge('03:00', 5, texts)).toBe('3H')
    expect(formatWoAge('130:00', 5, texts)).toBe('5D 10H')
  })
  it('solo minutos: «N Minutes» / «1 Minute»', () => {
    expect(formatWoAge('00:45', 5, texts)).toBe('45 Minutes')
    expect(formatWoAge('00:01', 5, texts)).toBe('1 Minute')
  })
  it('«Now», y vacío si la WO está Completed', () => {
    expect(formatWoAge('00:00', 5, texts)).toBe('Now')
    expect(formatWoAge('00:00', 7, texts)).toBe('')
    expect(formatWoAge(null, 5, texts)).toBe('Now')
  })
})

describe('woServicesDisplay (serviceColumnV2)', () => {
  it('sin nada facturado, ninguno en negrita', () => {
    expect(woServicesDisplay([{ nombre: 'Wash', idStatement: null }, { nombre: 'Wax', idStatement: null }])).toEqual([
      { name: 'Wash', pending: false },
      { name: 'Wax', pending: false },
    ])
  })
  it('con otro facturado, los pendientes en negrita', () => {
    expect(woServicesDisplay([{ nombre: 'Wash', idStatement: 10 }, { nombre: 'Wax', idStatement: null }])).toEqual([
      { name: 'Wash', pending: false },
      { name: 'Wax', pending: true },
    ])
  })
})

const row = (patch: Partial<WoToBeBilledRow>): WoToBeBilledRow =>
  ({
    approved: null,
    approvedDate: null,
    approverName: null,
    unapproveNote: null,
    inspected: null,
    inspectedDate: null,
    inspectorName: null,
    internalInspected: null,
    internalInspectedDate: null,
    internalInspectorName: null,
    idWorkflow: 5,
    hasFinalInspect: false,
    hasInternalInspect: false,
    ...patch,
  }) as WoToBeBilledRow

describe('woApprovedDisplay (approbeColumn)', () => {
  it('no aprobada: cruz con la nota', () => {
    expect(woApprovedDisplay(row({ approved: 0, unapproveNote: 'bad' }))).toEqual({ kind: 'notApproved', note: 'bad' })
  })
  it('aprobada sin inspección: tilde', () => {
    expect(woApprovedDisplay(row({ approved: 1, approverName: 'Ann' })).kind).toBe('approved')
  })
  it('aprobada, Completed e inspeccionada con inspección prendida: el auto con su color', () => {
    const d = woApprovedDisplay(
      row({ approved: 1, idWorkflow: 7, hasFinalInspect: true, inspected: 1, inspectorName: 'Bo' }),
    )
    expect(d).toMatchObject({ kind: 'car', color: 'green', inspector: 'Bo' })
    expect(woApprovedDisplay(row({ idWorkflow: 7, hasFinalInspect: true, inspected: 0 }))).toMatchObject({
      kind: 'car',
      color: 'red',
    })
    expect(woApprovedDisplay(row({ idWorkflow: 7, hasInternalInspect: true, internalInspected: -1 }))).toMatchObject({
      kind: 'car',
      color: 'gray',
    })
  })
  it('sin aprobación ni inspección: nada', () => {
    expect(woApprovedDisplay(row({}))).toEqual({ kind: 'none' })
  })
})

describe('woUsDate', () => {
  it('YYYY-MM-DD HH:MM:SS → MM/DD/YYYY', () => {
    expect(woUsDate('2026-11-12 19:05:00')).toBe('11/12/2026')
    expect(woUsDate(null)).toBe('')
  })
})

describe('woUsDateTime (getFechaScreen + amPm de legacy, R17)', () => {
  it('con hora: MM/DD/YYYY hh:mm AM/PM como legacy', () => {
    expect(woUsDateTime('2026-11-10 14:30:00')).toBe('11/10/2026 02:30 PM')
    expect(woUsDateTime('2026-11-10 12:05:00')).toBe('11/10/2026 12:05 PM')
    expect(woUsDateTime('2026-11-10 09:07:00')).toBe('11/10/2026 09:07 AM')
    expect(woUsDateTime('2026-11-10 00:00:00')).toBe('11/10/2026 00:00 AM')
  })
  it('sin hora o vacío', () => {
    expect(woUsDateTime('2026-11-10')).toBe('11/10/2026')
    expect(woUsDateTime(null)).toBe('')
  })
})
