'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { enUS as enUSDayPicker } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  DATE_RANGE_PRESETS,
  matchPreset,
  resolvePresetRange,
  type DateRangePreset,
} from '@/lib/filters/date-range-presets'

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  numberOfMonths?: number
  /** Presets que se muestran en el panel lateral. Pasar [] para ocultarlos. */
  presets?: DateRangePreset[]
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select dates',
  className,
  numberOfMonths = 2,
  presets = DATE_RANGE_PRESETS,
}: DateRangePickerProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  // Draft: in-progress selection that only applies on "Apply"
  const [draft, setDraft] = useState<DateRange | undefined>(value)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync draft synchronously in onOpenChange so defaultMonth is correct on mount
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(value)
    setOpen(nextOpen)
  }

  const activePresetKey = mounted ? matchPreset(value) : null
  const showPresets = presets.length > 0

  // Presets apply immediately and close
  const handlePreset = (preset: DateRangePreset) => {
    const range = resolvePresetRange(preset)
    onChange?.(range)
    setOpen(false)
  }

  // Apply button commits the draft and closes
  const handleApply = () => {
    onChange?.(draft)
    setOpen(false)
  }

  // Clear resets everything
  const handleClear = () => {
    onChange?.(undefined)
    setDraft(undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'gap-2 border-border bg-background/50 hover:bg-background min-w-[180px] transition-colors',
            className
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {mounted && value?.from ? (
            value.to ? (
              <span className="text-foreground">
                {format(value.from, 'MMM dd', { locale: enUS })} -{' '}
                {format(value.to, 'MMM dd', { locale: enUS })}
              </span>
            ) : (
              <span className="text-foreground">
                {format(value.from, 'MMM dd, yyyy', { locale: enUS })}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {showPresets && (
            <div className="flex shrink-0 flex-row gap-1 border-b border-border p-2 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
              {presets.map((preset) => {
                const isActive = activePresetKey === preset.key
                return (
                  <Button
                    key={preset.key}
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'justify-start whitespace-nowrap text-sm font-normal',
                      !isActive && 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => handlePreset(preset)}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>
          )}

          <div className="flex flex-col">
            <CalendarComponent
              mode="range"
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from}
              numberOfMonths={numberOfMonths}
              locale={enUSDayPicker}
            />
            {/* Footer with Apply / Clear */}
            <div className="flex items-center justify-between border-t border-border px-3 py-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleClear}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!draft?.from}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
