import { diffIds, toNamed } from './diff-named-ids'

describe('diffIds', () => {
  it('returns added and removed ids between before and after', () => {
    expect(diffIds([1, 2], [2, 3])).toEqual({
      addedIds: [3],
      removedIds: [1],
    })
  })

  it('returns empty arrays when both before and after are empty', () => {
    expect(diffIds([], [])).toEqual({
      addedIds: [],
      removedIds: [],
    })
  })

  it('sorts added and removed ids ascending', () => {
    expect(diffIds([5, 1, 3], [2, 4, 1])).toEqual({
      addedIds: [2, 4],
      removedIds: [3, 5],
    })
  })
})

describe('toNamed', () => {
  it('maps ids to nombre from the names map', () => {
    const namesById = new Map<number, string>([
      [1, 'Payroll > View'],
      [3, 'Work Orders > Edit'],
    ])

    expect(toNamed([3, 1], namesById)).toEqual([
      { id: 3, nombre: 'Work Orders > Edit' },
      { id: 1, nombre: 'Payroll > View' },
    ])
  })

  it('uses empty string when id is missing from the names map', () => {
    const namesById = new Map<number, string>([[2, 'Known']])

    expect(toNamed([2, 99], namesById)).toEqual([
      { id: 2, nombre: 'Known' },
      { id: 99, nombre: '' },
    ])
  })
})
