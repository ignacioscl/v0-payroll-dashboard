'use client'

import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
}

/**
 * Selector chico de una opción entre 2 a 4 fijas, para filtros (All / Regular / Piecework en Expenses List,
 * Pending / Corrected en Punch Report). Mismo dibujo que `TabsList`: un riel gris con la opción elegida en blanco,
 * con sombra y el texto en el color de la empresa. El hover solo oscurece el texto, para que no se confunda con
 * la elegida. Por debajo es el ToggleGroup de Radix (rol `radio`, flechas del teclado).
 *
 * Regla: `.cursor/rules/selection-tiles-no-radio.mdc` (los filtros no van en tarjetas).
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: {
  value: T | ''
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  className?: string
  'aria-label'?: string
  'data-testid'?: string
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        // Radix emite '' al tocar la opción ya elegida: se queda la que estaba.
        const picked = options.find((o) => o.value === v)
        if (picked) onValueChange(picked.value)
      }}
      className={cn('inline-flex h-8 w-fit shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}
      {...props}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex h-full cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap',
            'text-muted-foreground transition-[color,background-color,box-shadow] outline-none hover:text-foreground',
            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-sm',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}
