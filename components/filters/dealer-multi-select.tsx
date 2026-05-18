'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { DealerOption } from './types'

interface DealerMultiSelectProps {
  dealers: DealerOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  allSelectedLabel?: string
  emptyLabel?: string
  className?: string
  maxHeight?: string
}

export function DealerMultiSelect({
  dealers,
  value,
  onChange,
  placeholder = 'Dealers',
  allSelectedLabel = 'All Dealers',
  emptyLabel = 'No dealers found.',
  className,
  maxHeight = 'max-h-[280px]',
}: DealerMultiSelectProps) {
  const [open, setOpen] = useState(false)

  const allIds = useMemo(() => dealers.map((d) => d.id), [dealers])
  const allSelected = dealers.length > 0 && value.length === dealers.length
  const noneSelected = value.length === 0

  const label = useMemo(() => {
    if (dealers.length === 0) return placeholder
    if (allSelected) return allSelectedLabel
    if (noneSelected) return placeholder
    if (value.length === 1) {
      return dealers.find((d) => d.id === value[0])?.label ?? `${value.length} dealer`
    }
    return `${value.length} dealers`
  }, [allSelected, allSelectedLabel, dealers, noneSelected, placeholder, value])

  const toggleDealer = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  const selectAll = () => onChange([...allIds])
  const clearAll = () => onChange([])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'min-w-[200px] justify-between border-border bg-background/50 font-normal text-foreground hover:bg-background hover:text-foreground',
            className
          )}
        >
          <span className="truncate text-foreground">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search dealers..." className="h-9" />
          <CommandList className={maxHeight}>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => (allSelected ? clearAll() : selectAll())}
                className="cursor-pointer data-[selected=true]:text-foreground"
              >
                <Checkbox
                  checked={allSelected}
                  className="pointer-events-none mr-2"
                  aria-hidden
                />
                <span className="font-medium">{allSelectedLabel}</span>
                {allSelected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {dealers.map((dealer) => {
                const checked = value.includes(dealer.id)
                return (
                  <CommandItem
                    key={dealer.id}
                    value={dealer.label}
                    onSelect={() => toggleDealer(dealer.id)}
                    className="cursor-pointer data-[selected=true]:text-foreground"
                  >
                    <Checkbox
                      checked={checked}
                      className="pointer-events-none mr-2"
                      aria-hidden
                    />
                    <span className="truncate">{dealer.label}</span>
                    {checked && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
