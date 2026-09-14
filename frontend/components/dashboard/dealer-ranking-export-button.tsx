'use client'

import * as React from 'react'
import { FileSpreadsheet, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Button } from '@/components/ui/button'
import {
  fetchDealerRankingExportPrepare,
  fetchDealerRankingExportStatus,
} from '@/lib/srs-kpis-api'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { startTicketDownload } from '@/lib/ttk/ticket-download'
import type { DealerRankingQueryParams } from '@/lib/ttk/dealer-ranking-types'
import type { ErrorStatus } from '@/lib/ttk/error-status'

const DEALER_RANKING_EXPORT_PATH = '/api/srs-kpis/punch/dealer-ranking/export'

type DealerRankingExportButtonProps = {
  /** Los filtros con que se pidió el ranking; `null` mientras no hay pedido válido. */
  params: DealerRankingQueryParams | null
  /** Posición del switch al momento del click: el libro sale de ese estado. */
  status: ErrorStatus
  enabled: boolean
}

/**
 * Export del modal de dealers: Report Info + Dealers + Employees, armado en Nest.
 *
 * Mismo flujo que el de Punch Report (`punch-list-export-button`): `prepare` →
 * ticket → `status` cada 800 ms → bajada por `<a download>`. El semáforo y el
 * ticket del server son los mismos para los dos exports.
 */
export function DealerRankingExportButton({
  params,
  status,
  enabled,
}: DealerRankingExportButtonProps) {
  const { t } = useTranslation()
  const [generating, setGenerating] = React.useState(false)
  const pollRef = React.useRef<number | null>(null)
  const ticketRef = React.useRef<string | null>(null)

  const stopPoll = React.useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const cancelDownload = React.useCallback(() => {
    stopPoll()
    ticketRef.current = null
    setGenerating(false)
  }, [stopPoll])

  React.useEffect(() => () => cancelDownload(), [cancelDownload])

  const start = async () => {
    if (!enabled || !params || generating) return
    setGenerating(true)
    try {
      const prepared = await fetchDealerRankingExportPrepare({ ...params, status })
      ticketRef.current = prepared.ticket

      const pollOnce = () => {
        const ticket = ticketRef.current
        if (!ticket) return
        void fetchDealerRankingExportStatus(ticket)
          .then((res) => {
            if (res.status === 'done') {
              stopPoll()
              setGenerating(false)
            } else if (res.status === 'error') {
              stopPoll()
              setGenerating(false)
              toast.error(res.errorMessage || t('common.exportFailed'), {
                duration: TOAST_DURATION_MS,
              })
            }
          })
          .catch((e) => {
            if (e instanceof TypeError) return
            stopPoll()
            setGenerating(false)
            toast.error(getSrsErrorMessage(e, t('common.exportFailed')), {
              duration: TOAST_DURATION_MS,
            })
          })
      }
      pollOnce()
      pollRef.current = window.setInterval(pollOnce, 800)

      startTicketDownload(DEALER_RANKING_EXPORT_PATH, prepared.ticket)
    } catch (e) {
      setGenerating(false)
      toast.error(getSrsErrorMessage(e, t('common.exportFailed')), {
        duration: TOAST_DURATION_MS,
      })
    }
  }

  // Tamaño de pie de diálogo, al lado de Close: el de P4 es el chico de la barra
  // de la grilla.
  if (generating) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-emerald-600" />
          {t('punch.exportGenerating')}
        </span>
        <Button type="button" variant="outline" onClick={cancelDownload}>
          <X />
          {t('common.cancel')}
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={!enabled || !params}
      onClick={() => void start()}
      aria-label={t('common.export')}
    >
      <FileSpreadsheet className="text-emerald-600" />
      {t('common.export')}
    </Button>
  )
}
