import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Issue, Employee, Agency } from './types'
import { issueTypeLabels, issueStatusLabels } from './types'

// Export issues to Excel
export function exportIssuesToExcel(
  issues: Issue[],
  employees: Map<string, Employee>,
  agencies: Map<string, Agency>,
  filename = 'problemas-ponchadas'
) {
  const data = issues.map(issue => {
    const employee = employees.get(issue.employeeId)
    const agency = agencies.get(issue.agencyId)
    
    return {
      'ID Empleado': issue.employeeId,
      'Nombre': employee ? `${employee.firstName} ${employee.lastName}` : '-',
      'Agencia': agency?.name || '-',
      'Fecha': format(new Date(issue.date), 'dd/MM/yyyy', { locale: es }),
      'Día': format(new Date(issue.date), 'EEEE', { locale: es }),
      'Tipo de Problema': issueTypeLabels[issue.type],
      'Descripción': issue.description,
      'Hora Esperada': issue.expectedTime || '-',
      'Hora Real': issue.actualTime || '-',
      'Diferencia (min)': issue.minutesDiff || '-',
      'Estado': issueStatusLabels[issue.status],
      'Fecha Registro': format(new Date(issue.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Problemas')

  // Auto-fit columns
  const maxWidth = 30
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}

// Export employees to Excel
export function exportEmployeesToExcel(
  employees: (Employee & { agency?: Agency; issueCount: number; overtimeHours: number })[],
  filename = 'empleados'
) {
  const data = employees.map(emp => ({
    'ID': emp.id,
    'Nombre': emp.firstName,
    'Apellido': emp.lastName,
    'Agencia': emp.agency?.name || '-',
    'Posición': emp.position,
    'Fecha Ingreso': format(new Date(emp.hireDate), 'dd/MM/yyyy', { locale: es }),
    'Tarifa por Hora': `$${emp.hourlyRate}`,
    'Incidencias (30 días)': emp.issueCount,
    'Horas Extra (30 días)': emp.overtimeHours,
    'Estado': emp.status === 'active' ? 'Activo' : 'Inactivo'
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados')

  const maxWidth = 25
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}

// Export agency costs to Excel
export function exportAgencyCostsToExcel(
  agencyStats: {
    agencyId: string
    agencyName: string
    totalEmployees: number
    totalIssues: number
    totalOvertimeHours: number
    estimatedCost: number
    punctualityRate: number
  }[],
  filename = 'costos-agencias'
) {
  const data = agencyStats.map(stat => ({
    'Agencia': stat.agencyName,
    'Empleados': stat.totalEmployees,
    'Incidencias': stat.totalIssues,
    'Horas Extra': stat.totalOvertimeHours,
    'Costo Horas Extra': `$${stat.estimatedCost.toLocaleString()}`,
    'Tasa Puntualidad': `${stat.punctualityRate}%`,
    'Costo/Empleado': `$${stat.totalEmployees > 0 ? Math.round(stat.estimatedCost / stat.totalEmployees) : 0}`
  }))

  // Add totals row
  const totals = {
    'Agencia': 'TOTAL',
    'Empleados': agencyStats.reduce((sum, s) => sum + s.totalEmployees, 0),
    'Incidencias': agencyStats.reduce((sum, s) => sum + s.totalIssues, 0),
    'Horas Extra': Math.round(agencyStats.reduce((sum, s) => sum + s.totalOvertimeHours, 0) * 10) / 10,
    'Costo Horas Extra': `$${Math.round(agencyStats.reduce((sum, s) => sum + s.estimatedCost, 0)).toLocaleString()}`,
    'Tasa Puntualidad': `${Math.round(agencyStats.reduce((sum, s) => sum + s.punctualityRate, 0) / agencyStats.length)}%`,
    'Costo/Empleado': '-'
  }
  data.push(totals as typeof data[0])

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Costos por Agencia')

  const maxWidth = 25
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}

// Export overtime to Excel
export function exportOvertimeToExcel(
  overtimeData: {
    employeeId: string
    employeeName: string
    agencyName: string
    totalHours: number
    totalCost: number
    daysWithOvertime: number
  }[],
  filename = 'horas-extras'
) {
  const data = overtimeData.map(item => ({
    'ID Empleado': item.employeeId,
    'Nombre': item.employeeName,
    'Agencia': item.agencyName,
    'Total Horas Extra': item.totalHours,
    'Costo Total': `$${item.totalCost.toLocaleString()}`,
    'Días con HE': item.daysWithOvertime,
    'Promedio/Día': Math.round((item.totalHours / item.daysWithOvertime) * 10) / 10
  }))

  // Add totals
  const totals = {
    'ID Empleado': '',
    'Nombre': 'TOTAL',
    'Agencia': '',
    'Total Horas Extra': Math.round(overtimeData.reduce((sum, i) => sum + i.totalHours, 0) * 10) / 10,
    'Costo Total': `$${Math.round(overtimeData.reduce((sum, i) => sum + i.totalCost, 0)).toLocaleString()}`,
    'Días con HE': overtimeData.reduce((sum, i) => sum + i.daysWithOvertime, 0),
    'Promedio/Día': '-'
  }
  data.push(totals as typeof data[0])

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Horas Extras')

  const maxWidth = 25
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}

// Export rankings to Excel
export function exportRankingsToExcel(
  rankings: {
    employeeId: string
    employeeName: string
    agencyName: string
    punctualityScore: number
    totalIssues: number
    totalDaysWorked: number
    overtimeHours: number
  }[],
  filename = 'ranking-empleados'
) {
  const data = rankings.map((item, index) => ({
    'Posición': index + 1,
    'ID Empleado': item.employeeId,
    'Nombre': item.employeeName,
    'Agencia': item.agencyName,
    'Score Puntualidad': `${item.punctualityScore}%`,
    'Incidencias': item.totalIssues,
    'Días Trabajados': item.totalDaysWorked,
    'Horas Extra': item.overtimeHours
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ranking')

  const maxWidth = 25
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key as keyof typeof row] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}

// Generic export function
export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  sheetName: string,
  filename: string
) {
  if (data.length === 0) {
    alert('No hay datos para exportar')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  const maxWidth = 30
  const colWidths = Object.keys(data[0]).map(key => ({
    wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String(row[key] || '').length)))
  }))
  worksheet['!cols'] = colWidths

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`)
}
