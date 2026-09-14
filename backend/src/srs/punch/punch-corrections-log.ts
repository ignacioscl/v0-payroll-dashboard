import type { DealerRankingStatus } from './dto/punch-dealer-ranking.dto'

/**
 * Fecha desde la que hay registro de correcciones: `TTK_PUNCH_ERROR_FIX` arrancó el
 * 27/08/2026, sin carga histórica. Antes de esa fecha la historia puede estar
 * incompleta.
 *
 * ⚠️ ESPEJO de `CORRECTIONS_LOG_START` en `frontend/lib/ttk/error-status.ts:70`: el
 * aviso de la pantalla y el del Excel se prenden con la misma fecha. Si cambia una,
 * cambian las dos.
 */
export const CORRECTIONS_LOG_START = '2026-08-27'

/**
 * Si el export del ranking lleva el aviso de cobertura: estado Corrected y un
 * período que empieza antes del arranque del registro. Compara `YYYY-MM-DD` como
 * strings, igual que `rangeStartsBeforeCorrectionsLog` del front.
 *
 * En Pending no aplica nunca: ese número sale del estado actual de cada ponchada,
 * no de la bitácora.
 */
export function correctionsCoverageNoticeApplies(
  status: DealerRankingStatus,
  fechaDesde: string,
): boolean {
  return status === 'corrected' && fechaDesde.trim().slice(0, 10) < CORRECTIONS_LOG_START
}
