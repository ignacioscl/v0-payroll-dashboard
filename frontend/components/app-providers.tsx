'use client'

import { LazyMotion } from 'framer-motion'
import { QueryProvider } from '@/lib/providers/query-provider'
import { LocaleProvider } from '@/lib/i18n/locale-context'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TOAST_DURATION_MS } from '@/lib/toast-config'

/** Las animaciones se bajan después del primer pintado; `strict` hace que un `motion.x` completo tire error. */
const loadMotionFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <LocaleProvider>
        {/* El único proveedor de tooltips; demora 0, como se ve hoy (plans/plan-buenas-practicas-v0, T8). */}
        <TooltipProvider delayDuration={0}>
          <LazyMotion features={loadMotionFeatures} strict>
            {children}
          </LazyMotion>
        </TooltipProvider>
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
