'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { ArrowRight, FilePlus, Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  GenericInvoiceItems,
  fmtMoney,
  fmtNum,
  lineTotal,
  round2,
  type GenericItemDraft,
} from '@/components/billing/generic-invoice-items'
import { DatePicker } from '@/components/filters/date-picker'
import type { DealerOption } from '@/components/filters/types'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import {
  useCreateGenericInvoice,
  useGenericCatalog,
  useGenericInvoiceConfig,
} from '@/hooks/use-generic-invoice'
import {
  readInvGenericStored,
  resolveInvGenericDealer,
  storedDates,
  writeInvGenericStored,
} from '@/lib/billing/inv-generic-storage'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { GenericCatalogItem } from '@/lib/srs-generic-invoices-api'

type FormValues = {
  dealer: DealerOption | null
  dateFrom: Date | undefined
  dateTo: Date | undefined
  invoiceNote: string
  headerNote: string
  tax: string
}

const emptyValues: FormValues = {
  dealer: null,
  dateFrom: undefined,
  dateTo: undefined,
  invoiceNote: '',
  headerNote: '',
  tax: '',
}

/** Micro-caps field label — same instrument as the ledger head. */
const EYEBROW =
  'text-[10.5px] font-semibold uppercase tracking-[0.085em] text-muted-foreground leading-none'

/** One height, one radius, one ground — every control in the masthead agrees. */
const CTL = 'h-9 rounded-md bg-card'

function toHeaderNoteItem(name: string): GenericCatalogItem {
  return { id: 0, name, price: null, canDelete: false }
}

/** Tax rate as a number, or null when blank/invalid — mirrors the Zod rule. */
function parseTaxRate(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0 || n > 99.999) return null
  return n
}

function createSchema(messages: {
  dealerRequired: string
  datesRequired: string
  dateOrder: string
  taxInvalid: string
}) {
  return z
    .object({
      dealer: z.custom<DealerOption | null>(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      invoiceNote: z.string().max(255),
      headerNote: z.string().max(2048),
      tax: z.string(),
    })
    .superRefine((data, ctx) => {
      if (!data.dealer || Number(data.dealer.id) < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.dealerRequired,
          path: ['dealer'],
        })
      }
      if (!data.dateFrom || !data.dateTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.datesRequired,
          path: data.dateFrom ? ['dateTo'] : ['dateFrom'],
        })
      } else if (data.dateTo < data.dateFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.dateOrder,
          path: ['dateTo'],
        })
      }
      const taxRaw = data.tax.trim()
      if (taxRaw !== '') {
        const n = Number(taxRaw)
        if (!Number.isFinite(n) || n < 0 || n > 99.999) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.taxInvalid,
            path: ['tax'],
          })
        }
      }
    })
}

export function GenericInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { selectedDealers } = useFilters()
  const { dealers, loading: dealersLoading } = useSrsDealers()
  const config = useGenericInvoiceConfig()
  const create = useCreateGenericInvoice()

  const [items, setItems] = React.useState<GenericItemDraft[]>([])
  const [itemDraftDirty, setItemDraftDirty] = React.useState(false)
  const [discardOpen, setDiscardOpen] = React.useState(false)
  const [dealerTerm, setDealerTerm] = React.useState('')
  const [headerTerm, setHeaderTerm] = React.useState('')
  const [debouncedHeader, setDebouncedHeader] = React.useState('')

  const schema = React.useMemo(
    () =>
      createSchema({
        dealerRequired: t('invoices.generic.dealerRequired'),
        datesRequired: t('invoices.generic.datesRequired'),
        dateOrder: t('invoices.generic.dateOrder'),
        taxInvalid: t('invoices.generic.taxInvalid'),
      }),
    [t],
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
    mode: 'onSubmit',
  })

  const dealer = form.watch('dealer')
  const dateFrom = form.watch('dateFrom')
  const dateTo = form.watch('dateTo')
  const headerNote = form.watch('headerNote')
  const taxRaw = form.watch('tax')
  const idDealer = dealer && Number(dealer.id) > 0 ? Number(dealer.id) : null

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedHeader(headerTerm.trim()), 250)
    return () => window.clearTimeout(id)
  }, [headerTerm])

  const headerCatalog = useGenericCatalog(44, idDealer, debouncedHeader)

  React.useEffect(() => {
    if (!open) return
    const stored = readInvGenericStored()
    const dates = storedDates(stored)
    form.reset({
      ...emptyValues,
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
      invoiceNote: stored?.note ?? '',
      headerNote: stored?.headerNote ?? '',
      tax: stored?.tax ?? '',
    })
    setItems([])
    setItemDraftDirty(false)
    setDiscardOpen(false)
    setDealerTerm('')
    setHeaderTerm('')
    setDebouncedHeader('')
  }, [open, form])

  React.useEffect(() => {
    if (!open) return
    if (form.getValues('dealer')) return
    const stored = readInvGenericStored()
    const preselected = resolveInvGenericDealer(dealers, selectedDealers, stored)
    if (preselected) form.setValue('dealer', preselected, { shouldDirty: false })
  }, [open, dealers, selectedDealers, form])

  const filteredDealers = React.useMemo(() => {
    const term = dealerTerm.trim().toLowerCase()
    if (!term) return dealers
    return dealers.filter((row) => row.label.toLowerCase().includes(term))
  }, [dealers, dealerTerm])

  const headerValue = React.useMemo(() => {
    const name = headerNote.trim()
    if (!name) return null
    const fromCatalog = (headerCatalog.data ?? []).find(
      (row) => row.name.trim().toLowerCase() === name.toLowerCase(),
    )
    return fromCatalog ?? toHeaderNoteItem(name)
  }, [headerNote, headerCatalog.data])

  // The running document: what the invoice is worth, before it is committed.
  // Rounding mirrors backend generic-invoice.repository.ts exactly — the subtotal is
  // rounded once from unrounded lines, then tax, then the grand total.
  const subtotal = React.useMemo(
    () => round2(items.reduce((sum, item) => sum + lineTotal(item), 0)),
    [items],
  )
  const taxRate = parseTaxRate(taxRaw)
  const taxAmount = taxRate != null && taxRate > 0 ? round2(subtotal * (taxRate / 100)) : 0
  const total = round2(subtotal + taxAmount)

  const busy = create.isPending
  const { isDirty: formDirty, errors } = form.formState
  const isDirty = formDirty || items.length > 0 || itemDraftDirty
  const periodError = errors.dateFrom?.message ?? errors.dateTo?.message ?? ''

  const closeNow = React.useCallback(() => {
    setDiscardOpen(false)
    onOpenChange(false)
  }, [onOpenChange])

  const requestClose = React.useCallback(() => {
    if (busy) return
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    closeNow()
  }, [busy, isDirty, closeNow])

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    requestClose()
  }

  const onSubmit = async (values: FormValues) => {
    if (!values.dealer || !values.dateFrom || !values.dateTo) return
    if (items.length < 1) {
      toast.error(t('invoices.generic.itemsRequired'))
      return
    }
    const submittedTax = values.tax.trim()
    writeInvGenericStored({
      idDealer: String(values.dealer.id),
      textDealer: values.dealer.label,
      date: format(values.dateFrom, 'yyyy-MM-dd'),
      dateto: format(values.dateTo, 'yyyy-MM-dd'),
      note: values.invoiceNote,
      headerNote: values.headerNote,
      tax: values.tax,
    })
    try {
      const created = await create.mutateAsync({
        idDealer: Number(values.dealer.id),
        dateFrom: format(values.dateFrom, 'yyyy-MM-dd'),
        dateTo: format(values.dateTo, 'yyyy-MM-dd'),
        invoiceNote: values.invoiceNote.trim() || undefined,
        headerNote: values.headerNote.trim() || undefined,
        tax: submittedTax === '' ? undefined : Number(submittedTax),
        items: items.map((item) => ({
          description: item.description,
          unitAmount: item.unitAmount,
          ...(item.qty != null ? { qty: item.qty } : {}),
        })),
      })
      toast.success(t('invoices.generic.created', { fullNro: created.fullNro }))
      onOpenChange(false)
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('invoices.generic.createError')))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,65rem)]"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-[19px] font-semibold tracking-[-0.015em]">
              {t('invoices.generic.title')}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* Masthead — one 12-column grid governs both rows, so everything aligns. */}
                <div className="grid grid-cols-12 items-start gap-x-4 gap-y-2 px-6 pb-5">
                  <FormField
                    control={form.control}
                    name="dealer"
                    render={({ field }) => (
                      <FormItem className="col-span-12 gap-1.5 md:col-span-5">
                        <FormLabel className={EYEBROW}>
                          {t('invoices.generic.dealer')}
                        </FormLabel>
                        <FormControl>
                          <SearchableCombobox<DealerOption>
                            value={field.value}
                            onChange={field.onChange}
                            searchTerm={dealerTerm}
                            onSearchTermChange={setDealerTerm}
                            items={filteredDealers}
                            isLoading={dealersLoading}
                            getItemKey={(item) => item.id}
                            getItemLabel={(item) => item.label}
                            minSearchChars={0}
                            serverSideSearch
                            disabled={busy}
                            className={`${CTL} py-0`}
                            placeholder={t('invoices.generic.dealerPlaceholder')}
                            searchPlaceholder={t('invoices.generic.dealerSearch')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Service period — two DatePickers, one shell. It reads as the one
                      thing it is: a period. The controls underneath are unchanged. */}
                  <div className="col-span-12 grid content-start gap-1.5 md:col-span-5">
                    <span className={EYEBROW}>{t('invoices.generic.servicePeriod')}</span>
                    <div
                      className={`${CTL} flex items-center border border-input px-1 shadow-xs transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/30`}
                    >
                      <FormField
                        control={form.control}
                        name="dateFrom"
                        render={({ field }) => (
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            disabled={busy}
                            toDate={dateTo}
                            className="h-7 min-w-0 flex-1 justify-start border-0 bg-transparent px-2 shadow-none hover:bg-muted focus-visible:ring-0"
                          />
                        )}
                      />
                      <ArrowRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground/40"
                      />
                      <FormField
                        control={form.control}
                        name="dateTo"
                        render={({ field }) => (
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            disabled={busy}
                            fromDate={dateFrom}
                            className="h-7 min-w-0 flex-1 justify-start border-0 bg-transparent px-2 shadow-none hover:bg-muted focus-visible:ring-0 [&>svg]:hidden"
                          />
                        )}
                      />
                    </div>
                    {/* Always occupies a line — an error here must not move the row. */}
                    <p
                      className={`min-h-5 text-xs leading-5 ${periodError ? 'text-destructive' : 'invisible'}`}
                    >
                      {periodError || ' '}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="tax"
                    render={({ field }) => (
                      <FormItem className="col-span-4 gap-1.5 md:col-span-2">
                        <FormLabel className={EYEBROW}>
                          {t('invoices.generic.tax')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={99.999}
                            step="0.001"
                            disabled={busy}
                            className={`${CTL} text-right font-mono tabular-nums`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="headerNote"
                    render={({ field }) => (
                      <FormItem className="col-span-12 gap-1.5 md:col-span-5">
                        <FormLabel className={EYEBROW}>
                          {t('invoices.generic.headerNote')}
                        </FormLabel>
                        <FormControl>
                          <SearchableCombobox<GenericCatalogItem>
                            value={headerValue}
                            onChange={(item) => field.onChange(item?.name ?? '')}
                            searchTerm={headerTerm}
                            onSearchTermChange={setHeaderTerm}
                            items={headerCatalog.data ?? []}
                            isLoading={headerCatalog.isFetching}
                            getItemKey={(item) =>
                              item.id > 0 ? item.id : `custom:${item.name}`
                            }
                            getItemLabel={(item) => item.name}
                            minSearchChars={0}
                            serverSideSearch
                            disabled={busy}
                            className={`${CTL} py-0`}
                            placeholder={t('invoices.generic.headerNotePlaceholder')}
                            searchPlaceholder={t('invoices.generic.headerNotePlaceholder')}
                            emptyTitle={t('invoices.generic.catalogEmpty')}
                            createCustomItem={toHeaderNoteItem}
                            createItemLabel={(term) =>
                              t('invoices.generic.useCustom', { term })
                            }
                            prerequisite={{
                              met: idDealer != null,
                              title: t('invoices.generic.dealer'),
                              description: t('invoices.generic.pickDealerFirst'),
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoiceNote"
                    render={({ field }) => (
                      <FormItem className="col-span-12 gap-1.5 md:col-span-7">
                        <FormLabel className={EYEBROW}>
                          {t('invoices.generic.invoiceNote')}
                        </FormLabel>
                        <FormControl>
                          {/* Sits at 36px like every other control, grows only if the note does. */}
                          <Textarea
                            {...field}
                            rows={1}
                            maxLength={255}
                            disabled={busy}
                            className="min-h-9 resize-none rounded-md bg-card py-2"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <GenericInvoiceItems
                  items={items}
                  onChange={setItems}
                  idDealer={idDealer}
                  canDeleteCatalogItem={Boolean(config.data?.canDeleteCatalogItem)}
                  disabled={busy}
                  onDraftDirtyChange={setItemDraftDirty}
                />
              </div>

              {/* The ledger foot. Pinned, so the figure the invoice is worth is never
                  off-screen. Right edge lands on the ledger's own Amount column. */}
              <div className="border-t border-border pt-4 pr-4 pl-4 sm:pr-[100px] sm:pl-6">
                <div className="ml-auto w-full sm:w-[312px]">
                  <div className="flex items-baseline justify-between gap-5 py-1 text-[13px] text-muted-foreground">
                    <span>{t('invoices.generic.subtotal')}</span>
                    <span className="font-mono text-[13.5px] tabular-nums text-foreground/70">
                      {fmtNum(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-5 py-1 text-[13px] text-muted-foreground">
                    <span className="flex items-baseline gap-1.5">
                      {t('invoices.generic.taxRow')}
                      <span className="font-mono text-[11.5px] text-muted-foreground/70">
                        {taxRate == null ? '0%' : `${taxRate}%`}
                      </span>
                    </span>
                    <span className="font-mono text-[13.5px] tabular-nums text-foreground/70">
                      {fmtNum(taxAmount)}
                    </span>
                  </div>
                  {/* Single rule closes the addition… */}
                  <div className="mt-1.5 h-px bg-border" />
                  {/* …and the double rule marks the figure as final. */}
                  <div className="mt-2.5 flex items-baseline justify-between gap-5 border-b-[3px] border-double border-primary pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                      {t('invoices.generic.total')}
                    </span>
                    <span
                      className={`font-mono text-[27px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
                        items.length === 0 ? 'text-muted-foreground/40' : 'text-primary'
                      }`}
                    >
                      {fmtMoney(total)}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter className="px-6 pt-4 pb-5 sm:items-center sm:justify-between">
                <span className="hidden text-xs text-muted-foreground/70 sm:inline">
                  {t('invoices.generic.addItemHint')}
                </span>
                <div className="flex gap-2 sm:ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={requestClose}
                  >
                    <X />
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <FilePlus />}
                    {busy ? t('invoices.generic.creating') : t('invoices.generic.create')}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        tone="warning"
        title={t('invoices.generic.discardTitle')}
        description={t('invoices.generic.discardConfirm')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.discardAction')}
        onConfirm={closeNow}
      />
    </>
  )
}
