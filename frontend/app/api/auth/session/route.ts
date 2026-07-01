import { NextResponse } from 'next/server'
import { getSrsSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSrsSession()

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
  })
}
