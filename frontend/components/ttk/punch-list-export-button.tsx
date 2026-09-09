'use client'

import * as React from 'react'
import { FileSpreadsheet, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Button } from '@/components/ui/button'
import {
  punchExportBodyFromListParams,
  type PunchListQueryParams,
} from '@/lib/ttk/punch-list-filters'
import { fetchPunchExportPrepare, fetchPunchExportStatus } from '@/lib/srs-kpis-api'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'

type PunchListExportButtonProps = {
  params: PunchListQueryParams
  enabled: boolean
}

/**
 * Dispara la bajada del xlsx ya preparado.
 *
 * Va por un `<a download>` y NO por un iframe oculto: un iframe de 0×0 apuntando
 * a una URL con `export?ticket=` es justo lo que cazan los bloqueadores de
 * contenido, y Chrome corta el pedido con `ERR_BLOCKED_BY_CLIENT` sin que la app
 * se entere —el ticket se prepara bien y el archivo nunca llega—. Un anchor con
 * `download` al mismo origen no lo toca ningún bloqueador y tampoco navega.
 */
function startTicketDownload(ticket: string) {
  const a = document.createElement('a')
  a.href = `/api/srs-kpis/punch/list/export?ticket=${encodeURIComponent(ticket)}`
  // El nombre real lo manda el server en Content-Disposition; esto es el fallback.
  a.download = ''
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // El anchor NO se saca en el mismo tick: el ticket es de un solo uso y el
  // servidor arma el archivo mientras lo transmite, así que la bajada vive
  // bastante después del click. Sacarlo enseguida la deja cancelada en 0 bytes.
  window.setTimeout(() => a.remove(), 60_000)
}

export function PunchListExportButton({ params, enabled }: PunchListExportButtonProps) {
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
    if (!enabled || generating) return
    setGenerating(true)
    try {
      const body = punchExportBodyFromListParams(params)
      const prepared = await fetchPunchExportPrepare(body)
      ticketRef.current = prepared.ticket

      const pollOnce = () => {
        const ticket = ticketRef.current
        if (!ticket) return
        void fetchPunchExportStatus(ticket)
          .then((status) => {
            if (status.status === 'done') {
              stopPoll()
              setGenerating(false)
            } else if (status.status === 'error') {
              stopPoll()
              setGenerating(false)
              toast.error(status.errorMessage || t('common.exportFailed'), {
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

      startTicketDownload(prepared.ticket)
    } catch (e) {
      setGenerating(false)
      toast.error(getSrsErrorMessage(e, t('common.exportFailed')), {
        duration: TOAST_DURATION_MS,
      })
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {generating ? (
        <>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin text-emerald-600" />
            {t('punch.exportGenerating')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={cancelDownload}
          >
            <X className="size-3" />
            {t('common.cancel')}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={!enabled}
          onClick={() => void start()}
          aria-label={t('common.export')}
        >
          <FileSpreadsheet className="size-3 text-emerald-600" />
          {t('common.export')}
        </Button>
      )}
    </div>
  )
}
