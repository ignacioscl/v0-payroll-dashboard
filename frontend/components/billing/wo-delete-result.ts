import type { DeleteWorkOrdersResponse } from '@/lib/srs-wo-to-be-billed-api'

type T = (key: 'woToBeBilled.delete.partial' | 'woToBeBilled.delete.none', params: Record<string, string | number>) => string

/**
 * El aviso cuando alguna WO no se eliminó (§6): «{n} deleted, {m} failed: {lista}» o «No work orders were deleted:
 * {lista}», con el WO# y el motivo de cada una. Para una fila sin `fullNro` (no pasó el alcance) se usa el número que
 * ya muestra la tabla (T5).
 */
export function deleteResultMessage(
  res: DeleteWorkOrdersResponse,
  rows: Array<{ id: number; fullNro: string }>,
  t: T,
): string {
  const shown = new Map(rows.map((r) => [r.id, r.fullNro]))
  const list = res.failed.map((f) => `${f.fullNro ?? shown.get(f.id) ?? `#${f.id}`} — ${f.reason}`).join('; ')
  if (res.deleted.length === 0) return t('woToBeBilled.delete.none', { list })
  return t('woToBeBilled.delete.partial', { n: res.deleted.length, m: res.failed.length, list })
}
