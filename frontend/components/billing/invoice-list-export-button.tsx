'use client'

import * as React from 'react'
import { FileSpreadsheet, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Button } from '@/components/ui/button'
import type { InvoiceListInput } from '@/hooks/use-invoice-list'
import {
  INVOICE_LIST_EXPORT_DOWNLOAD_PATH,
  fetchInvoiceListExportPrepare,
  fetchInvoiceListExportStatus,
} from '@/lib/srs-invoices-api'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { DB_POOL_BUSY, isSrsBusyError } from '@/lib/srs-busy-error'
import { startTicketDownload } from '@/lib/ttk/ticket-download'

type InvoiceListExportButtonProps = {
  /** The grid's query: the file comes with its filters and its order. */
  input: InvoiceListInput | null
  enabled: boolean
}

/**
 * «Export» of the Invoices grid's toolbar (plans/plan-report-info-exports-tablas §6): the file is
 * built by Nest with Report Info (D5), same columns as before. Same flow as Punch Report's export
 * (`punch-list-export-button`): prepare → ticket → status every 800 ms → download by `<a download>`.
 */
export function InvoiceListExportButton({ input, enabled }: InvoiceListExportButtonProps) {
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
    if (!enabled || !input || generating) return
    setGenerating(true)
    try {
      const prepared = await fetchInvoiceListExportPrepare(input)
      ticketRef.current = prepared.ticket

      const pollOnce = () => {
        const ticket = ticketRef.current
        if (!ticket) return
        void fetchInvoiceListExportStatus(ticket)
          .then((status) => {
            if (status.status === 'done') {
              stopPoll()
              setGenerating(false)
            } else if (status.status === 'error') {
              stopPoll()
              setGenerating(false)
              toast.error(
                status.errorCode === DB_POOL_BUSY
                  ? t('common.serverBusy')
                  : status.errorMessage || t('common.exportFailed'),
                { duration: TOAST_DURATION_MS },
              )
            }
          })
          .catch((e) => {
            if (e instanceof TypeError) return
            stopPoll()
            setGenerating(false)
            toast.error(isSrsBusyError(e) ? t('common.serverBusy') : getSrsErrorMessage(e, t('common.exportFailed')), {
              duration: TOAST_DURATION_MS,
            })
          })
      }
      pollOnce()
      pollRef.current = window.setInterval(pollOnce, 800)

      startTicketDownload(INVOICE_LIST_EXPORT_DOWNLOAD_PATH, prepared.ticket)
    } catch (e) {
      setGenerating(false)
      toast.error(isSrsBusyError(e) ? t('common.serverBusy') : getSrsErrorMessage(e, t('common.exportFailed')), {
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
            {t('common.exporting')}
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
          disabled={!enabled || !input}
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
