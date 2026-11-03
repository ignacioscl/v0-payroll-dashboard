'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type FormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Botones del pie. Van fuera del `<form>`: el submit usa `form={id}`. */
  footer?: React.ReactNode
  /** Con una grabación en curso el modal no se cierra. */
  busy?: boolean
  children: React.ReactNode
  bodyClassName?: string
}

/** Bloque del cuerpo del modal: tarjeta como la de `FilterPanel`, con encabezado opcional. */
export function FormSection({
  title,
  icon: Icon,
  className,
  children,
}: {
  title?: React.ReactNode
  icon?: LucideIcon
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-[14px] border border-border bg-card shadow-sm">
      {title ? (
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          {Icon ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </div>
          ) : null}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
      ) : null}
      <div className={cn('min-w-0 p-4', className)}>{children}</div>
    </section>
  )
}

/**
 * Modal grande de formulario de Pro: encabezado y pie fijos, y scrollea solo el cuerpo. Un click afuera
 * no lo cierra, para no perder lo cargado. Regla `form-dialog-layout`.
 */
export function FormDialog({ open, onOpenChange, title, description, footer, busy, children, bodyClassName }: FormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,65rem)]"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-[19px] font-semibold tracking-[-0.015em]">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div data-slot="form-dialog-body" className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-muted/50 px-4 py-4 sm:px-6', bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end border-t border-border bg-card px-4 py-3 sm:px-6">{footer}</DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
