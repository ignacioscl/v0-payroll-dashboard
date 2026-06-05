'use client'

import { DollarSign } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PaymentTypeCatalogItem, PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
} from '@/lib/ttk/payment-type-filter'
import { cn } from '@/lib/utils'

interface PaymentTypeFilterProps {
  value: PaymentTypeFilterValue
  onChange: (value: PaymentTypeFilterValue) => void
  options: PaymentTypeCatalogItem[]
  loading?: boolean
  className?: string
}

function toSelectValue(value: PaymentTypeFilterValue): string {
  if (value === PAYMENT_TYPE_FILTER_ALL) return PAYMENT_TYPE_FILTER_ALL
  if (value === PAYMENT_TYPE_FILTER_WITHOUT) return PAYMENT_TYPE_FILTER_WITHOUT
  return String(value)
}

function fromSelectValue(raw: string): PaymentTypeFilterValue {
  if (raw === PAYMENT_TYPE_FILTER_ALL) return PAYMENT_TYPE_FILTER_ALL
  if (raw === PAYMENT_TYPE_FILTER_WITHOUT) return PAYMENT_TYPE_FILTER_WITHOUT
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : PAYMENT_TYPE_FILTER_ALL
}

export function PaymentTypeFilter({
  value,
  onChange,
  options,
  loading = false,
  className,
}: PaymentTypeFilterProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        Payment type
      </span>
      <Select
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        disabled={loading}
      >
        <SelectTrigger
          size="sm"
          className="h-7 min-w-[140px] max-w-[220px] px-2 text-[11px]"
          aria-label="Filter by payment type"
        >
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PAYMENT_TYPE_FILTER_ALL} className="text-xs">
            All types
          </SelectItem>
          <SelectItem value={PAYMENT_TYPE_FILTER_WITHOUT} className="text-xs">
            Without payment type
          </SelectItem>
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={String(option.id)}
              className="text-xs"
              title={option.title || undefined}
            >
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
