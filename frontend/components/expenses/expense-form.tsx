'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Building2, Equal, Loader2, Percent, Repeat, Save, Sigma, Split, Upload, X } from 'lucide-react'
import { useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { AttachmentPicker } from '@/components/expenses/attachment-picker'
import { CatalogCombobox } from '@/components/expenses/catalog-combobox'
import { DealerCombobox } from '@/components/expenses/dealer-combobox'
import { ExpenseEmployeeCombobox } from '@/components/expenses/expense-employee-combobox'
import { ExpenseSplitTable } from '@/components/expenses/expense-split-table'
import { RecurringRulePickerDialog } from '@/components/expenses/recurring-rule-picker-dialog'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { OptionTile } from '@/components/shared/option-tile'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateExpense, useUpdateExpense } from '@/hooks/use-expenses-list'
import { useRecurringRule } from '@/hooks/use-recurring-rules'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { uploadAttachment } from '@/lib/expense-attachments'
import { rowAttachmentLocation, toYmd } from '@/lib/expenses/expense-format'
import {
  applyRuleToExpenseForm,
  createExpenseFormSchema,
  emptyExpenseFormValues,
  expenseFormValuesFromDetail,
  expenseFormValuesToPayload,
  expenseFormValuesToTextOnlyPayload,
  type ExpenseFormValues,
} from '@/lib/expenses/expense-form-schema'
import { EXPENSE_LIMITS, todayInNewYork } from '@/lib/expenses/expense-rules'
import { useFilters } from '@/lib/filter-context'
import { useFormWithFocus } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isExpensesApiError, type ExpenseDetail, type ExpenseMode, type RuleDetail } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

const FORM_ID = 'expense-form'

export type ExpenseFormProps = {
  /** Edit: el gasto o grupo cargado por `GET /:id`. */
  detail?: ExpenseDetail
  /** `/expenses/new?fromRule=:id`: precarga del reparto de la regla. */
  fromRuleId?: number | null
  /** Permiso 117: combo «Assign to employee». */
  canAssign: boolean
  /** Nombre del usuario que carga (sin 117 el gasto queda a su nombre). */
  userName?: string | null
}

type UploadTarget = { idDealer: number; idExpense: number }

/** Campo del DTO del Nest → campo del form (los errores del backend van a su campo). */
function mapServerField(field: string): string {
  if (field === 'newCompanyName' || field === 'idCompany') return 'company'
  if (field === 'newCategoryName' || field === 'idCategory') return 'category'
  if (field === 'idAuthor') return 'author'
  if (field === 'branches') return 'branchIds'
  const m = /^branches\[(\d+)\]\.(percentage|amount)$/.exec(field) ?? /^branches\.(\d+)\.(percentage|amount)$/.exec(field)
  if (m) return `branches.${m[1]}.${m[2]}`
  return field
}

export function ExpenseForm({ detail, fromRuleId, canAssign, userName }: ExpenseFormProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { dateRange } = useFilters()
  const { dealers, loading: dealersLoading } = useSrsDealers()
  const createMut = useCreateExpense()
  const updateMut = useUpdateExpense()
  const todayNy = React.useMemo(() => todayInNewYork(), [])
  const isEdit = Boolean(detail)

  // Bloqueos de edición (F3).
  const readOnlyGroup = detail?.kind === 'group' && detail.readOnly
  const approvedSingle = detail?.kind === 'single' && detail.status === 'approved'
  const textOnly = detail?.kind === 'group' && detail.approvedCount > 0 && !readOnlyGroup
  const locked = readOnlyGroup || approvedSingle
  const branchLocked = detail?.kind === 'single' && detail.hasAttachment

  const schema = React.useMemo(
    () =>
      createExpenseFormSchema(
        { todayNy, textOnly },
        {
          errDate: t('expenses.errDate'),
          errAmount: t('expenses.errAmount'),
          errPercent: t('expenses.errPercent'),
          errPercentSum: t('expenses.errPercentSum'),
          errChooseBranch: t('expenses.errChooseBranch'),
          errChooseTwoBranches: t('expenses.errChooseTwoBranches'),
          errChooseCompany: t('expenses.errChooseCompany'),
          errChooseCategory: t('expenses.errChooseCategory'),
          errUpTo: t('expenses.errUpTo'),
        },
      ),
    [t, todayNy, textOnly],
  )

  const { form, handleSubmit, applyServerErrors } = useFormWithFocus<ExpenseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: detail ? expenseFormValuesFromDetail(detail, todayNy) : emptyExpenseFormValues(todayNy),
    mode: 'onSubmit',
  })

  // Precarga desde la regla (`?fromRule`), una sola vez cuando llega.
  const ruleQuery = useRecurringRule(!isEdit && fromRuleId ? fromRuleId : null)
  const appliedRule = React.useRef(false)
  const applyRule = React.useCallback(
    (rule: RuleDetail) => {
      form.reset(applyRuleToExpenseForm(form.getValues(), rule))
    },
    [form],
  )
  React.useEffect(() => {
    if (appliedRule.current || !ruleQuery.data) return
    appliedRule.current = true
    applyRule(ruleQuery.data)
  }, [ruleQuery.data, applyRule])

  const mode = useWatch({ control: form.control, name: 'mode' })
  const idDealer = useWatch({ control: form.control, name: 'idDealer' })
  const branchIds = useWatch({ control: form.control, name: 'branchIds' })
  const dealersCsv = mode === 'single' ? idDealer : (branchIds ?? []).join(',')

  const [files, setFiles] = React.useState<File[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  /** Gasto grabado cuya subida de adjuntos falló: queda «Retry upload» (T4). */
  const [pendingUpload, setPendingUpload] = React.useState<{ target: UploadTarget; files: File[] } | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const busy = createMut.isPending || updateMut.isPending || uploading

  const goBackToList = React.useCallback(
    (ticketDate?: string) => {
      const from = toYmd(dateRange?.from)
      const to = toYmd(dateRange?.to ?? dateRange?.from)
      // El gasto queda a la vista: si su fecha cae fuera del rango del header, se amplía (F7.2).
      if (ticketDate && from && (ticketDate < from || ticketDate > to)) {
        const nextFrom = ticketDate < from ? ticketDate : from
        const nextTo = ticketDate > to ? ticketDate : to
        router.push(`/expenses?from=${nextFrom}&to=${nextTo}`)
        return
      }
      router.push('/expenses')
    },
    [dateRange, router],
  )

  /**
   * Sube los archivos de a uno y devuelve los que fallaron. Un adjunto subido cuyo registro en el
   * log falló (`logged: false`) no cuenta como fallo: se avisa con un toast y no se reintenta.
   */
  const uploadAll = async (target: UploadTarget, toUpload: File[]): Promise<File[]> => {
    const failed: File[] = []
    let unlogged = 0
    for (const f of toUpload) {
      try {
        const { logged } = await uploadAttachment(target.idDealer, target.idExpense, f)
        if (!logged) unlogged += 1
      } catch {
        failed.push(f)
      }
    }
    if (unlogged > 0) toast.error(t('expenses.attachmentLogFailed'))
    return failed
  }

  const onSubmit = async (values: ExpenseFormValues) => {
    try {
      let saved: ExpenseDetail
      if (detail) {
        // Grupo con una fila aprobada: solo los textos. Si no, el cuerpo entero; `idAuthor` va solo
        // con el permiso 117 y solo si cambió respecto del autor cargado.
        const payload = textOnly
          ? expenseFormValuesToTextOnlyPayload(values)
          : expenseFormValuesToPayload(values, { canAssign, savedAuthorId: detail.author?.id ?? null })
        const id = detail.kind === 'group' ? detail.groupId : detail.id
        saved = await updateMut.mutateAsync({ id, payload: { ...payload, kind: detail.kind } })
      } else {
        saved = await createMut.mutateAsync(expenseFormValuesToPayload(values, { canAssign }))
      }
      if (files.length > 0) {
        const target = rowAttachmentLocation(saved)
        if (target) {
          setUploading(true)
          const failed = await uploadAll(target, files)
          setUploading(false)
          if (failed.length > 0) {
            setPendingUpload({ target, files: failed })
            toast.error(t('expenses.uploadFailed'))
            return
          }
        }
      }
      toast.success(t('expenses.toastSaved'))
      goBackToList(values.ticketDate)
    } catch (err) {
      setUploading(false)
      if (isExpensesApiError(err) && applyServerErrors(err.validationErrors, mapServerField)) return
      toast.error(err instanceof Error ? err.message : t('common.failedToLoad'))
    }
  }

  const retryUpload = async () => {
    if (!pendingUpload) return
    setUploading(true)
    const failed = await uploadAll(pendingUpload.target, pendingUpload.files)
    setUploading(false)
    if (failed.length > 0) {
      setPendingUpload({ ...pendingUpload, files: failed })
      toast.error(t('expenses.uploadFailed'))
      return
    }
    setPendingUpload(null)
    toast.success(t('expenses.uploaded'))
    goBackToList(form.getValues('ticketDate'))
  }

  const setMode = (next: ExpenseMode) => {
    if (locked || textOnly) return
    form.setValue('mode', next, { shouldDirty: true })
    form.clearErrors(['branchIds', 'idDealer', 'totalAmount'])
  }
  const isMultiple = mode !== 'single'

  const tilesDisabled = locked || textOnly

  return (
    <Form {...form}>
      <form id={FORM_ID} className="flex min-w-0 flex-col gap-5 pb-20" onSubmit={handleSubmit(onSubmit)} noValidate>
        {readOnlyGroup ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('expenses.readOnlyGroup')}</AlertTitle>
          </Alert>
        ) : approvedSingle ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('expenses.errApproved')}</AlertTitle>
          </Alert>
        ) : textOnly ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('expenses.approvedRowsLockSplit')}</AlertTitle>
          </Alert>
        ) : null}

        {pendingUpload ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('expenses.uploadFailed')}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{pendingUpload.files.map((f) => f.name).join(', ')}</span>
              <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => void retryUpload()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {t('expenses.retryUpload')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="ticketDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="exp-date">{t('expenses.receiptDate')}</FormLabel>
                <FormControl>
                  <Input id="exp-date" type="date" max={todayNy} disabled={busy || locked || textOnly} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="author"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('expenses.assignToEmployee')}</FormLabel>
                {canAssign ? (
                  <FormControl>
                    <ExpenseEmployeeCombobox
                      dataField="author"
                      value={field.value}
                      onChange={field.onChange}
                      idDealer={dealersCsv || null}
                      requireDealer
                      disabled={busy || locked || textOnly}
                      placeholder={t('expenses.selectEmployee')}
                    />
                  </FormControl>
                ) : (
                  <Input value={field.value?.nombre ?? userName ?? ''} disabled readOnly />
                )}
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
                      // D4: la última categoría de la compañía se precarga y queda editable.
                      if (c?.lastCategory) {
                        form.setValue('category', { id: c.lastCategory.id, name: c.lastCategory.name, active: c.lastCategory.active }, { shouldDirty: true })
                        form.clearErrors('category')
                      }
                    }}
                    disabled={busy || locked || textOnly}
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
                  <CatalogCombobox
                    dataField="category"
                    kind="categories"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={busy || locked || textOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="exp-description">{t('expenses.description')}</FormLabel>
                <FormControl>
                  <Input id="exp-description" maxLength={EXPENSE_LIMITS.description} disabled={busy || locked} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="receiptNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="exp-receipt">{t('expenses.receiptNumber')}</FormLabel>
                <FormControl>
                  <Input id="exp-receipt" maxLength={EXPENSE_LIMITS.receiptNumber} disabled={busy || locked} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="exp-notes">{t('expenses.notes')}</FormLabel>
                <FormControl>
                  <Textarea id="exp-notes" rows={3} maxLength={EXPENSE_LIMITS.notes} disabled={busy || locked} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="min-w-0 md:col-span-2">
            <div className="mb-2 text-sm font-medium">{t('expenses.attachment')}</div>
            <AttachmentPicker files={files} onChange={setFiles} disabled={busy || locked || Boolean(pendingUpload)} />
          </div>
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">{t('expenses.branches')}</h2>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <OptionTile
              dataField="mode"
              selected={!isMultiple}
              onSelect={() => setMode('single')}
              title={t('expenses.singleBranch')}
              description={t('expenses.singleBranchHint')}
              icon={Building2}
              disabled={tilesDisabled}
            />
            <OptionTile
              selected={isMultiple}
              onSelect={() => setMode(mode === 'single' ? 'equal' : mode)}
              title={t('expenses.multipleBranches')}
              description={t('expenses.multipleBranchesHint')}
              icon={Split}
              disabled={tilesDisabled}
            />
          </div>

          {!isMultiple ? (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="idDealer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('expenses.branch')}</FormLabel>
                    <FormControl>
                      <DealerCombobox
                        dataField="idDealer"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={busy || locked || textOnly || branchLocked}
                      />
                    </FormControl>
                    {branchLocked ? (
                      <p className="text-xs text-muted-foreground">{t('expenses.attachmentsLockBranch')}</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="exp-total">{t('expenses.totalAmount')}</FormLabel>
                    <FormControl>
                      <Input id="exp-total" inputMode="decimal" disabled={busy || locked || textOnly} className="tabular-nums" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="min-w-0 space-y-4">
              <div className="grid gap-1.5 sm:grid-cols-3">
                <OptionTile
                  selected={mode === 'equal'}
                  onSelect={() => setMode('equal')}
                  title={t('expenses.equal')}
                  description={t('expenses.equalHint')}
                  icon={Equal}
                  disabled={tilesDisabled}
                />
                <OptionTile
                  selected={mode === 'percent'}
                  onSelect={() => setMode('percent')}
                  title={t('expenses.byPercentage')}
                  description={t('expenses.byPercentageHint')}
                  icon={Percent}
                  disabled={tilesDisabled}
                />
                <OptionTile
                  selected={mode === 'amount'}
                  onSelect={() => setMode('amount')}
                  title={t('expenses.byAmount')}
                  description={t('expenses.byAmountHint')}
                  icon={Sigma}
                  disabled={tilesDisabled}
                />
              </div>

              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="branchIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.branches')}</FormLabel>
                      <FormControl>
                        <div data-field="branchIds" className="min-w-0">
                          <DealerMultiSelect
                            dealers={dealers}
                            value={field.value}
                            onChange={(next) => {
                              field.onChange(next)
                              // Entradas de los dealers que entran, sin pisar las que ya estaban.
                              const current = form.getValues('branches')
                              const merged = { ...current }
                              for (const id of next) if (!merged[id]) merged[id] = { percentage: '', amount: '' }
                              form.setValue('branches', merged)
                            }}
                            loading={dealersLoading}
                            disabled={busy || locked || textOnly}
                            placeholder={t('expenses.selectBranches')}
                            className="w-full"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mode !== 'amount' ? (
                  <FormField
                    control={form.control}
                    name="totalAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="exp-total">{t('expenses.totalAmount')}</FormLabel>
                        <FormControl>
                          <Input id="exp-total" inputMode="decimal" disabled={busy || locked || textOnly} className="tabular-nums" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="pt-6 text-xs text-muted-foreground">{t('expenses.byAmountHint')}</div>
                )}
              </div>

              {!isEdit ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPickerOpen(true)}>
                  <Repeat className="size-4" />
                  {t('expenses.useRecurringSplit')}
                </Button>
              ) : null}

              <ExpenseSplitTable disabled={busy || locked || textOnly} />
            </div>
          )}
        </section>

        {/* Barra de acciones: fija abajo en celular, en línea en escritorio. Los botones viven
            fuera del <form> en la práctica (fixed), por eso `form={FORM_ID}`. */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-20 flex items-center justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur',
            'md:static md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none',
          )}
        >
          <Button type="button" variant="outline" disabled={busy} onClick={() => router.push('/expenses')}>
            <X className="size-4" />
            {t('expenses.cancel')}
          </Button>
          {!pendingUpload ? (
            <Button type="submit" form={FORM_ID} disabled={busy || locked}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {busy ? t('expenses.saving') : t('expenses.save')}
            </Button>
          ) : null}
        </div>
      </form>

      <RecurringRulePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={applyRule} />
    </Form>
  )
}
