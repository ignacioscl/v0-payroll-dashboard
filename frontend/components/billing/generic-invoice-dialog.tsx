'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { ArrowRight, Clock, FilePlus, Loader2, Save, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  GenericInvoiceItems,
  fmtMoney,
  fmtNum,
  type GenericItemDraft,
  type GenericTtkDraft,
} from '@/components/billing/generic-invoice-items'
import { GenericTtkDialog } from '@/components/billing/generic-ttk-dialog'
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
  useGenericInvoice,
  useGenericInvoiceConfig,
  useGenericTtkEmployees,
  useUpdateGenericInvoice,
} from '@/hooks/use-generic-invoice'
import {
  applyDiscountCents,
  centsToPesos,
  invoiceTotalsCents,
} from '@/lib/billing/generic-invoice-money'
import {
  parseYmd,
  readInvGenericStored,
  resolveInvGenericDealer,
  storedDates,
  writeInvGenericStored,
} from '@/lib/billing/inv-generic-storage'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import {
  isGenericInvoiceApiError,
  type GenericCatalogItem,
  type GenericInvoiceDetail,
  type GenericInvoiceItemPayload,
  type GenericTtkEmployeeRow,
} from '@/lib/srs-generic-invoices-api'

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

const EYEBROW =
  'text-[10.5px] font-semibold uppercase tracking-[0.085em] text-muted-foreground leading-none'

const CTL = 'h-9 rounded-md bg-card'

function toHeaderNoteItem(name: string): GenericCatalogItem {
  return { id: 0, name, price: null, canDelete: false }
}

function parseTaxRate(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0 || n > 99.999) return null
  return n
}

function ymdOf(date: Date | undefined): string | null {
  return date ? format(date, 'yyyy-MM-dd') : null
}

function draftsFromDetail(detail: GenericInvoiceDetail): GenericItemDraft[] {
  return detail.items.map((item) => {
    if (item.kind === 'ttk') {
      return {
        kind: 'ttk',
        key: `ttk:${item.idEmployee}`,
        idRels: item.idRels,
        idEmployee: item.idEmployee,
        nombreEmployee: item.nombreEmployee,
        rolName: item.rolName,
        dptoName: item.dptoName,
        hoursReg: item.hoursReg,
        amountDealer: item.amountDealer,
        onlyTimecard: item.onlyTimecard,
        isPaid: item.isPaid,
      }
    }
    return {
      kind: 'free',
      key: `free:${item.idRel}`,
      idRel: item.idRel,
      description: item.description,
      qty: item.qty,
      unitAmount: item.unitAmount,
      isPaid: item.isPaid,
    }
  })
}

function ttkSnapshotMap(items: GenericItemDraft[]): Map<number, GenericTtkDraft> {
  const map = new Map<number, GenericTtkDraft>()
  for (const item of items) {
    if (item.kind === 'ttk' && item.idRels?.length) map.set(item.idEmployee, { ...item })
  }
  return map
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
  statementId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId?: number
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { selectedDealers } = useFilters()
  const { dealers, loading: dealersLoading } = useSrsDealers()
  const config = useGenericInvoiceConfig()
  const create = useCreateGenericInvoice()
  const update = useUpdateGenericInvoice(statementId ?? 0)
  const isEdit = statementId != null && statementId > 0
  const loaded = useGenericInvoice(statementId ?? null, open && isEdit)

  const [items, setItems] = React.useState<GenericItemDraft[]>([])
  const [itemDraftDirty, setItemDraftDirty] = React.useState(false)
  const [discardOpen, setDiscardOpen] = React.useState(false)
  const [dealerTerm, setDealerTerm] = React.useState('')
  const [headerTerm, setHeaderTerm] = React.useState('')
  const [debouncedHeader, setDebouncedHeader] = React.useState('')
  const [ttkOpen, setTtkOpen] = React.useState(false)
  const [pendingUncheck, setPendingUncheck] = React.useState<GenericTtkEmployeeRow | null>(null)
  const [baseline, setBaseline] = React.useState('')
  const [datesLocked, setDatesLocked] = React.useState(false)
  const ttkSnapshots = React.useRef(new Map<number, GenericTtkDraft>())
  const loadHandled = React.useRef(false)

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
  const dateFromYmd = ymdOf(dateFrom)
  const dateToYmd = ymdOf(dateTo)

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedHeader(headerTerm.trim()), 250)
    return () => window.clearTimeout(id)
  }, [headerTerm])

  const headerCatalog = useGenericCatalog(44, idDealer, debouncedHeader)
  const ttkList = useGenericTtkEmployees({
    idDealer,
    dateFrom: dateFromYmd,
    dateTo: dateToYmd,
    includeStatementId: isEdit ? statementId : undefined,
    enabled: open && idDealer != null && Boolean(dateFromYmd && dateToYmd),
  })

  const unbilledHoursByEmployee = React.useMemo(() => {
    const out: Record<number, number> = {}
    for (const row of ttkList.data?.rows ?? []) {
      if (row.alreadyOnInvoice && row.hoursUnbilledInRange > 0) {
        out[row.idEmployee] = row.hoursUnbilledInRange
      }
    }
    return out
  }, [ttkList.data])

  const captureBaseline = React.useCallback(
    (values: FormValues, nextItems: GenericItemDraft[]) => {
      setBaseline(
        JSON.stringify({
          dealer: values.dealer?.id ?? null,
          dateFrom: ymdOf(values.dateFrom),
          dateTo: ymdOf(values.dateTo),
          invoiceNote: values.invoiceNote,
          headerNote: values.headerNote,
          tax: values.tax,
          items: nextItems,
        }),
      )
    },
    [],
  )

  React.useEffect(() => {
    if (!open) {
      loadHandled.current = false
      return
    }
    if (isEdit) return
    const stored = readInvGenericStored()
    const dates = storedDates(stored)
    const values = {
      ...emptyValues,
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
      invoiceNote: stored?.note ?? '',
      headerNote: stored?.headerNote ?? '',
      tax: stored?.tax ?? '',
    }
    form.reset(values)
    setItems([])
    setItemDraftDirty(false)
    setDiscardOpen(false)
    setDealerTerm('')
    setHeaderTerm('')
    setDebouncedHeader('')
    setTtkOpen(false)
    setDatesLocked(false)
    ttkSnapshots.current = new Map()
    captureBaseline(values, [])
  }, [open, isEdit, form, captureBaseline])

  React.useEffect(() => {
    if (!open || isEdit) return
    if (form.getValues('dealer')) return
    const stored = readInvGenericStored()
    const preselected = resolveInvGenericDealer(dealers, selectedDealers, stored)
    if (preselected) form.setValue('dealer', preselected, { shouldDirty: false })
  }, [open, isEdit, dealers, selectedDealers, form])

  React.useEffect(() => {
    if (!open || !isEdit) return
    if (loaded.isLoading || loadHandled.current) return
    if (loaded.isError) {
      loadHandled.current = true
      const err = loaded.error
      toast.error(getSrsErrorMessage(err, t('invoices.generic.loadError')))
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
      return
    }
    const detail = loaded.data
    if (!detail) return
    loadHandled.current = true
    if (detail.statementPaid) {
      toast.error('This invoice has been paid and cannot be edited.')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
      return
    }
    const drafts = draftsFromDetail(detail)
    ttkSnapshots.current = ttkSnapshotMap(drafts)
    setDatesLocked(drafts.some((item) => item.kind === 'ttk' && Boolean(item.idRels?.length)))
    const values: FormValues = {
      dealer: { id: String(detail.idDealer), label: detail.dealerName },
      dateFrom: parseYmd(detail.dateFrom),
      dateTo: parseYmd(detail.dateTo),
      invoiceNote: detail.invoiceNote ?? '',
      headerNote: detail.headerNote ?? '',
      tax: detail.tax == null ? '' : String(detail.tax),
    }
    form.reset(values)
    setItems(drafts)
    setItemDraftDirty(false)
    captureBaseline(values, drafts)
  }, [open, isEdit, loaded.isLoading, loaded.isError, loaded.data, loaded.error, form, t, onOpenChange, queryClient, captureBaseline])

  const filteredDealers = React.useMemo(() => {
    const term = dealerTerm.trim().toLowerCase()
    if (!term) return dealers
    return dealers.filter((row) => row.label.toLowerCase().includes(term))
  }, [dealers, dealerTerm])

  const dealerOptions = React.useMemo(() => {
    if (!isEdit || !dealer) return filteredDealers
    if (filteredDealers.some((row) => row.id === dealer.id)) return filteredDealers
    return [dealer, ...filteredDealers]
  }, [isEdit, dealer, filteredDealers])

  const headerValue = React.useMemo(() => {
    const name = headerNote.trim()
    if (!name) return null
    const fromCatalog = (headerCatalog.data ?? []).find(
      (row) => row.name.trim().toLowerCase() === name.toLowerCase(),
    )
    return fromCatalog ?? toHeaderNoteItem(name)
  }, [headerNote, headerCatalog.data])

  const taxRate = parseTaxRate(taxRaw)
  const { subtotalCents, taxCents, totalCents } = invoiceTotalsCents(items, taxRate)
  const subtotal = centsToPesos(subtotalCents)
  const taxAmount = centsToPesos(taxCents)
  const discount = isEdit ? loaded.data?.discount ?? null : null
  const discountType = isEdit ? loaded.data?.discountType ?? null : null
  const discountDetail = isEdit ? loaded.data?.discountDetail ?? null : null
  const baseCents = subtotalCents + taxCents
  const discountedCents = isEdit
    ? applyDiscountCents(baseCents, discount, discountType)
    : totalCents
  const discountAmount = centsToPesos(baseCents - discountedCents)
  const total = centsToPesos(discountedCents)

  const busy = create.isPending || update.isPending
  const { isDirty: formDirty, errors } = form.formState
  const currentSerialized = JSON.stringify({
    dealer: dealer?.id ?? null,
    dateFrom: dateFromYmd,
    dateTo: dateToYmd,
    invoiceNote: form.watch('invoiceNote'),
    headerNote,
    tax: taxRaw,
    items,
  })
  const isDirty = (isEdit ? currentSerialized !== baseline : formDirty || items.length > 0) || itemDraftDirty
  const periodError = errors.dateFrom?.message ?? errors.dateTo?.message ?? ''
  const ttkEnabled = idDealer != null && Boolean(dateFromYmd && dateToYmd)

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

  const applyTtkToggle = (row: GenericTtkEmployeeRow, checked: boolean) => {
    if (checked) {
      const snap = ttkSnapshots.current.get(row.idEmployee)
      const next: GenericTtkDraft = snap
        ? { ...snap }
        : {
            kind: 'ttk',
            key: `ttk:${row.idEmployee}`,
            idEmployee: row.idEmployee,
            nombreEmployee: row.nombreEmployee,
            rolName: row.rolName,
            dptoName: row.dptoName,
            hoursReg: row.hoursReg,
            amountDealer: row.amountDealer,
            onlyTimecard: false,
          }
      setItems((prev) => (prev.some((item) => item.kind === 'ttk' && item.idEmployee === row.idEmployee)
        ? prev
        : [...prev, next]))
      return
    }
    setItems((prev) =>
      prev.filter((item) => !(item.kind === 'ttk' && item.idEmployee === row.idEmployee)),
    )
  }

  const onTtkToggle = (row: GenericTtkEmployeeRow, checked: boolean) => {
    if (!checked) {
      const current = items.find((item) => item.kind === 'ttk' && item.idEmployee === row.idEmployee)
      if (current?.kind === 'ttk' && current.idRels?.length) {
        setPendingUncheck(row)
        return
      }
    }
    applyTtkToggle(row, checked)
  }

  const handleConflict = async (err: unknown) => {
    if (!isGenericInvoiceApiError(err)) {
      toast.error(getSrsErrorMessage(err, t('invoices.generic.createError')))
      return
    }
    toast.error(err.message)
    if (err.status === 404 || err.code === 'STATEMENT_PAID') {
      closeNow()
      void queryClient.invalidateQueries({ queryKey: ['srs-invoices'] })
      return
    }
    if (err.code === 'LINE_PAID' && isEdit && statementId) {
      loadHandled.current = false
      await loaded.refetch()
    }
  }

  const onSubmit = async (values: FormValues) => {
    if (!values.dealer || !values.dateFrom || !values.dateTo) return
    if (items.length < 1) {
      toast.error(t('invoices.generic.itemsRequired'))
      return
    }
    const submittedTax = values.tax.trim()
    const payloadItems: GenericInvoiceItemPayload[] = items
      .filter((item) => !item.isPaid)
      .map((item) => {
        if (item.kind === 'ttk') {
          return {
            kind: 'ttk',
            idEmployee: item.idEmployee,
            ...(item.onlyTimecard ? { onlyTimecard: true } : {}),
          }
        }
        return {
          kind: 'free',
          ...(item.idRel != null ? { idRel: item.idRel } : {}),
          description: item.description,
          unitAmount: item.unitAmount,
          ...(item.qty != null ? { qty: item.qty } : {}),
        }
      })
    if (!isEdit) {
      writeInvGenericStored({
        idDealer: String(values.dealer.id),
        textDealer: values.dealer.label,
        date: format(values.dateFrom, 'yyyy-MM-dd'),
        dateto: format(values.dateTo, 'yyyy-MM-dd'),
        note: values.invoiceNote,
        headerNote: values.headerNote,
        tax: values.tax,
      })
    }
    try {
      if (isEdit && statementId) {
        const saved = await update.mutateAsync({
          dateFrom: format(values.dateFrom, 'yyyy-MM-dd'),
          dateTo: format(values.dateTo, 'yyyy-MM-dd'),
          invoiceNote: values.invoiceNote.trim() || undefined,
          headerNote: values.headerNote.trim() || undefined,
          tax: submittedTax === '' ? undefined : Number(submittedTax),
          items: payloadItems,
        })
        toast.success(t('invoices.generic.saved', { fullNro: saved.fullNro }))
        onOpenChange(false)
        return
      }
      const created = await create.mutateAsync({
        idDealer: Number(values.dealer.id),
        dateFrom: format(values.dateFrom, 'yyyy-MM-dd'),
        dateTo: format(values.dateTo, 'yyyy-MM-dd'),
        invoiceNote: values.invoiceNote.trim() || undefined,
        headerNote: values.headerNote.trim() || undefined,
        tax: submittedTax === '' ? undefined : Number(submittedTax),
        items: payloadItems,
      })
      toast.success(t('invoices.generic.created', { fullNro: created.fullNro }))
      onOpenChange(false)
    } catch (err) {
      await handleConflict(err)
    }
  }

  const selectedTtkIds = React.useMemo(() => {
    const ids = new Set<number>()
    for (const item of items) {
      if (item.kind === 'ttk') ids.add(item.idEmployee)
    }
    return ids
  }, [items])
  const paidTtkIds = React.useMemo(() => {
    const ids = new Set<number>()
    for (const item of items) {
      if (item.kind === 'ttk' && item.isPaid) ids.add(item.idEmployee)
    }
    return ids
  }, [items])

  const loadingEdit = isEdit && loaded.isLoading

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
              {isEdit
                ? t('invoices.generic.titleEdit', { fullNro: loaded.data?.fullNro ?? '' })
                : t('invoices.generic.title')}
            </DialogTitle>
          </DialogHeader>

          {loadingEdit ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <Form {...form}>
              <form
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
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
                              items={dealerOptions}
                              isLoading={dealersLoading}
                              getItemKey={(item) => item.id}
                              getItemLabel={(item) => item.label}
                              minSearchChars={0}
                              serverSideSearch
                              disabled={busy || isEdit}
                              className={`${CTL} py-0`}
                              placeholder={t('invoices.generic.dealerPlaceholder')}
                              searchPlaceholder={t('invoices.generic.dealerSearch')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                              disabled={busy || datesLocked}
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
                              disabled={busy || datesLocked}
                              fromDate={dateFrom}
                              className="h-7 min-w-0 flex-1 justify-start border-0 bg-transparent px-2 shadow-none hover:bg-muted focus-visible:ring-0 [&>svg]:hidden"
                            />
                          )}
                        />
                      </div>
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
                    unbilledHoursByEmployee={unbilledHoursByEmployee}
                    toolbarExtra={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || !ttkEnabled}
                        onClick={() => setTtkOpen(true)}
                      >
                        <Clock />
                        {t('invoices.generic.addTtk')}
                      </Button>
                    }
                  />
                </div>

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
                    {isEdit && discountAmount > 0 ? (
                      <div className="flex items-baseline justify-between gap-5 py-1 text-[13px] text-muted-foreground">
                        <span>
                          {t('invoices.generic.discount')}
                          {discountDetail ? (
                            <span className="text-muted-foreground/70"> ({discountDetail})</span>
                          ) : null}
                        </span>
                        <span className="font-mono text-[13.5px] tabular-nums text-foreground/70">
                          -{fmtNum(discountAmount)}
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-1.5 h-px bg-border" />
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
                      {busy ? (
                        <Loader2 className="animate-spin" />
                      ) : isEdit ? (
                        <Save />
                      ) : (
                        <FilePlus />
                      )}
                      {busy
                        ? isEdit
                          ? t('invoices.generic.saving')
                          : t('invoices.generic.creating')
                        : isEdit
                          ? t('invoices.generic.save')
                          : t('invoices.generic.create')}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
      <GenericTtkDialog
        open={ttkOpen}
        onOpenChange={setTtkOpen}
        idDealer={idDealer}
        dateFrom={dateFromYmd}
        dateTo={dateToYmd}
        includeStatementId={isEdit ? statementId : undefined}
        selectedIds={selectedTtkIds}
        paidIds={paidTtkIds}
        onToggle={onTtkToggle}
      />
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
      <ConfirmActionDialog
        open={pendingUncheck != null}
        onOpenChange={(next) => {
          if (!next) setPendingUncheck(null)
        }}
        tone="danger"
        title={t('invoices.generic.removeConfirmTitle')}
        description={t('invoices.generic.removeConfirm', {
          name: pendingUncheck?.nombreEmployee ?? '',
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.remove')}
        onConfirm={() => {
          if (pendingUncheck) applyTtkToggle(pendingUncheck, false)
          setPendingUncheck(null)
        }}
      />
    </>
  )
}
