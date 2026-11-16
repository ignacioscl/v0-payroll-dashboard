import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

import { MainLayout } from '@/components/layout/main-layout'
import { meQueryKey, toMeQueryData } from '@/lib/auth/me-query'
import { requirePayrollDashboardAccess } from '@/lib/auth/require-session'

/**
 * Marco del panel (menú, barra y guard). Revisa la sesión contra `me.php` una vez por carga del documento y siembra
 * esa respuesta en la caché de `/me`: el menú aparece completo en el primer dibujo y el navegador no vuelve a pedir
 * `/api/auth/me` (plans/plan-buenas-practicas-v0, 4.5). El permiso de cada pantalla lo decide el guard en cada cambio
 * de dirección (4.6), no este layout, que no se vuelve a ejecutar al navegar.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requirePayrollDashboardAccess()
  const queryClient = new QueryClient()
  queryClient.setQueryData(meQueryKey, toMeQueryData(me))
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MainLayout>{children}</MainLayout>
    </HydrationBoundary>
  )
}
