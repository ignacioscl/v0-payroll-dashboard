'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface PunchHoursFilterProps {
  minHours: string
  maxHours: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  className?: string
}

function HoursInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Allow empty, digits and single decimal point
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      onChange(raw)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-7 w-[72px] px-2 text-center text-[11px] tabular-nums"
        inputMode="decimal"
        aria-label={label}
      />
      <span className="text-[11px] text-muted-foreground">h</span>
    </div>
  )
}

export function PunchHoursFilter({
  minHours,
  maxHours,
  onMinChange,
  onMaxChange,
  className,
}: PunchHoursFilterProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <HoursInput
        value={minHours}
        onChange={onMinChange}
        placeholder="0"
        label="More than"
      />
      <HoursInput
        value={maxHours}
        onChange={onMaxChange}
        placeholder="0"
        label="Less than"
      />
    </div>
  )
}
