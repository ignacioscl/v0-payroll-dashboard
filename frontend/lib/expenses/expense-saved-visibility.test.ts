import { describe, expect, it } from 'vitest'

import { dealersToShowSaved, savedDealerIds } from './expense-saved-visibility'

describe('savedDealerIds', () => {
  it('gasto suelto: su dealer', () => {
    expect(savedDealerIds({ mode: 'single', idDealer: '167', branchIds: [] })).toEqual(['167'])
  })

  it('varios dealers: los del reparto', () => {
    expect(savedDealerIds({ mode: 'amount', idDealer: '', branchIds: ['903', '286'] })).toEqual(['903', '286'])
  })
})

describe('dealersToShowSaved', () => {
  it('suma al header los dealers del gasto que no estaban: el gasto recién guardado no desaparece', () => {
    expect(dealersToShowSaved(['167'], ['903', '286'])).toEqual(['167', '903', '286'])
  })

  it('no cambia el header si alguno de los dealers del gasto ya está: el gasto ya se ve', () => {
    const selected = ['167', '690']
    expect(dealersToShowSaved(selected, ['167', '903'])).toBe(selected)
  })

  it('sin dealers guardados no cambia nada', () => {
    const selected = ['167']
    expect(dealersToShowSaved(selected, [])).toBe(selected)
  })
})
