'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

/** PRO no tiene tema oscuro (plans/plan-buenas-practicas-v0, D6): los avisos van siempre en claro. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
