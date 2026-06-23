export type TtkTodayStatusData = {
  date: string
  on_lunch: number
  working: number
  out: number
}

export type TtkTodayStatusResponse = {
  status: 'success' | 'fail'
  data?: {
    status: TtkTodayStatusData
  }
  error?: {
    message?: string
  }
}

export const EMPTY_TTK_TODAY_STATUS: TtkTodayStatusData = {
  date: '',
  on_lunch: 0,
  working: 0,
  out: 0,
}
