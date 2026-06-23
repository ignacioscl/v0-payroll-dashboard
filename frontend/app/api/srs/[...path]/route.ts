import { NextRequest } from 'next/server'
import { forwardToSrs } from '@/lib/srs-proxy'

type RouteContext = { params: Promise<{ path: string[] }> }

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  return forwardToSrs({
    method: request.method,
    pathSegments: path,
    search: request.nextUrl.search,
    body: hasBody ? await request.arrayBuffer() : null,
    contentType: request.headers.get('content-type'),
    accept: request.headers.get('accept'),
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
