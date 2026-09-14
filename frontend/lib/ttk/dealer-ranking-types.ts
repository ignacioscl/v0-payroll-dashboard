import type { ErrorStatus } from '@/lib/ttk/error-status'
import type { ErrorTypeCode } from '@/lib/ttk/error-type-meta'

/**
 * Ranking de dealers del Dashboard: la tarjeta *Dealers with most errors* (top 5)
 * y su modal "View all". Espejo del DTO de Nest (`GET /srs/punch/dealer-ranking`).
 */
export type DealerRankingByType = {
  clockOutMissing: number
  breakMissing: number
  shift20hPlus: number
}

export type DealerRankingRow = {
  idDealer: number
  /** `GET_DEALER_NAME_BY_PROVIDER`: el nombre que le puso el provider. */
  dealerName: string
  /**
   * Pending: ponchadas con error (una ponchada = uno). Corrected: EVENTOS de
   * corrección, el número de la tarjeta: una ponchada con dos tipos arreglados
   * suma dos.
   */
  total: number
  /**
   * Sólo Corrected: ponchadas distintas. Es lo que cuenta Grouped (`fixedCount`),
   * adonde lleva el click, así que es la columna que se coteja con el destino.
   * `null` en Pending.
   */
  punches: number | null
  byType: DealerRankingByType
}

/** Los dos rankings en la misma respuesta: el switch es del cliente y moverlo no pide. */
export type DealerRankingResponse = {
  pending: DealerRankingRow[]
  corrected: DealerRankingRow[]
}

/** Query de `GET /srs/punch/dealer-ranking`. */
export type DealerRankingQueryParams = {
  fechaDesde: string
  fechaHasta: string
  /** CSV de dealers, ya joineado. */
  idDealer: string
  /** CSV canónico de tipos incluidos. Se omite con los tres (compatibilidad). */
  errorTypes?: string
  search?: string
}

/**
 * Body de `POST /srs/punch/dealer-ranking/export/prepare`: los mismos filtros con
 * que se pidió el ranking, más la posición del switch al momento del click.
 */
export type DealerRankingExportPrepareBody = DealerRankingQueryParams & {
  status: ErrorStatus
}

/** Referencia estable para el ranking vacío. */
export const EMPTY_DEALER_RANKING_ROWS: DealerRankingRow[] = []

export const EMPTY_DEALER_RANKING: DealerRankingResponse = {
  pending: EMPTY_DEALER_RANKING_ROWS,
  corrected: EMPTY_DEALER_RANKING_ROWS,
}

/** Código de `TTK_PUNCH_WITH_ERROR_V2` → clave de `byType`. */
export const DEALER_RANKING_BY_TYPE_KEY: Record<ErrorTypeCode, keyof DealerRankingByType> = {
  1: 'clockOutMissing',
  2: 'breakMissing',
  3: 'shift20hPlus',
}
