'use client'

import type * as React from 'react'
import { toast as sonnerToast } from 'sonner'

/**
 * shadcn-style `useToast()` API backed by sonner.
 *
 * The app mounts only sonner's `<Toaster />` (see `components/app-providers.tsx`);
 * the shadcn `<Toaster />` was never mounted, so every `toast(...)` raised through
 * this hook was stored in state and silently dropped — success and error feedback
 * in the billing dialogs never reached the screen. Routing the same API to sonner
 * keeps all call sites unchanged and makes those toasts visible.
 */

export type ToastVariant = 'default' | 'destructive' | 'success'

export type ToastOptions = {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  duration?: number
}

function showToast({ title, description, variant, duration }: ToastOptions = {}) {
  // sonner takes the headline as first arg; keep `description` as the secondary line.
  const headline = title ?? description ?? ''
  const options = {
    description: title != null ? description : undefined,
    duration,
  }

  return variant === 'destructive'
    ? sonnerToast.error(headline, options)
    : sonnerToast.success(headline, options)
}

function useToast() {
  return {
    toast: showToast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
    /** Kept for API compatibility with the (unmounted) shadcn `<Toaster />`. */
    toasts: [] as Array<Record<string, unknown>>,
  }
}

export { useToast, showToast as toast }
