import type { SrsSessionUser } from './types'

/**
 * Lee la cookie `srs_auth_user` (un JSON que ponen el SSO y el login). La usan `getSrsSession` y `proxy.ts`, para que
 * «hay sesión» se decida igual en los dos (plans/plan-buenas-practicas-v0, 4.6). La cookie no está firmada: sirve para
 * la revisión rápida, no como barrera; la protección de los datos sigue en cada route handler y en el Nest.
 */
export function parseSessionUserCookie(raw: string | undefined): SrsSessionUser | null {
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as SrsSessionUser
    return user?.id ? user : null
  } catch {
    return null
  }
}
