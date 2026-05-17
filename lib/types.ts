// Base types for the payroll system

export interface Employee {
  id: string
  firstName: string
  lastName: string
  photo: string
  agencyId: string
  position: string
  hireDate: string
  schedule: WeeklySchedule
  hourlyRate: number
  status: 'active' | 'inactive'
}

export interface Agency {
  id: string
  name: string
  address: string
  contactPerson: string
  phone: string
  employeeCount: number
}

export interface DaySchedule {
  entry: string // "08:00"
  lunchOut: string // "12:00"
  lunchIn: string // "13:00"
  exit: string // "17:00"
}

export interface WeeklySchedule {
  monday: DaySchedule | null
  tuesday: DaySchedule | null
  wednesday: DaySchedule | null
  thursday: DaySchedule | null
  friday: DaySchedule | null
  saturday: DaySchedule | null
  sunday: DaySchedule | null
}

export type PunchType = 'entry' | 'lunch_out' | 'lunch_in' | 'exit'

export interface Punch {
  id: string
  employeeId: string
  date: string // "2024-01-15"
  type: PunchType
  expectedTime: string // "08:00"
  actualTime: string | null // null if didn't punch
  status: 'on_time' | 'late' | 'early' | 'missing'
}

export type IssueType = 
  | 'missing_entry'
  | 'missing_exit'
  | 'missing_lunch_out'
  | 'missing_lunch_in'
  | 'missing_clock_out'
  | 'late_arrival'
  | 'late_departure'
  | 'early_departure'
  | 'extended_lunch'
  | 'no_punches'
  | 'manual_punch'
  | 'deleted_punch'
  | 'modified_payment'

export type IssueStatus = 'pending' | 'reviewed' | 'justified'

export interface Issue {
  id: string
  employeeId: string
  agencyId: string
  date: string
  type: IssueType
  description: string
  expectedTime: string | null
  actualTime: string | null
  minutesDiff: number | null
  status: IssueStatus
  createdAt: string
}

export interface OvertimeRecord {
  id: string
  employeeId: string
  agencyId: string
  date: string
  regularHours: number
  overtimeHours: number
  overtimeCost: number
}

export interface DailyAttendance {
  date: string
  totalEmployees: number
  present: number
  absent: number
  late: number
  issues: number
}

export interface AgencyStats {
  agencyId: string
  agencyName: string
  totalEmployees: number
  totalIssues: number
  totalOvertimeHours: number
  estimatedCost: number
  punctualityRate: number
}

export interface EmployeeRanking {
  employeeId: string
  employee: Employee
  agency: Agency
  punctualityScore: number
  totalIssues: number
  totalDaysWorked: number
  overtimeHours: number
}

// Filter types
export interface IssueFilters {
  search: string
  agencyIds: string[]
  issueTypes: IssueType[]
  statuses: IssueStatus[]
  dateRange: {
    from: Date | null
    to: Date | null
  }
}

export interface PaginationState {
  pageIndex: number
  pageSize: number
}

// Issue type to labels mapping
export const issueTypeLabels: Record<IssueType, string> = {
  missing_entry: 'Missing Entry Punch',
  missing_exit: 'Missing Exit Punch',
  missing_lunch_out: 'Missing Lunch Out',
  missing_lunch_in: 'Missing Lunch Return',
  missing_clock_out: 'Missing Clock Out',
  late_arrival: 'Late Arrival',
  late_departure: 'Late Departure',
  early_departure: 'Early Departure',
  extended_lunch: 'Extended Lunch',
  no_punches: 'No Punches',
  manual_punch: 'Manual Punch',
  deleted_punch: 'Deleted Punch',
  modified_payment: 'Modified Payment'
}

export const issueStatusLabels: Record<IssueStatus, string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  justified: 'Justified'
}

export const punchTypeLabels: Record<PunchType, string> = {
  entry: 'Entry',
  lunch_out: 'Lunch Out',
  lunch_in: 'Lunch Return',
  exit: 'Exit'
}
