import { NextResponse } from 'next/server'

import { getSrsSession } from '@/lib/auth/session'
import { fetchBackend } from '@/lib/backend-upstream'
import type { SrsSession } from '@/lib/auth/types'

/**
 * BFF de adjuntos de Expenses (T4 del plan): exige sesión, comprueba por el Nest que el gasto sea de
 * la empresa y visible para el usuario (y que viva bajo ese dealer) y reenvía al Node
 * (`${SRS_NODE_API_URL}/expenses/tickets/{idDealer}/{idExpense}[/{filename}]`) con el token de la
 * sesión en `Authorization`, como manda legacy (`tokenGbl`). El bucket no cambia.
 */

export function getSrsNodeApiBaseUrl(): string {
  const url = process.env.SRS_NODE_API_URL?.trim()
  if (!url) throw new Error('SRS_NODE_API_URL is not configured')
  return url.replace(/\/$/, '')
}

export function nodeTicketsUrl(idDealer: number, idExpense: number, filename?: string): string {
  const base = `${getSrsNodeApiBaseUrl()}/expenses/tickets/${idDealer}/${idExpense}`
  return filename ? `${base}/${encodeURIComponent(filename)}` : base
}

type ExpenseDetailLite =
  | { kind: 'single'; id: number; dealer: { id: number } }
  | { kind: 'group'; rows: { id: number; dealer: { id: number } }[] }

/** Cabeceras que el Nest espera del BFF (las mismas que el proxy `/api/srs-kpis`). */
function nestHeaders(session: SrsSession): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session.user.idDealerProvider && session.user.idDealerProvider > 0) {
    headers['x-srs-dealer-provider'] = String(session.user.idDealerProvider)
  }
  headers['x-srs-company-type'] = session.user.isCompanyTypeCompany ? '1' : '0'
  return headers
}

/**
 * Deja «Attachment {filename}» en el log del gasto (`POST /api/srs/expenses/:id/attachment-log`,
 * de ahí sale `hasAttachment`). Devuelve `false` si el Nest no respondió 2xx; nunca lanza: la
 * subida al Node ya está hecha y el que llama avisa sin bloquear.
 */
export async function logAttachmentUpload(session: SrsSession, idExpense: number, filename: string): Promise<boolean> {
  try {
    const res = await fetchBackend(`api/srs/expenses/${idExpense}/attachment-log`, session.token, {
      method: 'POST',
      headers: nestHeaders(session),
      body: JSON.stringify({ filename }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * ¿Puede subir un adjunto a este gasto? Se pregunta al Nest antes de mandar el archivo al Node (permiso 110 o 118, gasto
 * activo, D8). Devuelve la respuesta de error lista, o null si puede.
 */
export async function denyAttachmentUpload(session: SrsSession, idExpense: number): Promise<NextResponse | null> {
  const res = await fetchBackend(`api/srs/expenses/${idExpense}/attachment-check`, session.token, {
    method: 'POST',
    headers: nestHeaders(session),
  })
  if (res.ok) return null
  return NextResponse.json({ error: 'Not allowed' }, { status: res.status === 403 ? 403 : 404 })
}

/**
 * Sesión + gasto comprobado. Devuelve la respuesta de error lista para devolver, o la sesión.
 */
export async function authorizeAttachmentAccess(
  idDealerRaw: string,
  idExpenseRaw: string,
): Promise<{ error: NextResponse } | { session: SrsSession; idDealer: number; idExpense: number }> {
  const session = await getSrsSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const idDealer = Number(idDealerRaw)
  const idExpense = Number(idExpenseRaw)
  if (!Number.isInteger(idDealer) || idDealer <= 0 || !Number.isInteger(idExpense) || idExpense <= 0) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const headers = nestHeaders(session)

  const check = await fetchBackend(`api/srs/expenses/${idExpense}`, session.token, { method: 'GET', headers })
  if (!check.ok) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: check.status === 403 ? 403 : 404 }) }
  }
  const detail = (await check.json()) as ExpenseDetailLite
  const belongs =
    detail.kind === 'single'
      ? detail.id === idExpense && detail.dealer?.id === idDealer
      : (detail.rows ?? []).some((r) => r.id === idExpense && r.dealer?.id === idDealer)
  if (!belongs) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  return { session, idDealer, idExpense }
}
