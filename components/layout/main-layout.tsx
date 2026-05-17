'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { FilterProvider } from '@/lib/filter-context'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <FilterProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main className="ml-64 pt-16 transition-all duration-300">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </FilterProvider>
  )
}
