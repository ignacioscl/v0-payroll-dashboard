import * as React from 'react'

import { cn } from '@/lib/utils'

type InputProps = React.ComponentProps<'input'> & {
  /** Texto fijo en gris a la izquierda, dentro del campo, que no se puede borrar (p. ej. «Pepe - »). */
  leadingText?: string
}

const inputBase =
  'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'

function Input({ className, type, leadingText, ...props }: InputProps) {
  if (leadingText) {
    return (
      <div
        data-slot="input"
        className={cn(
          inputBase,
          'flex items-center gap-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          'has-[[aria-invalid=true]]:ring-destructive/20 has-[[aria-invalid=true]]:border-destructive',
          className,
        )}
      >
        <span className="max-w-[60%] shrink-0 truncate text-muted-foreground select-none">{leadingText}</span>
        <input
          type={type}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          {...props}
        />
      </div>
    )
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        inputBase,
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
