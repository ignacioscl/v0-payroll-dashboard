'use client'

import { Search } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InvoiceTypeFilter, type InvoiceTypeState } from '@/components/billing/invoice-type-filter'
import { useTranslation } from '@/lib/i18n/locale-context'

type TriState = 'all' | '1' | '0'

/**
 * Unified filter deck — statement types + search + payment/sent status in one card.
 */
export function InvoiceFilterDeck({
  types,
  onTypesChange,
  searchInput,
  onSearchChange,
  payed,
  onPayedChange,
  sended,
  onSendedChange,
  disabled,
}: {
  types: InvoiceTypeState
  onTypesChange: (next: InvoiceTypeState) => void
  searchInput: string
  onSearchChange: (value: string) => void
  payed: TriState
  onPayedChange: (value: TriState) => void
  sended: TriState
  onSendedChange: (value: TriState) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
        <InvoiceTypeFilter value={types} onChange={onTypesChange} disabled={disabled} />

        <Separator orientation="vertical" className="hidden h-8 lg:block" />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 lg:justify-end">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('invoices.searchPlaceholder')}
              className="h-8 pl-8 text-xs"
              disabled={disabled}
            />
          </div>

          <Select value={payed} onValueChange={(v) => onPayedChange(v as TriState)} disabled={disabled}>
            <SelectTrigger
              className="h-8 w-[130px] text-xs"
              aria-label={t('invoices.paymentLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('invoices.paymentAll')}</SelectItem>
              <SelectItem value="1">{t('invoices.paymentPaid')}</SelectItem>
              <SelectItem value="0">{t('invoices.paymentUnpaid')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sended} onValueChange={(v) => onSendedChange(v as TriState)} disabled={disabled}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={t('invoices.sentLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('invoices.sentAll')}</SelectItem>
              <SelectItem value="1">{t('invoices.sentYes')}</SelectItem>
              <SelectItem value="0">{t('invoices.sentNo')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
