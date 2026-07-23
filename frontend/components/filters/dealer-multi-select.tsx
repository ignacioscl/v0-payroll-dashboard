'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
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

function sortDealersCheckedFirst(
  dealers: DealerOption[],
  selectedIds: string[],
): DealerOption[] {
  if (
    selectedIds.length === 0 ||
    dealers.length === 0 ||
    selectedIds.length === dealers.length
  ) {
    return dealers
  }
  const selected = new Set(selectedIds)
  return [...dealers].sort((a, b) => {
    const aChecked = selected.has(a.id)
    const bChecked = selected.has(b.id)
    if (aChecked === bChecked) return 0
    return aChecked ? -1 : 1
  })
}

function dealerSelectionEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

interface DealerMultiSelectProps {
  dealers: DealerOption[]
  value: string[]
  onChange: (value: string[]) => void
  /** When true (default), onChange runs only when the popover closes. */
  commitOnClose?: boolean
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
  commitOnClose = true,
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
  const [mounted, setMounted] = useState(false)
  /** Order frozen when the popover opens — avoids rows jumping while toggling. */
  const [dealersOnOpen, setDealersOnOpen] = useState<DealerOption[] | null>(null)
  /** Draft selection while the popover is open (committed on close). */
  const [draftValue, setDraftValue] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Avoid SSR/client mismatch: React Query loading differs until after mount.
  const showLoading = mounted && loading
  const isDisabled = mounted && (disabled || loading)

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

  const orderedDealers = dealersOnOpen ?? dealers

  const filteredDealers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orderedDealers
    return orderedDealers.filter((d) => d.label.toLowerCase().includes(q))
  }, [orderedDealers, search])

  const filteredIds = useMemo(() => filteredDealers.map((d) => d.id), [filteredDealers])
  const isFiltering = search.trim().length > 0

  const handleOpenChange = (next: boolean) => {
    if (isDisabled) return
    if (next) {
      setDraftValue([...value])
      setDealersOnOpen(sortDealersCheckedFirst(dealers, value))
      setSearch('')
      setOpen(true)
      return
    }

    setDealersOnOpen(null)
    setSearch('')
    setOpen(false)
    if (commitOnClose) {
      if (!dealerSelectionEqual(draftValue, value)) {
        onChange(draftValue)
      }
    }
  }

  const toggleDealer = (id: string) => {
    const apply = (prev: string[]) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]

    if (commitOnClose && open) {
      setDraftValue(apply)
      return
    }
    onChange(apply(value))
  }

  const popoverSelection = commitOnClose && open ? draftValue : value

  const allVisibleSelected =
    filteredIds.length > 0 && filteredIds.every((id) => popoverSelection.includes(id))

  const toggleAllVisible = () => {
    const apply = (prev: string[]) => {
      if (filteredIds.length === 0) return prev
      if (filteredIds.every((id) => prev.includes(id))) {
        const drop = new Set(filteredIds)
        return prev.filter((id) => !drop.has(id))
      }
      return [...new Set([...prev, ...filteredIds])]
    }

    if (commitOnClose && open) {
      setDraftValue(apply)
      return
    }
    onChange(apply(value))
  }

  const handleRowMouseDown = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  const checkAllLabel = isFiltering ? t('dealer.checkAllFiltered') : resolvedAllLabel

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isDisabled}
          className={cn(
            'min-w-[200px] justify-between border-border bg-background/50 font-normal text-foreground hover:bg-background hover:text-foreground',
            className,
          )}
        >
          <span className="truncate text-foreground">
            {showLoading ? t('dealer.loading') : label}
          </span>
          {showLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('dealer.searchPlaceholder')}
            className="h-9"
            value={search}
            onValueChange={setSearch}
          />
          {/* Sticky outside cmdk filter so it never disappears while searching. */}
          <button
            type="button"
            disabled={filteredIds.length === 0}
            onMouseDown={handleRowMouseDown(toggleAllVisible)}
            className={cn(
              'flex w-full cursor-pointer items-center px-2 py-1.5 text-sm outline-none',
              'hover:bg-accent hover:text-accent-foreground',
              'disabled:pointer-events-none disabled:opacity-50',
              'border-b border-border',
            )}
          >
            <RowCheckbox checked={allVisibleSelected} />
            <span className="font-medium">{checkAllLabel}</span>
          </button>
          <CommandList className={maxHeight}>
            <CommandEmpty>{resolvedEmptyLabel}</CommandEmpty>
            <CommandGroup>
              {filteredDealers.map((dealer) => {
                const checked = popoverSelection.includes(dealer.id)
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
