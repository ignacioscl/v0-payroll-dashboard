'use client'

import * as React from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { useTranslation } from '@/lib/i18n/locale-context'
import { downloadBlob } from '@/lib/srs/parse-srs-response'
import { Button } from '@/components/ui/button'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** File name from `Content-Disposition` (`filename*=UTF-8''…` first, then `filename="…"`). */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1] ?? fallback
}

type ServerXlsxExportButtonProps = {
  /** GET that returns the .xlsx built by Nest, with Report Info (D5). Null = disabled. */
  url: string | null
  /** Rows the grid shows, for the success toast (same toast as the DataTable export). */
  rowCount: number
  fallbackFileName: string
  disabled?: boolean
}

/**
 * «Export» of a grid whose Excel is built by the backend (plans/plan-report-info-exports-tablas
 * §5.2): same look and toasts as `DataTableExport`, but the file comes from Nest with Report Info.
 */
export function ServerXlsxExportButton({
  url,
  rowCount,
  fallbackFileName,
  disabled,
}: ServerXlsxExportButtonProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = React.useState(false)

  const handleExport = async () => {
    if (!url) return
    setBusy(true)
    const toastId = toast(t('dataTable.generatingExport', { format: 'Excel' }), {
      duration: Infinity,
      dismissible: true,
      closeButton: true,
      icon: <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />,
    })
    try {
      const res = await fetch(url, { cache: 'no-store' })
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.includes(XLSX_MIME)) {
        throw new Error(`Export failed (${res.status})`)
      }
      const blob = await res.blob()
      downloadBlob(blob, filenameFromDisposition(res.headers.get('content-disposition'), fallbackFileName))
      toast.success(t('common.exportSuccess', { count: rowCount }), {
        id: toastId,
        duration: TOAST_DURATION_MS,
      })
    } catch (e) {
      toast.error(t('common.exportFailed'), { id: toastId, duration: TOAST_DURATION_MS })
      // eslint-disable-next-line no-console
      console.error('[ServerXlsxExportButton]', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-[11px]"
      disabled={busy || disabled || !url}
      onClick={() => void handleExport()}
      aria-label={busy ? t('common.exportInProgress') : t('common.export')}
      aria-busy={busy}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin text-emerald-600" />
      ) : (
        <FileSpreadsheet className="size-3 text-emerald-600" />
      )}
      {busy ? t('common.exporting') : t('common.export')}
    </Button>
  )
}
