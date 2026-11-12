'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Merge, X } from 'lucide-react'
import { toast } from 'sonner'

import { CatalogCombobox, catalogNameWithCount } from '@/components/expenses/catalog-combobox'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useCatalogUsage, useMergeCatalogItem } from '@/hooks/use-expenses-catalog'
import { createSettingsMergeSchema, type SettingsMergeFormValues } from '@/lib/expenses/settings-form-schema'
import { useFormWithFocus } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isExpensesApiError, type CatalogItem, type CatalogKind } from '@/lib/srs-expenses-api'

/**
 * «Merge into…» de Settings (plans/plan-expenses-settings §2.3): mismo diálogo chico que Add / Edit. Elige la
 * compañía o categoría activa que queda (sin la propia y, en categorías, de la misma clase de cierre), muestra qué
 * se mueve y pide confirmación antes de unificar.
 */
export function SettingsMergeDialog({
  kind,
  item,
  onOpenChange,
}: {
  kind: CatalogKind
  /** La fila que se unifica; null = cerrado. */
  item: CatalogItem | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const open = item != null
  const isCompanies = kind === 'companies'
  const usage = useCatalogUsage(kind, item?.id ?? null)
  const mergeMut = useMergeCatalogItem(kind)
  /** `label` = nombre con la cantidad de gastos (título); `name` = el nombre solo (lo que van a decir los gastos). */
  const [confirming, setConfirming] = React.useState<{ id: number; name: string; label: string } | null>(null)

  const schema = React.useMemo(
    () => createSettingsMergeSchema({ errChoose: isCompanies ? t('expenses.errChooseCompany') : t('expenses.errChooseCategory') }),
    [t, isCompanies],
  )
  const { form, handleSubmit, applyServerErrors } = useFormWithFocus<SettingsMergeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { target: null },
    mode: 'onSubmit',
  })

  React.useEffect(() => {
    if (open) {
      form.reset({ target: null })
      setConfirming(null)
    }
  }, [open, item?.id, form])

  const filterItem = React.useCallback(
    (c: CatalogItem) => c.id !== item?.id && (isCompanies || (c.closingClass ?? null) === (item?.closingClass ?? null)),
    [item?.id, item?.closingClass, isCompanies],
  )

  // Nombre con la cantidad de gastos (y «inactive»), como la columna Expenses: dos con el mismo nombre se
  // distinguen en el título, en el resumen y en la confirmación («las dos se llaman igual!!», Ignacio, 11/11/2026).
  const label = (c: { name: string; expensesCount?: number; active?: boolean } | null | undefined): string =>
    c == null ? '' : c.expensesCount == null ? c.name : catalogNameWithCount(t, c.name, c.expensesCount, c.active !== false)
  const sourceName = label(item)
  const target = form.watch('target')
  const targetName = label(target)

  const onSubmit = (values: SettingsMergeFormValues) => {
    if (values.target?.id == null) return
    setConfirming({ id: values.target.id, name: values.target.name, label: label(values.target) })
  }

  const runMerge = async () => {
    if (!item || !confirming) return
    try {
      const result = await mergeMut.mutateAsync({ id: item.id, targetId: confirming.id })
      toast.success(t('expensesCatalog.toastMerged', { n: result.expensesMoved }))
      setConfirming(null)
      onOpenChange(false)
    } catch (err) {
      setConfirming(null)
      if (isExpensesApiError(err)) {
        const errors = err.validationErrors.map((e) => (e.field === 'targetId' ? { ...e, field: 'target' } : e))
        if (applyServerErrors(errors)) return
      }
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const busy = mergeMut.isPending

  return (
    <>
      <Dialog open={open && confirming == null} onOpenChange={(o) => (!o && !busy ? onOpenChange(false) : undefined)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-words">{t('expensesCatalog.mergeTitle', { name: sourceName })}</DialogTitle>
            <DialogDescription>{t('expensesCatalog.mergeHelp', { name: item?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('expensesCatalog.keep')}</FormLabel>
                    <FormControl>
                      <CatalogCombobox
                        dataField="target"
                        kind={kind}
                        value={field.value}
                        onChange={field.onChange}
                        allowCreate={false}
                        disabled={busy}
                        filterItem={filterItem}
                        showExpensesCount
                        placeholder={isCompanies ? t('expensesCatalog.selectCompany') : t('expensesCatalog.selectCategory')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {target?.id != null && usage.data ? (
                <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                  <p>
                    {t('expensesCatalog.mergeSummary', {
                      n: usage.data.expenses,
                      d: usage.data.deletedExpenses,
                      r: usage.data.rules,
                      target: targetName,
                    })}
                  </p>
                  {!isCompanies && usage.data.companies > 0 ? (
                    <p>{t('expensesCatalog.mergeSummaryCompanies', { c: usage.data.companies, target: targetName })}</p>
                  ) : null}
                  <p className="text-muted-foreground">{t('expensesCatalog.mergeSummaryDeleted', { name: sourceName })}</p>
                </div>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => onOpenChange(false)}>
                  <X className="size-4" />
                  {t('expenses.cancel')}
                </Button>
                <Button type="submit" className="cursor-pointer" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
                  {t('expensesCatalog.merge')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={confirming != null}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirming(null)
        }}
        tone="warning"
        title={t('expensesCatalog.mergeConfirmTitle', { name: sourceName, target: confirming?.label ?? '' })}
        description={t('expensesCatalog.mergeConfirmHint', { target: confirming?.name ?? '' })}
        confirmLabel={t('expensesCatalog.yesMerge')}
        confirmIcon={Merge}
        cancelLabel={t('expenses.cancel')}
        pending={busy}
        onConfirm={() => void runMerge()}
      />
    </>
  )
}
