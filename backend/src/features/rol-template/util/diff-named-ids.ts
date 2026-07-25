export type NamedId = { id: number; nombre: string }

export function diffIds(
  before: number[],
  after: number[],
): { addedIds: number[]; removedIds: number[] } {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)

  const addedIds = [...afterSet]
    .filter((id) => !beforeSet.has(id))
    .sort((a, b) => a - b)

  const removedIds = [...beforeSet]
    .filter((id) => !afterSet.has(id))
    .sort((a, b) => a - b)

  return { addedIds, removedIds }
}

export function toNamed(
  ids: number[],
  namesById: Map<number, string>,
): NamedId[] {
  return ids.map((id) => ({
    id,
    nombre: namesById.get(id) ?? '',
  }))
}
