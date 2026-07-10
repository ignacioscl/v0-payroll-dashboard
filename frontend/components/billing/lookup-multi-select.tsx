'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'

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

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'mr-2 flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
        checked ? 'border-primary bg-primary text-white' : 'border-muted-foreground/60 bg-background',
      )}
      aria-hidden
    >
      {checked ? <Check className="size-3 stroke-[3] text-white" /> : null}
    </span>
  )
}

interface LookupMultiSelectProps {
  options: LookupOption[]
  value: number[]
  onChange: (value: number[]) => void
  onSearchChange: (term: string) => void
  placeholder?: string
  emptyLabel?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  onOpenChange?: (open: boolean) => void
}

export function LookupMultiSelect({
  options,
  value,
  onChange,
  onSearchChange,
  placeholder,
  emptyLabel,
  loading = false,
  disabled = false,
  className,
  onOpenChange,
}: LookupMultiSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => onSearchChange(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search, open, onSearchChange])

  const label = useMemo(() => {
    if (value.length === 0) return placeholder ?? t('common.searchPlaceholder')
    if (value.length === 1) {
      const hit = options.find((o) => o.id === value[0])
      return hit?.label ?? t('invoices.filterOneSelected')
    }
    return t('invoices.filterManySelected', { count: value.length })
  }, [options, placeholder, t, value])

  const handleOpenChange = (next: boolean) => {
    if (disabled) return
    onOpenChange?.(next)
    if (next) {
      setDraft([...value])
      setSearch('')
      onSearchChange('')
      setOpen(true)
      return
    }
    setOpen(false)
    const same =
      draft.length === value.length && draft.every((id) => value.includes(id))
    if (!same) onChange(draft)
  }

  const toggle = (id: number) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'inline-flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-3 text-xs font-normal text-foreground shadow-xs transition-colors',
            'hover:bg-muted/30 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className="min-w-0 truncate text-foreground">
            {loading && open ? t('common.loading') : label}
          </span>
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
          <CommandList className="max-h-[240px]">
            <CommandEmpty>{emptyLabel ?? t('common.noRecords')}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = draft.includes(opt.id)
                return (
                  <CommandItem
                    key={opt.id}
                    value={String(opt.id)}
                    onSelect={() => toggle(opt.id)}
                    className="cursor-pointer text-xs"
                  >
                    <RowCheckbox checked={checked} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{opt.label}</span>
                      {opt.sublabel ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {opt.sublabel}
                        </span>
                      ) : null}
                    </span>
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
