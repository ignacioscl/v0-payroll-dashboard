'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { FilePlus, Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  GenericInvoiceItems,
  type GenericItemDraft,
} from '@/components/billing/generic-invoice-items'
import { DatePicker } from '@/components/filters/date-picker'
import type { DealerOption } from '@/components/filters/types'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Button } from '@/components/ui/button'
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

function toHeaderNoteItem(name: string): GenericCatalogItem {
  return { id: 0, name, price: null, canDelete: false }
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
    setDealerTerm('')
    setHeaderTerm('')
    setDebouncedHeader('')
  }, [open, form])

  React.useEffect(() => {
    if (!open) return
    if (form.getValues('dealer')) return
    const stored = readInvGenericStored()
    const preselected = resolveInvGenericDealer(dealers, selectedDealers, stored)
    if (preselected) form.setValue('dealer', preselected)
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
  const busy = create.isPending

  const onSubmit = async (values: FormValues) => {
    if (!values.dealer || !values.dateFrom || !values.dateTo) return
    if (items.length < 1) {
      toast.error(t('invoices.generic.itemsRequired'))
      return
    }
    const taxRaw = values.tax.trim()
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
        tax: taxRaw === '' ? undefined : Number(taxRaw),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-[min(96vw,72rem)]">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle>{t('invoices.generic.title')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
              <div className="grid items-start gap-3 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="dealer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('invoices.generic.dealer')}</FormLabel>
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
                          placeholder={t('invoices.generic.dealerPlaceholder')}
                          searchPlaceholder={t('invoices.generic.dealerSearch')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('invoices.generic.dateFrom')}</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          disabled={busy}
                          toDate={dateTo}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('invoices.generic.dateTo')}</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          disabled={busy}
                          fromDate={dateFrom}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
                <FormField
                  control={form.control}
                  name="invoiceNote"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('invoices.generic.invoiceNote')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={2}
                          maxLength={255}
                          disabled={busy}
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
                    <FormItem>
                      <FormLabel>{t('invoices.generic.headerNote')}</FormLabel>
                      <FormControl>
                        <SearchableCombobox<GenericCatalogItem>
                          value={headerValue}
                          onChange={(item) => field.onChange(item?.name ?? '')}
                          searchTerm={headerTerm}
                          onSearchTermChange={setHeaderTerm}
                          items={headerCatalog.data ?? []}
                          isLoading={headerCatalog.isFetching}
                          getItemKey={(item) => (item.id > 0 ? item.id : `custom:${item.name}`)}
                          getItemLabel={(item) => item.name}
                          minSearchChars={0}
                          serverSideSearch
                          disabled={busy}
                          placeholder={t('invoices.generic.headerNotePlaceholder')}
                          searchPlaceholder={t('invoices.generic.headerNotePlaceholder')}
                          emptyTitle={t('invoices.generic.catalogEmpty')}
                          createCustomItem={toHeaderNoteItem}
                          createItemLabel={(term) => t('invoices.generic.useCustom', { term })}
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
                  name="tax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('invoices.generic.tax')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={99.999}
                          step="0.001"
                          disabled={busy}
                          {...field}
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
              />
            </div>

            <DialogFooter className="border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                <X />
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <FilePlus />}
                {busy ? t('invoices.generic.creating') : t('invoices.generic.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
