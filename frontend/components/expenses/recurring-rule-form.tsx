'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, Split, X } from 'lucide-react'
import { useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { CatalogCombobox } from '@/components/expenses/catalog-combobox'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useChangeRuleSplit, useCreateRule, useUpdateRule } from '@/hooks/use-recurring-rules'
import { WEEK_DAY_KEYS } from '@/lib/expenses/expense-format'
import { EXPENSE_LIMITS, todayInNewYork } from '@/lib/expenses/expense-rules'
import {
  createRecurringFormSchema,
  emptyRecurringFormValues,
  recurringFormValuesFromRule,
  recurringFormValuesToCreatePayload,
  recurringFormValuesToUpdatePayload,
  type RecurringFormValues,
} from '@/lib/expenses/recurring-form-schema'
import { useFormWithFocus } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isExpensesApiError, type RuleDetail } from '@/lib/srs-expenses-api'

const FORM_ID = 'recurring-rule-form'

function mapServerField(field: string): string {
  if (field === 'newCompanyName' || field === 'idCompany') return 'company'
  if (field === 'newCategoryName' || field === 'idCategory') return 'category'
  if (field === 'splitType') return 'splitFixed'
  return field
}

/** Datos de la regla (F4.1). Alta: `POST` y la página pasa a `/expenses/recurring/[id]`. */
export function RecurringRuleForm({ rule }: { rule?: RuleDetail }) {
  const { t } = useTranslation()
  const router = useRouter()
  const createMut = useCreateRule()
  const updateMut = useUpdateRule()
  const splitMut = useChangeRuleSplit()
  const todayNy = React.useMemo(() => todayInNewYork(), [])
  const isEdit = Boolean(rule)

  const schema = React.useMemo(
    () =>
      createRecurringFormSchema({
        errDescription: t('expenses.errDescription'),
        errUpTo: t('expenses.errUpTo'),
        errChooseCompany: t('expenses.errChooseCompany'),
        errChooseCategory: t('expenses.errChooseCategory'),
        errStartDate: t('expenses.errStartDate'),
        endBeforeStart: t('expenses.endBeforeStart'),
        errWeekDay: t('expenses.errWeekDay'),
        errAmount: t('expenses.errAmount'),
      }),
    [t],
  )

  const { form, handleSubmit, applyServerErrors } = useFormWithFocus<RecurringFormValues>({
    resolver: zodResolver(schema),
    defaultValues: rule ? recurringFormValuesFromRule(rule) : emptyRecurringFormValues(todayNy),
    mode: 'onSubmit',
  })

  // La regla cambia por la tabla de dealers (Amount en By fixed amount): el form sigue a la query.
  React.useEffect(() => {
    if (!rule) return
    form.reset(recurringFormValuesFromRule(rule), { keepDirtyValues: true })
  }, [rule, form])

  const frequency = useWatch({ control: form.control, name: 'frequency' })
  const splitFixed = useWatch({ control: form.control, name: 'splitFixed' })
  const [confirmSplit, setConfirmSplit] = React.useState<boolean | null>(null)
  const busy = createMut.isPending || updateMut.isPending || splitMut.isPending

  const onSubmit = async (values: RecurringFormValues) => {
    try {
      if (rule) {
        await updateMut.mutateAsync({ id: rule.id, payload: recurringFormValuesToUpdatePayload(values, rule) })
        toast.success(t('expenses.toastRuleSaved'))
      } else {
        const created = await createMut.mutateAsync(recurringFormValuesToCreatePayload(values))
        toast.success(t('expenses.toastRuleSaved'))
        router.replace(`/expenses/recurring/${created.id}`)
      }
    } catch (err) {
      if (isExpensesApiError(err) && applyServerErrors(err.validationErrors, mapServerField)) return
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  // En una regla existente el Split se cambia con confirmación y por `PUT /split` (F4.1): a By fixed
  // amount solo desde un reparto que el cron genera, a By percent todos vuelven a Automatic. En una
  // regla nueva el switch solo decide cómo se crea.
  const onSplitToggle = (next: boolean) => {
    if (!rule) {
      form.setValue('splitFixed', next)
      return
    }
    setConfirmSplit(next)
  }

  const runSplitChange = async () => {
    if (!rule || confirmSplit === null) return
    try {
      await splitMut.mutateAsync({ id: rule.id, splitType: confirmSplit ? 'fixed' : 'percent' })
      form.setValue('splitFixed', confirmSplit)
      setConfirmSplit(null)
    } catch (err) {
      toast.error(isExpensesApiError(err) ? (err.validationErrors[0]?.message ?? err.message) : err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  return (
    <Form {...form}>
      <form id={FORM_ID} className="flex min-w-0 flex-col gap-4 pb-20" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="rule-description">{t('expenses.ruleDescription')}</FormLabel>
                <FormControl>
                  <Input id="rule-description" maxLength={EXPENSE_LIMITS.ruleDescription} disabled={busy} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('expenses.company')}</FormLabel>
                <FormControl>
                  <CatalogCombobox
                    dataField="company"
                    kind="companies"
                    value={field.value}
                    onChange={(c) => {
                      field.onChange(c)
                      if (c?.lastCategory) {
                        form.setValue('category', { id: c.lastCategory.id, name: c.lastCategory.name, active: c.lastCategory.active })
                        form.clearErrors('category')
                      }
                    }}
                    disabled={busy}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('expenses.category')}</FormLabel>
                <FormControl>
                  <CatalogCombobox dataField="category" kind="categories" value={field.value} onChange={field.onChange} disabled={busy} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="rule-start">{t('expenses.startDate')}</FormLabel>
                <FormControl>
                  <Input id="rule-start" type="date" disabled={busy} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="rule-end">
                  {t('expenses.endDate')} <span className="font-normal text-muted-foreground">({t('expenses.forever').toLowerCase()})</span>
                </FormLabel>
                <FormControl>
                  <Input id="rule-end" type="date" disabled={busy} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="rule-frequency">{t('expenses.frequency')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                  <FormControl>
                    <SelectTrigger id="rule-frequency" className="w-full cursor-pointer" data-field="frequency">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly" className="cursor-pointer">{t('expenses.monthly')}</SelectItem>
                    <SelectItem value="weekly" className="cursor-pointer">{t('expenses.weekly')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {frequency === 'weekly' ? (
            <FormField
              control={form.control}
              name="weekDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="rule-weekday">{t('expenses.dayOfWeek')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <FormControl>
                      <SelectTrigger id="rule-weekday" className="w-full cursor-pointer" data-field="weekDay">
                        <SelectValue placeholder={t('expenses.dayOfWeek')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {WEEK_DAY_KEYS.map((key, i) => (
                        <SelectItem key={key} value={String(i)} className="cursor-pointer">
                          {t(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="hidden md:block" />
          )}
          <FormField
            control={form.control}
            name="splitFixed"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border border-border px-3 py-2 md:col-span-2">
                <div className="min-w-0">
                  <FormLabel htmlFor="rule-split-fixed" className="cursor-pointer">
                    {t('expenses.splitFixed')}
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">{field.value ? t('expenses.fixedHint') : t('expenses.percentHint')}</p>
                </div>
                <FormControl>
                  <Switch id="rule-split-fixed" checked={field.value} disabled={busy} className="cursor-pointer" onCheckedChange={onSplitToggle} />
                </FormControl>
                <FormMessage className="sr-only" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="rule-amount">{t('expenses.ruleAmount')}</FormLabel>
                <FormControl>
                  <Input id="rule-amount" inputMode="decimal" className="tabular-nums" disabled={busy || splitFixed} readOnly={splitFixed} {...field} />
                </FormControl>
                {splitFixed ? <p className="text-xs text-muted-foreground">{t('expenses.amountIsSum')}</p> : null}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => router.push('/expenses/recurring')}>
            <X className="size-4" />
            {isEdit ? t('expenses.back') : t('expenses.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {busy ? t('expenses.saving') : t('expenses.save')}
          </Button>
        </div>
      </form>

      <ConfirmActionDialog
        open={confirmSplit !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmSplit(null)
        }}
        tone="warning"
        icon={Split}
        title={confirmSplit ? t('expenses.changeToFixedTitle') : t('expenses.changeToPercentTitle')}
        description={confirmSplit ? t('expenses.changeToFixedHint') : t('expenses.changeToPercentHint')}
        confirmLabel={t('expenses.yesChange')}
        confirmIcon={Split}
        confirmVariant="default"
        cancelLabel={t('expenses.cancel')}
        pending={splitMut.isPending}
        onConfirm={() => void runSplitChange()}
      />
    </Form>
  )
}
