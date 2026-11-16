import 'server-only'
import { redirect } from 'next/navigation'
import { getPayrollMe } from './verify-payroll-access'
import { clearSessionRedirectUrl, getSrsSession } from './session'

export async function requireSrsSession() {
  const session = await getSrsSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

/**
 * Requires cookies and payroll dashboard access (idRolSystemV2 or admin). Devuelve la sesión y los datos de `me.php`
 * sin volver a leer la cookie ni a llamar al PHP (los dos con `cache`; plans/plan-buenas-practicas-v0, 4.5).
 */
export async function requirePayrollDashboardAccess() {
  const result = await getPayrollMe()

  if (result.access === 'no_session') {
    redirect('/login')
  }

  if (result.access === 'forbidden') {
    redirect(clearSessionRedirectUrl('/login?error=forbidden'))
  }

  if (result.access !== 'ok') {
    redirect(clearSessionRedirectUrl('/login'))
  }

  const session = await getSrsSession()
  if (!session) {
    redirect('/login')
  }
  return { session, me: result.me }
}
