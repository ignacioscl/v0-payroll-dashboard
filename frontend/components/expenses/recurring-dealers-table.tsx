'use client'

import * as React from 'react'
import { FileSpreadsheet, Loader2, Plus, Trash2, UserCog } from 'lucide-react'
import { toast } from 'sonner'

import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAddRuleDealers, useRemoveRuleAssign, useUpdateRuleAssign } from '@/hooks/use-recurring-rules'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { downloadServerXlsx } from '@/lib/download-xlsx'
import { fmtAmount } from '@/lib/expenses/expense-format'
import { fromCents, splitAmount, toCents, totalCents } from '@/lib/expenses/expense-rules'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isExpensesApiError, ruleDealersExportUrl, type RuleAssignRow, type RuleDetail } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

/**
 * Tabla de dealers de una regla (F4.2, T5.5 v4): tabla de Pro con un input por dealer que graba al
 * salir del campo (o Enter). Cada endpoint devuelve la regla entera y el hook la escribe con
 * `setQueryData`: la tabla actualiza los valores EN SU LUGAR (filas con `key = idAssign`, nada se
 * desmonta, el scroll no se mueve, el foco queda donde estaba). Cada input es controlado por un
 * estado local por fila (`drafts[idAssign]`) que se sincroniza con el valor confirmado por el
 * servidor cada vez que la regla cambia, y que al rechazar un cambio vuelve al valor grabado con el
 * error debajo del campo.
 *
 * Hecha a mano (shadcn `Table`) y no con `DataTable`: es una grilla de edición sin paginar y sin
 * virtualizar (con 85 dealers el virtualizador desmontaría filas y perdería el foco). Sin columnas
 * fijas ni sticky; en celular los nombres van en varias líneas.
 */
export function RecurringDealersTable({ rule }: { rule: RuleDetail }) {
  const { t } = useTranslation()
  const { dealers, loading: dealersLoading } = useSrsDealers()
  const updateMut = useUpdateRuleAssign()
  const removeMut = useRemoveRuleAssign()
  const addMut = useAddRuleDealers()
  const isFixed = rule.splitType === 'fixed'

  const [allowAnyTotal, setAllowAnyTotal] = React.useState(false)
  const [drafts, setDrafts] = React.useState<Record<number, string>>({})
  const [errors, setErrors] = React.useState<Record<number, string>>({})
  const [confirmMode, setConfirmMode] = React.useState<RuleAssignRow | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState<RuleAssignRow | null>(null)
  const [toAdd, setToAdd] = React.useState<string[]>([])
  const [exporting, setExporting] = React.useState(false)

  const savedValue = React.useCallback(
    (a: RuleAssignRow) => (isFixed ? (a.fixedAmount ?? '') : (a.percentage ?? '')),
    [isFixed],
  )
  const clearError = (idAssign: number) =>
    setErrors((prev) => {
      const next = { ...prev }
      delete next[idAssign]
      return next
    })

  /** Fila cuyo input tiene el foco (null si ninguno): lo que el usuario tipea ahí no se pisa. */
  const focusedId = React.useRef<number | null>(null)
  /** Regla anterior, para saber qué valor grabado cambió de verdad en cada respuesta. */
  const prevRule = React.useRef<{ assigns: RuleAssignRow[]; isFixed: boolean } | null>(null)

  // Lo que devuelve el servidor manda, pero SOLO en las filas cuyo valor grabado cambió respecto
  // de la regla anterior (los Automatic recalculados, la fila que se acaba de grabar): así la
  // respuesta del PUT de la fila A no pisa lo que el usuario ya está tipeando en la fila B. La fila
  // con el foco no se toca mientras tenga algo tipeado (distinto de lo grabado antes); el valor
  // rechazado vuelve a lo grabado en `commit`, no acá. Al cambiar el tipo de reparto o al montar,
  // se toma todo de la regla.
  React.useEffect(() => {
    const prev = prevRule.current
    prevRule.current = { assigns: rule.assigns, isFixed }
    if (!prev || prev.isFixed !== isFixed) {
      const next: Record<number, string> = {}
      for (const a of rule.assigns) next[a.id] = savedValue(a)
      setDrafts(next)
      return
    }
    const before = new Map(prev.assigns.map((a) => [a.id, savedValue(a)] as const))
    setDrafts((current) => {
      const next: Record<number, string> = {}
      for (const a of rule.assigns) {
        const saved = savedValue(a)
        const previous = before.get(a.id)
        const draft = current[a.id]
        if (previous === undefined || draft === undefined) {
          next[a.id] = saved // fila nueva en la regla
          continue
        }
        if (previous === saved) {
          next[a.id] = draft // lo grabado no cambió: queda lo tipeado
          continue
        }
        const typing = focusedId.current === a.id && draft.trim() !== previous
        next[a.id] = typing ? draft : saved
      }
      return next
    })
  }, [rule.assigns, isFixed, savedValue])

  const commit = async (a: RuleAssignRow) => {
    const draft = (drafts[a.id] ?? '').trim()
    const saved = savedValue(a)
    if (draft === saved) return
    if (!isFixed && a.automatic) return
    try {
      await updateMut.mutateAsync({
        id: rule.id,
        idAssign: a.id,
        payload: isFixed ? { fixedAmount: draft, allowAnyTotal } : { percentage: draft, allowAnyTotal },
      })
      clearError(a.id)
    } catch (err) {
      const message = isExpensesApiError(err)
        ? (err.validationErrors[0]?.message ?? err.message)
        : err instanceof Error
          ? err.message
          : t('common.failedToLoad')
      setErrors((prev) => ({ ...prev, [a.id]: message }))
      // El campo vuelve a lo grabado; el error queda debajo.
      setDrafts((prev) => ({ ...prev, [a.id]: saved }))
    }
  }

  const changeMode = async () => {
    if (!confirmMode) return
    const a = confirmMode
    try {
      await updateMut.mutateAsync({ id: rule.id, idAssign: a.id, payload: { automatic: !a.automatic, allowAnyTotal } })
      clearError(a.id)
      setConfirmMode(null)
    } catch (err) {
      toast.error(isExpensesApiError(err) ? (err.validationErrors[0]?.message ?? err.message) : err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const remove = async () => {
    if (!confirmRemove) return
    try {
      await removeMut.mutateAsync({ id: rule.id, idAssign: confirmRemove.id, allowAnyTotal })
      setConfirmRemove(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const addDealers = async () => {
    if (toAdd.length === 0) return
    try {
      await addMut.mutateAsync({ id: rule.id, idDealers: toAdd.map(Number), allowAnyTotal })
      setToAdd([])
    } catch (err) {
      toast.error(isExpensesApiError(err) ? (err.validationErrors[0]?.message ?? err.message) : err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const exportDealers = async () => {
    setExporting(true)
    try {
      await downloadServerXlsx(ruleDealersExportUrl(rule.id), `recurring_expense_${rule.id}_dealers.xlsx`)
    } catch {
      toast.error(t('common.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const inRule = React.useMemo(() => new Set(rule.assigns.map((a) => String(a.dealer.id))), [rule.assigns])
  const addable = React.useMemo(() => dealers.filter((d) => !inRule.has(d.id)), [dealers, inRule])

  // Total y monto por corrida con las mismas reglas que el cron (pareja).
  const assignsForRules = React.useMemo(
    () => rule.assigns.map((a) => ({ id: a.id, percentage: a.percentage, fixedAmount: a.fixedAmount, automatic: a.automatic })),
    [rule.assigns],
  )
  const pctTotal = isFixed ? null : totalCents(assignsForRules)
  const perRun = React.useMemo(() => {
    if (isFixed) return splitAmount(rule.amount ?? '0', assignsForRules, 2)
    if (!rule.amount || pctTotal !== 10000) return {}
    return splitAmount(rule.amount, assignsForRules, 1)
  }, [isFixed, rule.amount, assignsForRules, pctTotal])
  const fixedTotal = isFixed ? rule.assigns.reduce((s, a) => s + (a.fixedAmount ? toCents(a.fixedAmount) : 0), 0) : 0

  const busy = updateMut.isPending || removeMut.isPending || addMut.isPending
  // Los controles de las filas no se deshabilitan mientras se graba un valor: el Tab cae en ellos justo ahí.
  const rowBusy = removeMut.isPending || addMut.isPending

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {t('expenses.dealers')} ({rule.assigns.length})
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="rule-allow-any-total" checked={allowAnyTotal} onCheckedChange={setAllowAnyTotal} className="cursor-pointer" />
            <Label htmlFor="rule-allow-any-total" className="cursor-pointer text-sm">
              {t('expenses.dontBlock')}
            </Label>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={exporting || rule.assigns.length === 0} onClick={() => void exportDealers()}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-emerald-600" />}
            {t('expenses.exportDealers')}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{isFixed ? t('expenses.fixedHint') : t('expenses.percentHint')}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DealerMultiSelect
          dealers={addable}
          value={toAdd}
          onChange={setToAdd}
          loading={dealersLoading}
          disabled={busy || addable.length === 0}
          placeholder={addable.length === 0 ? t('expenses.noDealersToAdd') : t('expenses.selectBranches')}
          className="w-full sm:w-[320px]"
        />
        <Button type="button" size="sm" disabled={busy || toAdd.length === 0} onClick={() => void addDealers()}>
          {addMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t('expenses.addDealers')}
        </Button>
      </div>

      {/* `relative`: el sr-only de los botones (absolute) si no escapa de esta caja y hace scrollear la página en celular. */}
      <div className="relative min-w-0 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('expenses.branch')}</th>
              {!isFixed ? <th className="w-36 px-3 py-2 text-left font-medium">{t('expenses.mode')}</th> : null}
              <th className="w-40 px-3 py-2 text-right font-medium">{isFixed ? t('expenses.amount') : t('expenses.percent')}</th>
              {/* By fixed amount: el importe es el que se escribe; una segunda columna lo repetiría. */}
              {!isFixed ? <th className="w-32 px-3 py-2 text-right font-medium">{t('expenses.dealerAmount')}</th> : null}
              <th className="w-12 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rule.assigns.map((a) => {
              const editable = isFixed || !a.automatic
              const error = errors[a.id]
              const missingFixed = isFixed && (a.fixedAmount === null || a.fixedAmount === '')
              return (
                <tr key={a.id} className="border-t border-border/60 align-middle" data-assign={a.id}>
                  <td className="whitespace-normal break-words px-3 py-1.5">
                    {a.dealer.name}
                    {missingFixed && !error ? (
                      <div className="text-[11px] text-amber-700">{t('expenses.enterDealerAmount')}</div>
                    ) : null}
                  </td>
                  {!isFixed ? (
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`assign-auto-${a.id}`}
                          checked={a.automatic}
                          disabled={rowBusy}
                          className="cursor-pointer"
                          onCheckedChange={() => setConfirmMode(a)}
                          aria-label={`${a.dealer.name}: ${a.automatic ? t('expenses.automatic') : t('expenses.manual')}`}
                        />
                        <Label htmlFor={`assign-auto-${a.id}`} className="cursor-pointer text-xs">
                          {a.automatic ? t('expenses.automatic') : t('expenses.manual')}
                        </Label>
                      </div>
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5">
                    <Input
                      value={drafts[a.id] ?? ''}
                      inputMode="decimal"
                      // No se deshabilita mientras otra fila graba: el Tab lleva el foco a este campo justo
                      // cuando la anterior empieza a grabar, y un input deshabilitado pierde el foco.
                      disabled={!editable}
                      aria-invalid={Boolean(error)}
                      aria-label={`${a.dealer.name} ${isFixed ? t('expenses.amount') : t('expenses.percent')}`}
                      className={cn('h-8 min-w-24 text-right text-sm tabular-nums', error && 'border-destructive')}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      onFocus={() => {
                        focusedId.current = a.id
                      }}
                      onBlur={() => {
                        if (focusedId.current === a.id) focusedId.current = null
                        void commit(a)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          ;(e.currentTarget as HTMLInputElement).blur()
                        }
                      }}
                    />
                    {error ? (
                      <p className="mt-1 text-right text-xs text-destructive" role="alert">
                        {error}
                      </p>
                    ) : null}
                  </td>
                  {!isFixed ? (
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {perRun[a.id] ? fmtAmount(perRun[a.id]) : '—'}
                    </td>
                  ) : null}
                  <td className="px-1 py-1.5 text-right">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" disabled={rowBusy} onClick={() => setConfirmRemove(a)}>
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">{t('expenses.delete')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t('expenses.delete')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30 text-sm font-medium">
            <tr>
              <td className="px-3 py-2" colSpan={isFixed ? 1 : 2}>
                {t('expenses.totalPercent')}
              </td>
              <td
                className={cn(
                  'px-3 py-2 text-right tabular-nums',
                  !isFixed && pctTotal !== null && (pctTotal === 10000 ? 'text-emerald-700' : 'text-destructive'),
                )}
              >
                {isFixed ? fmtAmount(fromCents(fixedTotal)) : pctTotal === null ? '—' : `${fromCents(pctTotal)}%`}
              </td>
              {!isFixed ? <td className="px-3 py-2 text-right tabular-nums">{rule.amount ? fmtAmount(rule.amount) : '—'}</td> : null}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {rule.canRun ? <p className="text-xs text-muted-foreground">{rule.canRun}</p> : null}

      <ConfirmActionDialog
        open={confirmMode != null}
        onOpenChange={(o) => {
          if (!o) setConfirmMode(null)
        }}
        tone="info"
        icon={UserCog}
        title={
          confirmMode
            ? t('expenses.changeDealerModeTitle', {
                dealer: confirmMode.dealer.name,
                mode: confirmMode.automatic ? t('expenses.manual') : t('expenses.automatic'),
              })
            : ''
        }
        description={t('expenses.percentHint')}
        confirmLabel={t('expenses.yesChange')}
        confirmIcon={UserCog}
        confirmVariant="default"
        cancelLabel={t('expenses.cancel')}
        pending={updateMut.isPending}
        onConfirm={() => void changeMode()}
      />
      <ConfirmActionDialog
        open={confirmRemove != null}
        onOpenChange={(o) => {
          if (!o) setConfirmRemove(null)
        }}
        tone="danger"
        title={confirmRemove ? t('expenses.removeDealerTitle', { dealer: confirmRemove.dealer.name }) : ''}
        description={rule.description}
        confirmLabel={t('expenses.yesRemove')}
        confirmIcon={Trash2}
        cancelLabel={t('expenses.cancel')}
        pending={removeMut.isPending}
        onConfirm={() => void remove()}
      />
    </section>
  )
}
