import { redirect } from 'next/navigation'
import { getSrsSession } from './session'

export async function requireSrsSession() {
  const session = await getSrsSession()
  if (!session) {
    const srsUrl = (process.env.SRS_PUBLIC_URL ?? 'http://srs.com').replace(/\/$/, '')
    redirect(`${srsUrl}/login.php`)
  }
  return session
}
