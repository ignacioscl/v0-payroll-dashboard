import { NextRequest } from 'next/server'
import { forwardToFace } from '@/lib/face/face-proxy'

type RouteContext = { params: Promise<{ path: string[] }> }

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  return forwardToFace({
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
