'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/**
 * Buscador común (plans/plan-buenas-practicas-v0, 5.1): ícono a la izquierda y, con texto, la X adentro a la
 * derecha, que borra el texto y devuelve el cursor al campo. Es el bloque que ya tenía la tabla, sacado tal cual.
 * Todo campo de búsqueda usa este componente (control: `lib/ui-guards.test.ts`); el de los combos es
 * `CommandInput` (`components/ui/command.tsx`), con la misma X.
 */
type SearchInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
  /** Clases de la caja de afuera (ancho, margen). */
  className?: string
  /** Clases del campo (alto, tamaño de letra). */
  inputClassName?: string
  /** Clases del ícono de la lupa (tamaño, posición). */
  iconClassName?: string
}

export function SearchInput({
  value,
  onValueChange,
  className,
  inputClassName,
  iconClassName,
  disabled,
  ref,
  ...props
}: SearchInputProps) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground',
          iconClassName,
        )}
      />
      <Input
        ref={setRefs}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'pl-7 pr-7 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          inputClassName,
        )}
        {...props}
      />
      {value && !disabled ? (
        <button
          type="button"
          onClick={() => {
            onValueChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t('common.clearSearch')}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
