import { describe, expect, it } from 'vitest'

import { en } from '@/lib/i18n/messages/en'
import { es } from '@/lib/i18n/messages/es'
import { PIECEWORK_REASON_CODES, decodeReasons, reasonTexts } from './expense-piecework-history'

/** Traductor de prueba sobre el catálogo en inglés (misma interpolación `{x}` que el de la app). */
const t = (key: string, params?: Record<string, string | number>) => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string
  return value.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? `{${k}}`))
}

describe('histórico de la expense Piecework (T5b): el motivo en texto', () => {
  it('lee `code` y `code:antes>después` separados por |', () => {
    expect(decodeReasons('wo_deleted|employee_count:1>2', 'wo_deleted')).toEqual([
      { code: 'wo_deleted' },
      { code: 'employee_count', from: '1', to: '2' },
    ])
  })

  it('sin detail usa el reason; un código desconocido se descarta', () => {
    expect(decodeReasons(null, 'calc')).toEqual([{ code: 'calc' }])
    expect(decodeReasons('nuevo_codigo|dealer', 'dealer')).toEqual([{ code: 'dealer' }])
  })

  it('montos con $ y fechas de EE.UU.', () => {
    expect(reasonTexts('service_piecework:105.00>155.00', 'service_piecework', t)).toEqual([
      'The piecework of the service changed: $105.00 → $155.00',
    ])
    expect(reasonTexts('moved_out:2026-10-19>2026-11-05', 'moved_out', t)).toEqual([
      'The WO moved to 11/05/2026, outside the pay periods of the expense: it left the expense',
    ])
    expect(reasonTexts('employee_count:1>2', 'employee_count', t)).toEqual(['Employees in the WO: 1 → 2 (the piecework is split)'])
  })

  it('cada código del back tiene su texto en inglés y en castellano', () => {
    for (const code of PIECEWORK_REASON_CODES) {
      expect(en.expenses.pieceworkReasons[code]).toBeTruthy()
      expect(es.expenses.pieceworkReasons[code]).toBeTruthy()
    }
  })
})
