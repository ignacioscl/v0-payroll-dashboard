'use client'

import * as React from 'react'
import {
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  ListTree,
  Loader2,
  Users,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n/locale-context'
import { TOAST_DURATION_MS } from '@/lib/toast-config'
import { cn } from '@/lib/utils'
import {
  exportPunchGroupedXlsx,
  type PunchGroupedExportInput,
  type PunchGroupedExportMode,
  type PunchGroupedExportScope,
} from '@/lib/ttk/punch-grouped-export'
import type { PunchGroupedQueryParams } from '@/lib/ttk/punch-grouped-filters'
import type { PunchListQueryParams } from '@/lib/ttk/punch-list-filters'
import type { PunchGroupedExportLabels } from '@/lib/ttk/punch-grouped-export'

export type GroupedPunchExportButtonProps = {
  disabled?: boolean
  fileName?: string
  groupedParamsBase: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>
  punchListParams: Omit<PunchListQueryParams, 'afterValue' | 'afterId' | 'idEmployee'>
  includePaymentType: boolean
  buildLabels: () => PunchGroupedExportLabels
  selectedEmployeeIds: number[]
}

type ExportOptionCardProps = {
  selected: boolean
  title: string
  description: string
  icon: React.ReactNode
  disabled?: boolean
  onSelect: () => void
}

function ExportOptionCard({
  selected,
  title,
  description,
  icon,
  disabled = false,
  onSelect,
}: ExportOptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
        'whitespace-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        disabled && 'cursor-not-allowed opacity-50',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
          selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}

export function GroupedPunchExportButton({
  disabled = false,
  fileName = 'punch-grouped',
  groupedParamsBase,
  punchListParams,
  includePaymentType,
  buildLabels,
  selectedEmployeeIds,
}: GroupedPunchExportButtonProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<PunchGroupedExportMode>('grouped')
  const [scope, setScope] = React.useState<PunchGroupedExportScope>('all')

  const selectedCount = selectedEmployeeIds.length
  const canExportSelected = selectedCount > 0

  React.useEffect(() => {
    if (dialogOpen) {
      setMode('grouped')
      setScope(selectedCount > 0 ? 'selected' : 'all')
    }
  }, [dialogOpen, selectedCount])

  const runExport = async () => {
    if (scope === 'selected' && !canExportSelected) {
      toast.error(t('punch.exportScopeSelectedEmpty'))
      return
    }

    setDialogOpen(false)
    setBusy(true)
    const toastId = toast(t('punch.exportGroupedGenerating'), {
      duration: Infinity,
      dismissible: true,
      closeButton: true,
      icon: <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />,
    })

    const input: PunchGroupedExportInput = {
      mode,
      scope,
      employeeIds: scope === 'selected' ? selectedEmployeeIds : undefined,
      groupedParamsBase,
      punchListParams,
      includePaymentType,
      labels: buildLabels(),
      fileName,
      onProgress: (message) => {
        toast.loading(message, { id: toastId })
      },
    }

    try {
      const count = await exportPunchGroupedXlsx(input)
      toast.success(t('common.exportSuccess', { count }), {
        id: toastId,
        duration: TOAST_DURATION_MS,
      })
    } catch (e) {
      toast.error(t('common.exportFailed'), {
        id: toastId,
        duration: TOAST_DURATION_MS,
      })
      console.error('[GroupedPunchExport]', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-[11px]"
        disabled={disabled || busy}
        aria-label={busy ? t('common.exportInProgress') : t('common.export')}
        aria-busy={busy}
        onClick={() => setDialogOpen(true)}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin text-emerald-600" />
        ) : (
          <FileSpreadsheet className="size-3 text-emerald-600" />
        )}
        {busy ? t('common.exporting') : t('common.export')}
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="px-6 pt-6 pb-2">
            <AlertDialogTitle className="text-lg font-semibold">
              {t('punch.exportGroupedTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t('punch.exportGroupedDescription')}
            </AlertDialogDescription>
          </div>

          <div className="space-y-4 px-6 py-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('punch.exportScopeLabel')}
              </p>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('punch.exportScopeLabel')}>
                <ExportOptionCard
                  selected={scope === 'all'}
                  title={t('punch.exportScopeAll')}
                  description={t('punch.exportScopeAllHint')}
                  icon={<Users className="size-4" />}
                  onSelect={() => setScope('all')}
                />
                <ExportOptionCard
                  selected={scope === 'selected'}
                  title={t('punch.exportScopeSelected')}
                  description={
                    canExportSelected
                      ? t('punch.exportScopeSelectedHint', { count: selectedCount })
                      : t('punch.exportScopeSelectedEmpty')
                  }
                  icon={<UserCheck className="size-4" />}
                  disabled={!canExportSelected}
                  onSelect={() => canExportSelected && setScope('selected')}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('punch.exportContentLabel')}
              </p>
              <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label={t('punch.exportGroupedDescription')}
              >
                <ExportOptionCard
                  selected={mode === 'grouped'}
                  title={t('punch.exportGroupedOnly')}
                  description={t('punch.exportGroupedOnlyHint')}
                  icon={<Layers className="size-4" />}
                  onSelect={() => setMode('grouped')}
                />
                <ExportOptionCard
                  selected={mode === 'detail'}
                  title={t('punch.exportGroupedWithDetail')}
                  description={t('punch.exportGroupedWithDetailHint')}
                  icon={<ListTree className="size-4" />}
                  onSelect={() => setMode('detail')}
                />
              </div>
            </div>
          </div>

          {mode === 'detail' ? (
            <div className="mx-6 mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t('punch.exportGroupedDetailWarning')}</span>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" className="w-full sm:w-auto">
                {t('common.cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              type="button"
              className="w-full gap-1.5 sm:w-auto"
              disabled={busy || (scope === 'selected' && !canExportSelected)}
              onClick={() => void runExport()}
            >
              <FileSpreadsheet className="size-4" />
              {t('dataTable.exportExcel')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
