'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference,
} from '@/lib/sidebar-preference'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(true)

  useEffect(() => {
    setCollapsedState(readSidebarCollapsedPreference())
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    writeSidebarCollapsedPreference(value)
  }, [])

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      writeSidebarCollapsedPreference(next)
      return next
    })
  }, [])

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
