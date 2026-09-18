import type { ErrorStatus } from '@/lib/ttk/error-status'
import type { FlagTypeCode } from '@/lib/ttk/error-type-meta'

export type DealerRankingByType = {
  clockOutMissing?: number
  breakMissing?: number
  shift20hPlus?: number
  withoutSalary?: number
  manual?: number
  deleted?: number
  paymentTypeChange?: number
  fakeGps?: number
}

export type DealerRankingRow = {
  idDealer: number
  dealerName: string
  total: number
  punches: number | null
  byType: DealerRankingByType
}

export type DealerRankingResponse = {
  pending: DealerRankingRow[]
  corrected: DealerRankingRow[]
}

export type DealerRankingQueryParams = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  errorTypes?: string
  search?: string
}

export type DealerRankingExportPrepareBody = DealerRankingQueryParams & {
  status: ErrorStatus
}

export const EMPTY_DEALER_RANKING_ROWS: DealerRankingRow[] = []

export const EMPTY_DEALER_RANKING: DealerRankingResponse = {
  pending: EMPTY_DEALER_RANKING_ROWS,
  corrected: EMPTY_DEALER_RANKING_ROWS,
}

export const DEALER_RANKING_BY_TYPE_KEY: Record<FlagTypeCode, keyof DealerRankingByType> = {
  1: 'clockOutMissing',
  2: 'breakMissing',
  3: 'shift20hPlus',
  4: 'withoutSalary',
  5: 'manual',
  6: 'deleted',
  7: 'paymentTypeChange',
  8: 'fakeGps',
}
