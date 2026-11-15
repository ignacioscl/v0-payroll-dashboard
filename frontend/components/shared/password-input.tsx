'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/**
 * Campo de contraseña común (plans/plan-buenas-practicas-v0, 5.3; regla global «Mostrar la contraseña va dentro
 * del campo»): el ojo va adentro, a la derecha de todo, y muestra u oculta la contraseña. Mismo armado que
 * `SearchInput`. Todo `type="password"` pasa por acá (control: `lib/ui-guards.test.ts`).
 */
type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Ícono que va a la izquierda, dentro del campo (p. ej. el candado del login). */
  leadingIcon?: React.ReactNode
}

export function PasswordInput({ id, className, disabled, leadingIcon, ...props }: PasswordInputProps) {
  const { t } = useTranslation()
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      {leadingIcon}
      <Input
        id={inputId}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        aria-controls={inputId}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
