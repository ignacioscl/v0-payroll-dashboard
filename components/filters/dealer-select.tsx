'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DealerOption } from './types'

interface DealerSelectProps {
  dealers: DealerOption[]
  value: string
  onValueChange: (value: string) => void
  includeAll?: boolean
  allLabel?: string
  allValue?: string
  placeholder?: string
  className?: string
  triggerClassName?: string
}

export function DealerSelect({
  dealers,
  value,
  onValueChange,
  includeAll = true,
  allLabel = 'All Dealers',
  allValue = 'all',
  placeholder = 'Dealer',
  className,
  triggerClassName,
}: DealerSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          'w-[160px] border-border bg-background/50 focus:bg-background transition-colors',
          triggerClassName,
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value={allValue}>{allLabel}</SelectItem>}
        {dealers.map((dealer) => (
          <SelectItem key={dealer.id} value={dealer.id}>
            {dealer.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
