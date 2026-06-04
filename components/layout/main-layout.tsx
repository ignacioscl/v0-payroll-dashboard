'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { ProdRouteGuard } from './prod-route-guard'
import { ScrollToTopButton } from './scroll-to-top-button'
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
          // Mobile: no left margin (sidebar is a drawer overlay)
          // Desktop: offset by sidebar width
          collapsed ? 'md:ml-[72px]' : 'md:ml-[260px]'
        )}
      >
        <ProdRouteGuard>
          <div className="p-4 md:p-6">{children}</div>
        </ProdRouteGuard>
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
          <ScrollToTopButton />
        </div>
      </FilterProvider>
    </SidebarProvider>
  )
}
