import { redirect } from 'next/navigation'
import { checkPayrollDashboardAccess } from '@/lib/auth/verify-payroll-access'
import { clearSessionRedirectUrl } from '@/lib/auth/session'

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await checkPayrollDashboardAccess()

  if (access === 'ok') {
    redirect('/')
  }

  if (access === 'forbidden') {
    redirect(clearSessionRedirectUrl('/login?error=forbidden'))
  }

  if (access === 'invalid') {
    redirect(clearSessionRedirectUrl('/login'))
  }

  return children
}
