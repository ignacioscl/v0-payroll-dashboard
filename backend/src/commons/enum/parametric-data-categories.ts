interface Category {
  id: number
  name: string
}

export const ParametricDataCategories = {
  MENU: { id: 1, name: 'MENU' } as Category,
  CITY: { id: 2, name: 'CITY' } as Category,
  STATE: { id: 3, name: 'STATE' } as Category,
  COUNTRY: { id: 4, name: 'COUNTRY' } as Category,
  BASE: { id: 5, name: 'BASE' } as Category,
  EMPLOYEE_PAYMENT_DRIVER: { id: 6, name: 'EMPLOYEE_PAYMENT_DRIVER' } as Category,
  EMPLOYEE_PAYMENT_AUX: { id: 7, name: 'EMPLOYEE_PAYMENT_AUX' } as Category,
  EMPLOYEE_PAYMENT_VIG_ROS: { id: 9, name: 'EMPLOYEE_PAYMENT_VIG_ROS' } as Category,
  EMPLOYEE_PAYMENT_VIG_BSAS: { id: 10, name: 'EMPLOYEE_PAYMENT_VIG_BSAS' } as Category,
  EMPLOYEE_PAYMENT_OFFICE: { id: 11, name: 'EMPLOYEE_PAYMENT_OFFICE' } as Category,
  TRANSPORTE: { id: 12, name: 'TRANSPORTE' } as Category,
  TIPO_DESCUENTO: { id: 13, name: 'TIPO_DESCUENTO' } as Category,
} as const
