'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { FilterProvider } from '@/lib/filter-context'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
}

function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <>
      <Sidebar />
      <Header />
      <main
        className={cn(
          'pt-16 transition-all duration-200 ease-in-out',
          collapsed ? 'ml-[72px]' : 'ml-[260px]'
        )}
      >
        <div className="p-6">{children}</div>
      </main>
    </>
  )
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <FilterProvider>
        <div className="min-h-screen bg-background">
          <MainContent>{children}</MainContent>
        </div>
      </FilterProvider>
    </SidebarProvider>
  )
}
