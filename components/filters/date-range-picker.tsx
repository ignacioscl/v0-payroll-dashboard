'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
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
  getPresetRange,
  matchPreset,
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

  useEffect(() => {
    setMounted(true)
  }, [])

  const activePresetKey = mounted ? matchPreset(value) : null
  const showPresets = presets.length > 0

  const handlePreset = (preset: DateRangePreset) => {
    onChange?.(getPresetRange(preset.days))
  }

  return (
    <Popover>
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
                {format(value.from, 'MMM dd')} - {format(value.to, 'MMM dd')}
              </span>
            ) : (
              <span className="text-foreground">{format(value.from, 'MMM dd, yyyy')}</span>
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
          <CalendarComponent
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={numberOfMonths}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
