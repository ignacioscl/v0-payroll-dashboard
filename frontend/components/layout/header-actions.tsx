'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Botones de la barra que dependen de la pantalla (plans/plan-buenas-practicas-v0, 4.7; regla global «Cambiar de
 * pantalla es instantáneo», punto 6). La barra deja el lugar (`HeaderActionsSlot`) y la pantalla dibuja sus botones
 * con `<HeaderActions>`: la barra no pregunta en qué pantalla está.
 */
const HeaderActionsContext = createContext<{
  slot: HTMLElement | null
  setSlot: (el: HTMLElement | null) => void
} | null>(null)

export function HeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ slot, setSlot }), [slot])
  return <HeaderActionsContext.Provider value={value}>{children}</HeaderActionsContext.Provider>
}

/** El lugar en la barra. `contents`: lo que la pantalla pone ahí es un ítem más de la fila (mismo `gap`). */
export function HeaderActionsSlot() {
  const ctx = useContext(HeaderActionsContext)
  return <div ref={ctx?.setSlot} data-slot="header-actions" className="contents" />
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const ctx = useContext(HeaderActionsContext)
  if (!ctx?.slot) return null
  return createPortal(children, ctx.slot)
}
