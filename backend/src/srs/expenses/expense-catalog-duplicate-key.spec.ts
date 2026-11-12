import { catalogDuplicateKey } from './expense-catalog-duplicate-key'

describe('catalogDuplicateKey (plan-expenses-posibles-duplicados, D1)', () => {
  const same = (a: string, b: string) => expect(catalogDuplicateKey(a)).toBe(catalogDuplicateKey(b))
  const different = (a: string, b: string) => expect(catalogDuplicateKey(a)).not.toBe(catalogDuplicateKey(b))

  it('junta los nombres que solo cambian en mayúsculas, espacios, signos, acentos o un «The» al principio', () => {
    same("Lowe's", "LOWE'S")
    same("Lowe's", 'Lowes')
    same("O' Reilly (Auto Parts)", 'OReilly Auto Parts')
    same('The Home Depot', 'Home Depot')
    same('The Home Depot', 'the home depot')
    same("Sam's Club ", "Sam's Club")
    same('Café', 'Cafe')
    same('  THE   Shell', 'Shell')
  })

  it('no junta nombres distintos', () => {
    different('Amazon', 'Amazon.com')
    different('Theater', 'Heater')
    different('Shell', 'Shell 2')
  })

  it('un nombre que queda vacío devuelve vacío (nunca agrupa)', () => {
    expect(catalogDuplicateKey('---')).toBe('')
    expect(catalogDuplicateKey('...')).toBe('')
    expect(catalogDuplicateKey(null)).toBe('')
  })
})
