/** Same-origin URL for client-side fetch (uses `/api/srs/[...path]` route). Safe for client components. */
export function srsProxyUrl(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
) {
  const normalized = path.replace(/^\//, '')
  let url = `/api/srs/${normalized}`
  if (searchParams) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  return url
}
