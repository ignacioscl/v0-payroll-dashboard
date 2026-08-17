import type { DealerOption } from '@/components/filters/types'

/** Same key and payload as legacy `app.binvoice_main_generic.js`. */
export const INV_GENERIC_STORAGE_KEY = 'inv_generic'

export type InvGenericStored = {
  idDealer: string
  textDealer: string
  date: string
  dateto: string
  note: string
  headerNote: string
  tax: string
}

function parseYmd(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
}

export function readInvGenericStored(): InvGenericStored | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(INV_GENERIC_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<InvGenericStored> | null
    if (!data || typeof data !== 'object') return null
    return {
      idDealer: data.idDealer != null ? String(data.idDealer) : '',
      textDealer: data.textDealer != null ? String(data.textDealer) : '',
      date: data.date != null ? String(data.date) : '',
      dateto: data.dateto != null ? String(data.dateto) : '',
      note: data.note != null ? String(data.note) : '',
      headerNote: data.headerNote != null ? String(data.headerNote) : '',
      tax: data.tax != null ? String(data.tax) : '',
    }
  } catch {
    return null
  }
}

export function writeInvGenericStored(data: InvGenericStored): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INV_GENERIC_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // quota / private mode — same as legacy: ignore
  }
}

export function storedDates(stored: InvGenericStored | null): {
  dateFrom: Date | undefined
  dateTo: Date | undefined
} {
  return {
    dateFrom: parseYmd(stored?.date),
    dateTo: parseYmd(stored?.dateto),
  }
}

/**
 * Header single-select wins (legacy sessionStorage / `_id_dealer_multi`).
 * Otherwise last created dealer from `inv_generic`, if still in the scoped list.
 */
export function resolveInvGenericDealer(
  dealers: DealerOption[],
  selectedDealers: string[],
  stored: InvGenericStored | null,
): DealerOption | null {
  if (selectedDealers.length === 1) {
    const fromHeader = dealers.find((row) => row.id === selectedDealers[0])
    if (fromHeader) return fromHeader
  }
  if (!stored?.idDealer) return null
  return dealers.find((row) => row.id === stored.idDealer) ?? null
}
