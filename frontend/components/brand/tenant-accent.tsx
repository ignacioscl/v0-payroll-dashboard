'use client'

import { useEffect } from 'react'

import { useProviderBranding } from '@/hooks/use-provider-branding'

/**
 * Paints the tenant accent by overriding --client-accent on <html>. Everything that
 * reads --primary (buttons, checkboxes, switches, links, focus rings, chart-1) follows
 * from there, so no component needs to know a tenant exists.
 *
 * The sidebar deliberately does NOT follow it: the rail is navy, and its active item
 * has to stay legible whatever colour a tenant picks.
 */
export function TenantAccent() {
  const { data } = useProviderBranding()
  const accent = data?.accentColor ?? null

  useEffect(() => {
    const root = document.documentElement
    if (accent) {
      root.style.setProperty('--client-accent', accent)
    } else {
      root.style.removeProperty('--client-accent')
    }
    return () => {
      root.style.removeProperty('--client-accent')
    }
  }, [accent])

  return null
}
