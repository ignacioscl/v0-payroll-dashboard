'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { LookupOption } from '@/lib/invoice-advanced-filters'
import { useTranslation } from '@/lib/i18n/locale-context'

interface LookupSingleSelectProps {
  options: LookupOption[]
  value: number | null
  selectedLabel?: string | null
  onChange: (next: { id: number; label: string } | null) => void
  onSearchChange: (term: string) => void
  placeholder?: string
  emptyLabel?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  onOpenChange?: (open: boolean) => void
}

export function LookupSingleSelect({
  options,
  value,
  selectedLabel,
  onChange,
  onSearchChange,
  placeholder,
  emptyLabel,
  loading = false,
  disabled = false,
  className,
  onOpenChange,
}: LookupSingleSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => onSearchChange(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search, open, onSearchChange])

  const label = useMemo(() => {
    if (value == null) return placeholder ?? t('common.searchPlaceholder')
    const hit = options.find((o) => o.id === value)
    return hit?.label ?? selectedLabel ?? t('invoices.filterOneSelected')
  }, [options, placeholder, selectedLabel, t, value])

  const handleOpenChange = (next: boolean) => {
    if (disabled) return
    onOpenChange?.(next)
    if (next) {
      setSearch('')
      onSearchChange('')
      setOpen(true)
      return
    }
    setOpen(false)
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-3 text-xs font-normal text-foreground shadow-xs transition-colors',
              'hover:bg-muted/30 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
              value == null && 'text-muted-foreground',
            )}
          >
            <span className="min-w-0 truncate">{loading && open ? t('common.loading') : label}</span>
            {loading && open ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t('common.searchPlaceholder')}
              value={search}
              onValueChange={setSearch}
              className="text-xs"
            />
            <CommandList>
              <CommandEmpty>{emptyLabel ?? t('combobox.noResults')}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const selected = opt.id === value
                  return (
                    <CommandItem
                      key={opt.id}
                      value={String(opt.id)}
                      onSelect={() => {
                        onChange({ id: opt.id, label: opt.label })
                        handleOpenChange(false)
                      }}
                      className="cursor-pointer text-xs"
                    >
                      <Check
                        className={cn('mr-2 size-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                      />
                      <span className="min-w-0 truncate">{opt.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value != null ? (
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('common.clear')}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
