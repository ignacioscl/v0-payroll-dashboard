/**
 * El dealer y el rango del encabezado en WO to be Billed (pedido de Ignacio del 24/11/2026). Son de esta pantalla, no
 * los del resto:
 * - dealer de a uno; al entrar: si la otra pantalla tenía **un solo** dealer elegido, ese; si no, el que tenía esta
 *   pantalla, siempre que no hayan pasado 30 minutos o más desde la última vez; si no, ninguno;
 * - rango: el que tenía, con la misma condición de los 30 minutos; si no, vacío (como legacy: la lista trae toda la
 *   historia del dealer y para generar hay que elegir un rango).
 * Lo que se recuerda va en `localStorage`, con la hora de la última vez que se usó la pantalla.
 */

export const WO_HEADER_MEMORY_KEY = 'srs.woToBeBilled.header'
/** Pasado esto desde la última vez, el encabezado arranca limpio. */
export const WO_HEADER_MEMORY_MS = 30 * 60 * 1000

export type WoHeaderMemory = {
  dealer: string | null
  /** `YYYY-MM-DD`. */
  from: string | null
  to: string | null
  /** Última vez que se usó la pantalla (ms). */
  at: number
}

export type WoHeaderState = { dealer: string | null; from: string | null; to: string | null }

/** Lo que se muestra al entrar a la pantalla. */
export function woHeaderOnEntry(sharedDealers: string[], memory: WoHeaderMemory | null, now: number): WoHeaderState {
  const fresh = memory != null && now - memory.at < WO_HEADER_MEMORY_MS
  const dealer = sharedDealers.length === 1 ? sharedDealers[0] : fresh ? memory.dealer : null
  return fresh ? { dealer, from: memory.from, to: memory.to } : { dealer, from: null, to: null }
}

export function readWoHeaderMemory(storage: Pick<Storage, 'getItem'> | undefined): WoHeaderMemory | null {
  try {
    const raw = storage?.getItem(WO_HEADER_MEMORY_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as Partial<WoHeaderMemory>
    if (typeof m.at !== 'number') return null
    const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
    return { dealer: typeof m.dealer === 'string' && m.dealer ? m.dealer : null, from: ymd(m.from), to: ymd(m.to), at: m.at }
  } catch {
    return null
  }
}

export function writeWoHeaderMemory(storage: Pick<Storage, 'setItem'> | undefined, state: WoHeaderState, now: number) {
  try {
    storage?.setItem(WO_HEADER_MEMORY_KEY, JSON.stringify({ ...state, at: now } satisfies WoHeaderMemory))
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

/** `Date` local → `YYYY-MM-DD`. */
export function toYmd(d: Date | undefined): string | null {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `YYYY-MM-DD` → `Date` local. */
export function fromYmd(ymd: string | null): Date | undefined {
  if (!ymd) return undefined
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
