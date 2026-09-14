import { CORRECTIONS_LOG_START, correctionsCoverageNoticeApplies } from './punch-corrections-log'
import { punchDealerRankingLabels } from './punch-dealer-ranking-labels'
import { ymdToUs } from './punch-export-format'

describe('aviso de cobertura del registro de correcciones (export del ranking)', () => {
  it('la fecha de arranque es la misma que la del front (frontend/lib/ttk/error-status.ts)', () => {
    expect(CORRECTIONS_LOG_START).toBe('2026-08-27')
  })

  it('Corrected con un período que empieza antes del 27/08/2026: aplica', () => {
    expect(correctionsCoverageNoticeApplies('corrected', '2026-08-26')).toBe(true)
    expect(correctionsCoverageNoticeApplies('corrected', '2026-04-01')).toBe(true)
  })

  it('Corrected desde el 27/08/2026 en adelante: no aplica', () => {
    expect(correctionsCoverageNoticeApplies('corrected', '2026-08-27')).toBe(false)
    expect(correctionsCoverageNoticeApplies('corrected', '2026-09-01')).toBe(false)
  })

  it('Pending: no aplica nunca, arranque el período cuando arranque', () => {
    expect(correctionsCoverageNoticeApplies('pending', '2026-04-01')).toBe(false)
    expect(correctionsCoverageNoticeApplies('pending', '2026-08-26')).toBe(false)
  })

  it('el texto es el de la pantalla, con la fecha MM/DD/YYYY también en español (DP3)', () => {
    const since = ymdToUs(CORRECTIONS_LOG_START)
    expect(since).toBe('08/27/2026')

    expect(punchDealerRankingLabels('en').correctionsCoverageNotice(since)).toBe(
      'Corrections have been recorded since 08/27/2026. Before that date the history may be incomplete.',
    )

    const es = punchDealerRankingLabels('es').correctionsCoverageNotice(since)
    expect(es).toBe(
      'Las correcciones se registran desde el 08/27/2026. Antes de esa fecha la historia puede estar incompleta.',
    )
    // La pantalla en español dice 27/08/2026; en el Excel mezclaría formatos con el
    // período y el sello (xls-export-report-info).
    expect(es).not.toContain('27/08/2026')
  })
})
