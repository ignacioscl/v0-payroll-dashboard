'use client'

import * as React from 'react'
import type { Column } from '@tanstack/react-table'
import { CalendarIcon, Filter, FilterX } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import {
  DATE_OPERATOR_LABELS,
  DEFAULT_OPERATOR_BY_TYPE,
  NUMBER_OPERATOR_LABELS,
  TEXT_OPERATOR_LABELS,
  type ColumnFilterConfig,
  type ColumnFilterValue,
  type DateFilterOperator,
  type NumberFilterOperator,
  type TextFilterOperator,
} from './data-table-helpers'

interface DataTableColumnFilterProps<TData> {
  column: Column<TData>
  config: ColumnFilterConfig
}

/**
 * Active-state filter icon + popover with operator select and value input.
 * Wires straight into TanStack's `columnFilters` state — values are stored
 * as `ColumnFilterValue` so the backend payload helper knows how to read them.
 */
export function DataTableColumnFilter<TData>({
  column,
  config,
}: DataTableColumnFilterProps<TData>) {
  const [open, setOpen] = React.useState(false)
  const stored = column.getFilterValue() as ColumnFilterValue | undefined
  const isActive = !!stored && stored.value !== '' && stored.value !== null

  // Local draft state — only commit on Apply.
  const [operator, setOperator] = React.useState<string>(
    stored?.operator ?? config.defaultOperator ?? DEFAULT_OPERATOR_BY_TYPE[config.type],
  )
  const [value, setValue] = React.useState<string>(
    stored ? (stored.value == null ? '' : String(stored.value)) : '',
  )

  // Reset draft from stored value when popover opens.
  React.useEffect(() => {
    if (!open) return
    setOperator(
      stored?.operator ?? config.defaultOperator ?? DEFAULT_OPERATOR_BY_TYPE[config.type],
    )
    setValue(stored ? (stored.value == null ? '' : String(stored.value)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const apply = () => {
    if (value === '') {
      column.setFilterValue(undefined)
      setOpen(false)
      return
    }
    let payload: ColumnFilterValue
    if (config.type === 'number') {
      const n = Number(value)
      payload = {
        type: 'number',
        operator: operator as NumberFilterOperator,
        value: Number.isFinite(n) ? n : null,
      }
    } else if (config.type === 'date') {
      payload = {
        type: 'date',
        operator: operator as DateFilterOperator,
        value,
      }
    } else {
      payload = {
        type: 'text',
        operator: operator as TextFilterOperator,
        value,
      }
    }
    column.setFilterValue(payload)
    setOpen(false)
  }

  const clear = () => {
    column.setFilterValue(undefined)
    setValue('')
    setOpen(false)
  }

  const operatorOptions =
    config.type === 'text'
      ? Object.entries(TEXT_OPERATOR_LABELS)
      : config.type === 'number'
        ? Object.entries(NUMBER_OPERATOR_LABELS)
        : Object.entries(DATE_OPERATOR_LABELS)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isActive ? 'Filter (active)' : 'Filter'}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex size-5 items-center justify-center rounded transition-colors',
            isActive
              ? 'bg-amber-400 text-blue-900 ring-1 ring-amber-200'
              : 'text-inherit/70 opacity-70 hover:bg-white/15 hover:opacity-100',
          )}
        >
          <Filter className="size-3" strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[280px] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filter
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Active
              </span>
            )}
          </div>

          <Select value={operator} onValueChange={setOperator}>
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operatorOptions.map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {config.type === 'text' && (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder ?? 'Value…'}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
              }}
              autoFocus
            />
          )}

          {config.type === 'number' && (
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder ?? '0'}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
              }}
              autoFocus
            />
          )}

          {config.type === 'date' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded border border-input bg-background px-2 py-1.5">
                <CalendarIcon className="size-3.5 text-muted-foreground" />
                <span className="text-xs tabular-nums text-foreground">
                  {value || 'Pick a date'}
                </span>
              </div>
              <div className="rounded-md border border-border">
                <Calendar
                  mode="single"
                  selected={value ? new Date(value + 'T00:00:00') : undefined}
                  onSelect={(d) => {
                    if (!d) return
                    // Convert to YYYY-MM-DD without timezone drift.
                    const yyyy = d.getFullYear()
                    const mm = String(d.getMonth() + 1).padStart(2, '0')
                    const dd = String(d.getDate()).padStart(2, '0')
                    setValue(`${yyyy}-${mm}-${dd}`)
                  }}
                  className="p-1 text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={clear}
              disabled={!isActive && value === ''}
            >
              <FilterX className="size-3" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[11px]"
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
