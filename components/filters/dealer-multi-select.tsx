'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useTranslation } from '@/lib/i18n/locale-context'

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'mr-2 flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
        checked
          ? 'border-primary bg-primary text-white'
          : 'border-muted-foreground/60 bg-background',
      )}
      aria-hidden
    >
      {checked ? <Check className="size-3 stroke-[3] text-white" /> : null}
    </span>
  )
}

interface DealerMultiSelectProps {
  dealers: DealerOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  allSelectedLabel?: string
  emptyLabel?: string
  className?: string
  maxHeight?: string
  loading?: boolean
  disabled?: boolean
}

export function DealerMultiSelect({
  dealers,
  value,
  onChange,
  placeholder,
  allSelectedLabel,
  emptyLabel,
  className,
  maxHeight = 'max-h-[280px]',
  loading = false,
  disabled = false,
}: DealerMultiSelectProps) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('dealer.labelPlural')
  const resolvedAllLabel = allSelectedLabel ?? t('dealer.all')
  const resolvedEmptyLabel = emptyLabel ?? t('dealer.noneFound')

  const [open, setOpen] = useState(false)

  const allIds = useMemo(() => dealers.map((d) => d.id), [dealers])
  const allSelected = dealers.length > 0 && allIds.every((id) => value.includes(id))
  const noneSelected = value.length === 0

  const label = useMemo(() => {
    if (dealers.length === 0) return resolvedPlaceholder
    if (allSelected) return resolvedAllLabel
    if (noneSelected) return resolvedPlaceholder
    if (value.length === 1) {
      return dealers.find((d) => d.id === value[0])?.label ?? t('dealer.oneSelected')
    }
    return t('dealer.manySelected', { count: value.length })
  }, [allSelected, dealers, noneSelected, resolvedAllLabel, resolvedPlaceholder, t, value])

  const toggleDealer = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  const toggleAll = () => {
    onChange(allSelected ? [] : [...allIds])
  }

  const handleRowMouseDown = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'min-w-[200px] justify-between border-border bg-background/50 font-normal text-foreground hover:bg-background hover:text-foreground',
            className,
          )}
        >
          <span className="truncate text-foreground">
            {loading ? t('dealer.loading') : label}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('dealer.searchPlaceholder')} className="h-9" />
          <CommandList className={maxHeight}>
            <CommandEmpty>{resolvedEmptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__select_all__"
                onSelect={() => {}}
                onMouseDown={handleRowMouseDown(toggleAll)}
                className="cursor-pointer data-[selected=true]:text-foreground"
              >
                <RowCheckbox checked={allSelected} />
                <span className="font-medium">{resolvedAllLabel}</span>
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
                    onSelect={() => {}}
                    onMouseDown={handleRowMouseDown(() => toggleDealer(dealer.id))}
                    className="cursor-pointer data-[selected=true]:text-foreground"
                  >
                    <RowCheckbox checked={checked} />
                    <span className="truncate">{dealer.label}</span>
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
