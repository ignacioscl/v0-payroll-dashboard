import { MainLayout } from '@/components/layout/main-layout'
import { requirePayrollDashboardAccess } from '@/lib/auth/require-session'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requirePayrollDashboardAccess()

  return <MainLayout>{children}</MainLayout>
}
