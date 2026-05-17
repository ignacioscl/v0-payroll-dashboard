import type { 
  Employee, 
  Agency, 
  Issue, 
  OvertimeRecord,
  DailyAttendance,
  WeeklySchedule,
  IssueType,
  IssueStatus
} from './types'

// Standard work schedule
const standardSchedule: WeeklySchedule = {
  monday: { entry: '08:00', lunchOut: '12:00', lunchIn: '13:00', exit: '17:00' },
  tuesday: { entry: '08:00', lunchOut: '12:00', lunchIn: '13:00', exit: '17:00' },
  wednesday: { entry: '08:00', lunchOut: '12:00', lunchIn: '13:00', exit: '17:00' },
  thursday: { entry: '08:00', lunchOut: '12:00', lunchIn: '13:00', exit: '17:00' },
  friday: { entry: '08:00', lunchOut: '12:00', lunchIn: '13:00', exit: '17:00' },
  saturday: null,
  sunday: null
}

// Fixed base date
export const BASE_DATE = new Date('2026-05-12T12:00:00.000Z')

// MINIMAL DATA: 10 agencies, 25 employees
export const agencies: Agency[] = [
  { id: 'agency-1', name: 'Toyota Miami', address: '100 Main St, Miami, FL', contactPerson: 'John Smith', phone: '305-100-1000', employeeCount: 3 },
  { id: 'agency-2', name: 'Honda Fort Lauderdale', address: '200 Oak Ave, Fort Lauderdale, FL', contactPerson: 'Mary Johnson', phone: '305-200-2000', employeeCount: 3 },
  { id: 'agency-3', name: 'Ford Hollywood', address: '300 Palm Blvd, Hollywood, FL', contactPerson: 'Robert Williams', phone: '305-300-3000', employeeCount: 2 },
  { id: 'agency-4', name: 'Chevrolet Boca Raton', address: '400 Beach Dr, Boca Raton, FL', contactPerson: 'Patricia Brown', phone: '305-400-4000', employeeCount: 3 },
  { id: 'agency-5', name: 'Nissan Pompano', address: '500 Ocean Way, Pompano Beach, FL', contactPerson: 'Michael Davis', phone: '305-500-5000', employeeCount: 2 },
  { id: 'agency-6', name: 'BMW Coral Springs', address: '600 Pine St, Coral Springs, FL', contactPerson: 'Jennifer Garcia', phone: '305-600-6000', employeeCount: 3 },
  { id: 'agency-7', name: 'Mercedes Plantation', address: '700 Cypress Rd, Plantation, FL', contactPerson: 'David Martinez', phone: '305-700-7000', employeeCount: 2 },
  { id: 'agency-8', name: 'Audi Davie', address: '800 Griffin Rd, Davie, FL', contactPerson: 'Linda Rodriguez', phone: '305-800-8000', employeeCount: 3 },
  { id: 'agency-9', name: 'Lexus Weston', address: '900 Weston Rd, Weston, FL', contactPerson: 'James Wilson', phone: '305-900-9000', employeeCount: 2 },
  { id: 'agency-10', name: 'Infiniti Doral', address: '1000 NW 87th Ave, Doral, FL', contactPerson: 'Emily Anderson', phone: '305-101-1001', employeeCount: 2 },
]

export const employees: Employee[] = [
  { id: 'emp-0001', firstName: 'James', lastName: 'Smith', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James1', agencyId: 'agency-1', position: 'Detailer', hireDate: '2024-01-15', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0002', firstName: 'Maria', lastName: 'Garcia', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria2', agencyId: 'agency-1', position: 'Washer', hireDate: '2024-02-20', schedule: standardSchedule, hourlyRate: 12, status: 'active' },
  { id: 'emp-0003', firstName: 'Robert', lastName: 'Johnson', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Robert3', agencyId: 'agency-1', position: 'Supervisor', hireDate: '2023-06-10', schedule: standardSchedule, hourlyRate: 18, status: 'active' },
  { id: 'emp-0004', firstName: 'Jennifer', lastName: 'Williams', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jennifer4', agencyId: 'agency-2', position: 'Detailer', hireDate: '2024-03-01', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0005', firstName: 'Michael', lastName: 'Brown', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael5', agencyId: 'agency-2', position: 'Polisher', hireDate: '2024-01-22', schedule: standardSchedule, hourlyRate: 15, status: 'active' },
  { id: 'emp-0006', firstName: 'Linda', lastName: 'Davis', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Linda6', agencyId: 'agency-2', position: 'Washer', hireDate: '2023-11-05', schedule: standardSchedule, hourlyRate: 12, status: 'active' },
  { id: 'emp-0007', firstName: 'David', lastName: 'Martinez', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David7', agencyId: 'agency-3', position: 'Detailer', hireDate: '2024-04-15', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0008', firstName: 'Patricia', lastName: 'Rodriguez', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Patricia8', agencyId: 'agency-3', position: 'Interior Specialist', hireDate: '2023-09-20', schedule: standardSchedule, hourlyRate: 16, status: 'active' },
  { id: 'emp-0009', firstName: 'Christopher', lastName: 'Wilson', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chris9', agencyId: 'agency-4', position: 'Detailer', hireDate: '2024-02-10', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0010', firstName: 'Sarah', lastName: 'Anderson', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah10', agencyId: 'agency-4', position: 'Washer', hireDate: '2024-05-01', schedule: standardSchedule, hourlyRate: 12, status: 'active' },
  { id: 'emp-0011', firstName: 'Daniel', lastName: 'Thomas', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Daniel11', agencyId: 'agency-4', position: 'Supervisor', hireDate: '2023-03-15', schedule: standardSchedule, hourlyRate: 18, status: 'active' },
  { id: 'emp-0012', firstName: 'Emily', lastName: 'Taylor', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily12', agencyId: 'agency-5', position: 'Detailer', hireDate: '2024-01-08', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0013', firstName: 'Matthew', lastName: 'Moore', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Matt13', agencyId: 'agency-5', position: 'Polisher', hireDate: '2023-12-01', schedule: standardSchedule, hourlyRate: 15, status: 'active' },
  { id: 'emp-0014', firstName: 'Ashley', lastName: 'Jackson', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ashley14', agencyId: 'agency-6', position: 'Detailer', hireDate: '2024-03-20', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0015', firstName: 'Andrew', lastName: 'Martin', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Andrew15', agencyId: 'agency-6', position: 'Washer', hireDate: '2024-02-15', schedule: standardSchedule, hourlyRate: 12, status: 'active' },
  { id: 'emp-0016', firstName: 'Jessica', lastName: 'Lee', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jessica16', agencyId: 'agency-6', position: 'Interior Specialist', hireDate: '2023-08-10', schedule: standardSchedule, hourlyRate: 16, status: 'active' },
  { id: 'emp-0017', firstName: 'Joshua', lastName: 'Harris', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Josh17', agencyId: 'agency-7', position: 'Detailer', hireDate: '2024-04-01', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0018', firstName: 'Amanda', lastName: 'Clark', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Amanda18', agencyId: 'agency-7', position: 'Polisher', hireDate: '2023-10-25', schedule: standardSchedule, hourlyRate: 15, status: 'active' },
  { id: 'emp-0019', firstName: 'Ryan', lastName: 'Lewis', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ryan19', agencyId: 'agency-8', position: 'Detailer', hireDate: '2024-01-30', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0020', firstName: 'Stephanie', lastName: 'Walker', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Steph20', agencyId: 'agency-8', position: 'Washer', hireDate: '2024-03-10', schedule: standardSchedule, hourlyRate: 12, status: 'active' },
  { id: 'emp-0021', firstName: 'Brandon', lastName: 'Hall', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Brandon21', agencyId: 'agency-8', position: 'Supervisor', hireDate: '2023-05-20', schedule: standardSchedule, hourlyRate: 18, status: 'active' },
  { id: 'emp-0022', firstName: 'Nicole', lastName: 'Allen', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nicole22', agencyId: 'agency-9', position: 'Detailer', hireDate: '2024-02-28', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0023', firstName: 'Kevin', lastName: 'Young', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kevin23', agencyId: 'agency-9', position: 'Interior Specialist', hireDate: '2023-07-15', schedule: standardSchedule, hourlyRate: 16, status: 'active' },
  { id: 'emp-0024', firstName: 'Melissa', lastName: 'King', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Melissa24', agencyId: 'agency-10', position: 'Detailer', hireDate: '2024-04-20', schedule: standardSchedule, hourlyRate: 14, status: 'active' },
  { id: 'emp-0025', firstName: 'Tyler', lastName: 'Wright', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tyler25', agencyId: 'agency-10', position: 'Polisher', hireDate: '2023-11-30', schedule: standardSchedule, hourlyRate: 15, status: 'active' },
]

// Issue types matching the KPI cards
const issueTypes: IssueType[] = [
  'missing_lunch_out', 'missing_lunch_in', 'missing_clock_out', 'missing_exit',
  'manual_punch', 'deleted_punch', 'modified_payment', 'late_arrival', 'late_departure',
  'early_departure', 'missing_entry', 'extended_lunch', 'no_punches'
]

const issueDescriptions: Record<IssueType, (min: number) => string> = {
  late_arrival: (min) => `Arrived ${min} minutes late`,
  late_departure: (min) => `Left ${min} minutes after scheduled time`,
  early_departure: (min) => `Left ${min} minutes early`,
  missing_entry: () => 'Did not punch in',
  missing_exit: () => 'Did not punch out',
  missing_clock_out: () => 'Did not clock out at end of shift',
  missing_lunch_out: () => 'Did not punch for lunch out',
  missing_lunch_in: () => 'Did not punch for lunch return',
  extended_lunch: (min) => `Extended lunch by ${min} minutes`,
  no_punches: () => 'No punches recorded for the day',
  manual_punch: () => 'Punch was entered manually by supervisor',
  deleted_punch: () => 'A punch record was deleted',
  modified_payment: () => 'Payment record was modified after processing'
}

// Generate ONLY 7 days of issues with ~5 issues per day = ~35 total issues
export const issues: Issue[] = []
const statuses: IssueStatus[] = ['pending', 'reviewed', 'justified']

for (let day = 0; day < 7; day++) {
  const date = new Date(BASE_DATE)
  date.setDate(date.getDate() - day)
  const dateStr = date.toISOString().split('T')[0]
  
  // 4-6 issues per day
  const count = 4 + (day % 3)
  for (let i = 0; i < count; i++) {
    const empIdx = (day * 3 + i) % employees.length
    const emp = employees[empIdx]
    const type = issueTypes[(day + i) % issueTypes.length]
    const mins = 5 + ((day * 7 + i * 3) % 30)
    
    issues.push({
      id: `issue-${day}-${i}`,
      employeeId: emp.id,
      agencyId: emp.agencyId,
      date: dateStr,
      type,
      description: issueDescriptions[type](mins),
      expectedTime: type.includes('entry') || type === 'late_arrival' ? '08:00' : type.includes('lunch_out') ? '12:00' : type.includes('lunch_in') ? '13:00' : '17:00',
      actualTime: type.startsWith('missing') || type === 'no_punches' ? null : `${type === 'late_arrival' ? '08' : '17'}:${String(mins % 60).padStart(2, '0')}`,
      minutesDiff: type.startsWith('missing') || type === 'no_punches' ? null : mins,
      status: statuses[day < 2 ? 0 : (i % 3)],
      createdAt: `${dateStr}T09:00:00.000Z`
    })
  }
}

// Overtime: only 10 records
export const overtimeRecords: OvertimeRecord[] = employees.slice(0, 10).map((emp, i) => {
  const date = new Date(BASE_DATE)
  date.setDate(date.getDate() - i)
  const hrs = 1 + (i % 3) * 0.5
  return {
    id: `ot-${i}`,
    employeeId: emp.id,
    agencyId: emp.agencyId,
    date: date.toISOString().split('T')[0],
    regularHours: 8,
    overtimeHours: hrs,
    overtimeCost: Math.round(hrs * emp.hourlyRate * 1.5 * 100) / 100
  }
})

// Daily attendance: 7 days
export const dailyAttendance: DailyAttendance[] = Array.from({ length: 7 }, (_, i) => {
  const date = new Date(BASE_DATE)
  date.setDate(date.getDate() - i)
  const dateStr = date.toISOString().split('T')[0]
  return {
    date: dateStr,
    totalEmployees: 25,
    present: 23 - (i % 2),
    absent: 2 + (i % 2),
    late: 2 + (i % 3),
    issues: issues.filter(issue => issue.date === dateStr).length
  }
})

// Simple helper functions
export const getEmployeeById = (id: string) => employees.find(e => e.id === id)
export const getAgencyById = (id: string) => agencies.find(a => a.id === id)
export const getIssuesByEmployee = (id: string) => issues.filter(i => i.employeeId === id)
export const getIssuesByAgency = (id: string) => issues.filter(i => i.agencyId === id)
export const getEmployeesByAgency = (id: string) => employees.filter(e => e.agencyId === id)
export const getOvertimeByEmployee = (id: string) => overtimeRecords.filter(ot => ot.employeeId === id)
export const getOvertimeByAgency = (id: string) => overtimeRecords.filter(ot => ot.agencyId === id)

export function getAgencyStats() {
  return agencies.map(a => ({
    agencyId: a.id,
    agencyName: a.name,
    totalEmployees: getEmployeesByAgency(a.id).length,
    totalIssues: getIssuesByAgency(a.id).length,
    totalOvertimeHours: getOvertimeByAgency(a.id).reduce((s, ot) => s + ot.overtimeHours, 0),
    estimatedCost: getOvertimeByAgency(a.id).reduce((s, ot) => s + ot.overtimeCost, 0),
    punctualityRate: Math.max(70, 100 - getIssuesByAgency(a.id).length * 3)
  }))
}

export function getEmployeeRankings() {
  return employees.map(e => ({
    employeeId: e.id,
    employee: e,
    agency: getAgencyById(e.agencyId)!,
    punctualityScore: Math.max(60, 100 - getIssuesByEmployee(e.id).length * 8),
    totalIssues: getIssuesByEmployee(e.id).length,
    totalDaysWorked: 7,
    overtimeHours: getOvertimeByEmployee(e.id).reduce((s, ot) => s + ot.overtimeHours, 0)
  })).sort((a, b) => b.punctualityScore - a.punctualityScore)
}

export function getDashboardKPIs() {
  const todayStr = BASE_DATE.toISOString().split('T')[0]
  return {
    activeEmployees: 25,
    todayIssues: issues.filter(i => i.date === todayStr).length,
    weekIssues: issues.length,
    scheduleIssues: issues.filter(i => ['late_arrival', 'early_departure'].includes(i.type)).length,
    weekOvertime: overtimeRecords.reduce((s, ot) => s + ot.overtimeHours, 0),
    weekOvertimeCost: overtimeRecords.reduce((s, ot) => s + ot.overtimeCost, 0),
    pendingIssues: issues.filter(i => i.status === 'pending').length,
    totalAgencies: 10
  }
}

export function getTrendData() {
  return dailyAttendance.slice().reverse().map(d => ({
    date: d.date,
    displayDate: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
    issues: d.issues,
    lateArrivals: issues.filter(i => i.date === d.date && i.type === 'late_arrival').length,
    missingPunches: issues.filter(i => i.date === d.date && i.type.startsWith('missing')).length,
    present: d.present,
    absent: d.absent
  }))
}

export function getIssueDistribution() {
  return issueTypes.map(type => ({
    type,
    count: issues.filter(i => i.type === type).length,
    percentage: Math.round((issues.filter(i => i.type === type).length / issues.length) * 100)
  }))
}

export function getTopAgenciesWithIssues(limit = 5) {
  return agencies.map(a => ({ agency: a, issueCount: getIssuesByAgency(a.id).length }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, limit)
}
