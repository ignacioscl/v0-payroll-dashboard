export type PunchGroupedPaymentTypeRow = {
  idPaymentType: number | null
  label: string
  hoursNumber: number
}

export type PunchGroupedRow = {
  idUsuario: number
  nombreEmployee: string
  hoursNumber: number
  breakNumber: number
  hasError: boolean
  errorSummary?: string | null
  /**
   * Tipos CORREGIDOS del empleado en el período. Sólo viaja en modo Corrected;
   * en el resto de los modos la columna responde `errorSummary` (decisión D-B).
   */
  correctedTypes?: number[] | null
  fakeGpsEvents?: string[] | null
  /** P7 — ponchadas del empleado que entran en el filtro actual. */
  punchCount: number
  /** P7 — de esas, cuantas siguen con error HOY (mismo criterio en los dos modos). */
  errorCount: number
  /** P7 — de esas, cuantas tienen al menos una correccion registrada en el periodo. */
  fixedCount: number
  byPaymentType: PunchGroupedPaymentTypeRow[]
}

export type PunchGroupedResponse = {
  results: PunchGroupedRow[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  /** Frontera congelada que generó el server; se reenvía en las páginas siguientes. */
  snapshotAt: string
}
