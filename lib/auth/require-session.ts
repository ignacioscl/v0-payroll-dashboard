import { redirect } from 'next/navigation'
import { checkPayrollDashboardAccess } from './verify-payroll-access'
import { clearSessionRedirectUrl, getSrsSession } from './session'

export async function requireSrsSession() {
  const session = await getSrsSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

/** Requires cookies and payroll dashboard access (idRolSystemV2 or admin). */
export async function requirePayrollDashboardAccess() {
  const access = await checkPayrollDashboardAccess()

  if (access === 'no_session') {
    redirect('/login')
  }

  if (access === 'forbidden') {
    redirect(clearSessionRedirectUrl('/login?error=forbidden'))
  }

  if (access === 'invalid') {
    redirect(clearSessionRedirectUrl('/login'))
  }

  const session = await getSrsSession()
  if (!session) {
    redirect('/login')
  }
  return session
}
