'use client'

import { QueryProvider } from '@/lib/providers/query-provider'
import { LocaleProvider } from '@/lib/i18n/locale-context'
import { Toaster } from '@/components/ui/sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <LocaleProvider>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={TOAST_DURATION_MS}
          toastOptions={{
            duration: TOAST_DURATION_MS,
            closeButton: true,
          }}
        />
      </LocaleProvider>
    </QueryProvider>
  )
}
