import { mapPunchListRow } from './punch-list-row'

const raw = {
  id: 1,
  estado: 1,
  manual_create: 0,
  has_log: 0,
  id_usuario: 9,
  nombre: 'Ada',
  thumbnail_uuid: null,
  id_dealer: 639,
  razon_social: 'Dealer',
  hourly_rate: 25,
  type_payment: 4,
  id_payment_type: 4,
  payment_type_name: 'Hourly',
  punch_in_epoch: 1784843760,
}

describe('mapPunchListRow', () => {
  it('sin includeAmounts no serializa hourlyRate ni typePayment', () => {
    const row = mapPunchListRow(raw, {
      includeAmounts: false,
      includePaymentTypeName: true,
    })
    expect(row).not.toHaveProperty('hourlyRate')
    expect(row).not.toHaveProperty('typePayment')
    expect(row.objPaymentType).toEqual({ id: 4, name: 'Hourly' })
  })

  it('sin includePaymentTypeName no serializa objPaymentType', () => {
    const row = mapPunchListRow(raw, {
      includeAmounts: true,
      includePaymentTypeName: false,
    })
    expect(row).not.toHaveProperty('objPaymentType')
    expect(row.hourlyRate).toBe(25)
    expect(row.typePayment).toBe(4)
  })
})
