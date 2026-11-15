/**
 * `cn()` con los nombres propios del proyecto (plans/plan-buenas-practicas-v0, 5.6, T11). Hoy `twMerge` sin
 * configurar los resuelve bien. Si un día se agrega un tamaño, radio o sombra propios y este test falla, `cn()` pasa a
 * `extendTailwindMerge` (https://github.com/dcastil/tailwind-merge/blob/v3.3.1/docs/configuration.md).
 */
import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn()', () => {
  it('dos colores de fondo: queda el último', () => {
    expect(cn('bg-navy-700', 'bg-primary')).toBe('bg-primary')
  })

  it('la letra de marca y el peso: quedan las dos', () => {
    expect(cn('font-brand', 'font-semibold')).toBe('font-brand font-semibold')
  })

  it('dos tamaños de letra: queda el último', () => {
    expect(cn('text-[11px]', 'text-xs')).toBe('text-xs')
  })

  it('color de la cabecera de tabla y tamaño de letra: quedan los dos', () => {
    expect(cn('text-table-header-foreground', 'text-sm')).toBe('text-table-header-foreground text-sm')
  })

  it('un z-index token reemplaza al número', () => {
    expect(cn('z-50', 'z-(--z-header)')).toBe('z-(--z-header)')
    expect(cn('z-(--z-overlay)', 'z-10')).toBe('z-10')
  })
})
