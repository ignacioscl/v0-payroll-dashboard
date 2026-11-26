import { describe, expect, it } from 'vitest'

import {
  readWoHeaderMemory,
  WO_HEADER_MEMORY_KEY,
  WO_HEADER_MEMORY_MS,
  woHeaderOnEntry,
  writeWoHeaderMemory,
  type WoHeaderMemory,
} from './wo-header-memory'

const NOW = 1_800_000_000_000
const memory = (minutesAgo: number): WoHeaderMemory => ({ dealer: '897', from: '2026-11-10', to: '2026-11-12', at: NOW - minutesAgo * 60_000 })

describe('WO to be Billed — encabezado al entrar', () => {
  it('primera vez: sin dealer y sin fecha', () => {
    expect(woHeaderOnEntry([], null, NOW)).toEqual({ dealer: null, from: null, to: null })
  })

  it('venís de otra pantalla con un solo dealer: ese (aunque haya memoria de otro)', () => {
    expect(woHeaderOnEntry(['408'], memory(5), NOW)).toEqual({ dealer: '408', from: '2026-11-10', to: '2026-11-12' })
    expect(woHeaderOnEntry(['408'], null, NOW)).toEqual({ dealer: '408', from: null, to: null })
  })

  it('con varios o ningún dealer en la otra pantalla: la memoria si es de hace menos de 30 minutos', () => {
    expect(woHeaderOnEntry(['408', '897'], memory(29), NOW)).toEqual({ dealer: '897', from: '2026-11-10', to: '2026-11-12' })
    expect(woHeaderOnEntry([], memory(29), NOW)).toEqual({ dealer: '897', from: '2026-11-10', to: '2026-11-12' })
  })

  it('30 minutos o más: limpio (el dealer solo si la otra pantalla tenía uno)', () => {
    expect(woHeaderOnEntry([], memory(30), NOW)).toEqual({ dealer: null, from: null, to: null })
    expect(woHeaderOnEntry(['408', '897'], memory(90), NOW)).toEqual({ dealer: null, from: null, to: null })
    expect(woHeaderOnEntry(['408'], memory(90), NOW)).toEqual({ dealer: '408', from: null, to: null })
    expect(WO_HEADER_MEMORY_MS).toBe(30 * 60 * 1000)
  })

  it('se guarda y se lee; lo roto se ignora', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    writeWoHeaderMemory(storage, { dealer: '897', from: '2026-11-10', to: null }, NOW)
    expect(readWoHeaderMemory(storage)).toEqual({ dealer: '897', from: '2026-11-10', to: null, at: NOW })
    store.set(WO_HEADER_MEMORY_KEY, '{roto')
    expect(readWoHeaderMemory(storage)).toBeNull()
    store.set(WO_HEADER_MEMORY_KEY, JSON.stringify({ dealer: '1', from: '10/11/2026' }))
    expect(readWoHeaderMemory(storage)).toBeNull()
  })
})
