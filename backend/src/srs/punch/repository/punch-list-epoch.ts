/** epoch (s) → ISO 8601 UTC, el formato que el frontend ya consume en `punchInGmt0`. */
export function epochToIso(raw: unknown): string | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}
