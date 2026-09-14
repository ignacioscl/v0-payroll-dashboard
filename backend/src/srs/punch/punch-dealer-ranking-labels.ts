import type { DealerRankingStatus } from './dto/punch-dealer-ranking.dto'
import type { PunchExportLocale } from './punch-export-format'
import { punchExportLabels, type PunchExportLabels } from './punch-export-labels'

/**
 * Claves que el libro del ranking comparte con el de Punch Report. NO se repiten
 * acá: salen de `punchExportLabels()`, así los dos exports dicen lo mismo con las
 * mismas palabras (Report Info, Field/Value, Generated, Period, Status, los nombres
 * de los tipos de error…).
 */
type SharedLabelKey =
  | 'reportInfo'
  | 'field'
  | 'value'
  | 'report'
  | 'generated'
  | 'generatedBy'
  | 'screen'
  | 'period'
  | 'dealers'
  | 'errorStatus'
  | 'errorStatusLabels'
  | 'errorTypes'
  | 'errorTypeNames'
  | 'search'
  | 'all'
  | 'until'
  | 'colEmployee'
  | 'colDealer'

type DealerRankingOwnLabels = {
  /** Valor de la fila Report: el título del modal según el estado del switch. */
  reportNames: Record<DealerRankingStatus, string>
  screenValue: string
  /** Fila "Date basis": el período se mide por el día de la ponchada, en los dos estados. */
  dateBasis: string
  dateBasisValue: string
  /** Campo de la fila del Report Info con el aviso de cobertura (sólo cuando aplica). */
  notice: string
  /**
   * El mismo texto que `punch.correctionsCoverageNotice` de la pantalla. La fecha la
   * pone el caller, ya formateada: va MM/DD/YYYY también en español, porque el resto
   * del libro está en formato de Estados Unidos (xls-export-report-info, DP3).
   */
  correctionsCoverageNotice: (since: string) => string
  /** Nombres de hoja: no se traducen, igual que `Report Info` y `Punch Report` en P4. */
  sheetDealers: string
  sheetEmployees: string
  colRank: string
  /** Total en Pending: ponchadas con error. */
  colErrors: string
  /** Total en Corrected: eventos de corrección (el número de la tarjeta). */
  colCorrections: string
  /** Sólo Corrected: ponchadas distintas corregidas. */
  colPunches: string
}

export type PunchDealerRankingLabels = Pick<PunchExportLabels, SharedLabelKey> &
  DealerRankingOwnLabels

const EN: DealerRankingOwnLabels = {
  reportNames: {
    pending: 'Dealers with most errors',
    corrected: 'Dealers with most corrected errors',
  },
  screenValue: 'Dashboard — Dealers ranking',
  dateBasis: 'Date basis',
  dateBasisValue: 'Punch date',
  notice: 'Notice',
  correctionsCoverageNotice: (since) =>
    `Corrections have been recorded since ${since}. Before that date the history may be incomplete.`,
  sheetDealers: 'Dealers',
  sheetEmployees: 'Employees',
  colRank: '#',
  colErrors: 'Errors',
  colCorrections: 'Corrections',
  colPunches: 'Punches',
}

const ES: DealerRankingOwnLabels = {
  reportNames: {
    pending: 'Sucursales con más errores',
    corrected: 'Sucursales con más errores corregidos',
  },
  screenValue: 'Dashboard — Ranking de sucursales',
  dateBasis: 'Base de fecha',
  dateBasisValue: 'Fecha de la ponchada',
  notice: 'Aviso',
  correctionsCoverageNotice: (since) =>
    `Las correcciones se registran desde el ${since}. Antes de esa fecha la historia puede estar incompleta.`,
  sheetDealers: 'Dealers',
  sheetEmployees: 'Employees',
  colRank: '#',
  colErrors: 'Errores',
  colCorrections: 'Correcciones',
  colPunches: 'Ponchadas',
}

export function punchDealerRankingLabels(locale: PunchExportLocale): PunchDealerRankingLabels {
  const shared = punchExportLabels(locale)
  return {
    reportInfo: shared.reportInfo,
    field: shared.field,
    value: shared.value,
    report: shared.report,
    generated: shared.generated,
    generatedBy: shared.generatedBy,
    screen: shared.screen,
    period: shared.period,
    dealers: shared.dealers,
    errorStatus: shared.errorStatus,
    errorStatusLabels: shared.errorStatusLabels,
    errorTypes: shared.errorTypes,
    errorTypeNames: shared.errorTypeNames,
    search: shared.search,
    all: shared.all,
    until: shared.until,
    colEmployee: shared.colEmployee,
    colDealer: shared.colDealer,
    ...(locale === 'es' ? ES : EN),
  }
}
