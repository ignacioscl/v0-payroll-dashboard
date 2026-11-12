'use client'

import { LazyMotion } from 'framer-motion'
import { QueryProvider } from '@/lib/providers/query-provider'
import { LocaleProvider } from '@/lib/i18n/locale-context'
import { Toaster } from '@/components/ui/sonner'
import { TOAST_DURATION_MS } from '@/lib/toast-config'

/** Las animaciones se bajan después del primer pintado; `strict` hace que un `motion.x` completo tire error. */
const loadMotionFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <LocaleProvider>
        <LazyMotion features={loadMotionFeatures} strict>
          {children}
        </LazyMotion>
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
