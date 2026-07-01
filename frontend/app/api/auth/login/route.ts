import { NextResponse } from 'next/server'
import { buildSessionCookies } from '@/lib/auth/session'
import { loginWithCredentialsFlow } from '@/lib/srs-api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body?.email ?? '').trim()
    const password = String(body?.password ?? '')
    const idUsuarioRolrel = body?.idUsuarioRolrel ? Number(body.idUsuarioRolrel) : undefined

    if (!email || !password) {
      return NextResponse.json(
        { status: 'fail', error: { message: 'Email and password are required' } },
        { status: 400 }
      )
    }

    const result = await loginWithCredentialsFlow(email, password, idUsuarioRolrel)

    if (result.kind === 'chooseRole') {
      return NextResponse.json({
        status: 'success',
        needsRoleSelection: true,
        rolesRel: result.rolesRel,
      })
    }

    const response = NextResponse.json({ status: 'success', user: result.user })
    for (const cookie of buildSessionCookies({ token: result.token, user: result.user })) {
      response.cookies.set(cookie)
    }
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed'
    const isForbidden =
      message.includes('do not have access to the payroll dashboard') ||
      message.includes('Forbidden')
    return NextResponse.json(
      { status: 'fail', error: { message, code: isForbidden ? '403' : '401' } },
      { status: isForbidden ? 403 : 401 },
    )
  }
}
