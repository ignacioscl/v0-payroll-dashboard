import { MainLayout } from '@/components/layout/main-layout'
import { requireSrsSession } from '@/lib/auth/require-session'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSrsSession()

  return <MainLayout>{children}</MainLayout>
}
