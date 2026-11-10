/**
 * Las filas abiertas de Income by Dealer piden su desglose de a uno (plans/plan-income-by-dealer-por-servicio §8): cada
 * pedido corre 4 consultas en una base con 5 conexiones para todas las empresas. Corre con `pnpm vitest run`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchIncomeByDealerServices } from './srs-kpis-api'

const params = (idDealer: string) => ({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31', idDealer })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchIncomeByDealerServices', () => {
  it('el segundo pedido sale recién cuando terminó el primero, aunque el primero falle', async () => {
    const started: string[] = []
    const release: Record<string, (r: Response) => void> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const id = /idDealer=(\d+)/.exec(url)![1]
        started.push(id)
        return new Promise<Response>((resolve) => (release[id] = resolve))
      }),
    )
    const a = fetchIncomeByDealerServices(params('1'))
    const b = fetchIncomeByDealerServices(params('2'))
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['1'])
    release['1'](new Response('boom', { status: 500 }))
    await expect(a).rejects.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['1', '2'])
    release['2'](new Response(JSON.stringify({ years: [] }), { status: 200 }))
    await expect(b).resolves.toEqual({ years: [] })
  })
})
