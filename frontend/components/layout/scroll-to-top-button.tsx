'use client'

import * as React from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

const DEFAULT_THRESHOLD = 120

interface ScrollToTopButtonProps {
  /** Show the button after scrolling past this many pixels. */
  threshold?: number
}

export function ScrollToTopButton({ threshold = DEFAULT_THRESHOLD }: ScrollToTopButtonProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  if (!visible) return null

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      aria-label={t('layout.scrollToTop')}
      className={cn(
        'fixed bottom-6 right-6 z-50 size-10 cursor-pointer rounded-full shadow-lg',
        'border border-border bg-card/95 backdrop-blur-sm',
        'hover:bg-accent',
      )}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp className="size-4" />
    </Button>
  )
}
