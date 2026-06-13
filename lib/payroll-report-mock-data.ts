// =============================================================================
// Payroll Report Mock Data — DEV ONLY
// -----------------------------------------------------------------------------
// Web version of the XLSX exported by:
//   public/modulos/ttk/php/ttk_payroll_report.php  →  ttk_export_xlsx.php
//   (tipo=payroll_xls → XlsPayrollReportService::generateXlsxPayroll)
//
// Column map mirrors the export exactly (applyHeaderTexts/writeRows):
//   ID, Form (payrollTaxName), Dealer, Employee Name, ROLE, Daily Rate,
//   Hourly Rate, Worked Days/Hours, Salary $, Commission $, Hourly/Daily $,
//   Closings(qty/$), Sunday(qty/$), Prorated Day(qty/$), Extra(qty/$),
//   Shop(qty/$), Other(qty/$), Piecework, Net Pay
//   + red rows: "Punch without clock out at <date>" (employeePunchWithError)
// =============================================================================

export interface PayrollWeek {
  value: string // start date YYYY-MM-DD
  label: string // "[24] Jun 8 - Jun 14"
  start: string
  end: string
}

export const PAYROLL_WEEKS: PayrollWeek[] = [
  { value: '2026-04-20', label: '[17] Apr 20 - Apr 26', start: '2026-04-20', end: '2026-04-26' },
  { value: '2026-04-27', label: '[18] Apr 27 - May 3', start: '2026-04-27', end: '2026-05-03' },
  { value: '2026-05-04', label: '[19] May 4 - May 10', start: '2026-05-04', end: '2026-05-10' },
  { value: '2026-05-11', label: '[20] May 11 - May 17', start: '2026-05-11', end: '2026-05-17' },
  { value: '2026-05-18', label: '[21] May 18 - May 24', start: '2026-05-18', end: '2026-05-24' },
  { value: '2026-05-25', label: '[22] May 25 - May 31', start: '2026-05-25', end: '2026-05-31' },
  { value: '2026-06-01', label: '[23] Jun 1 - Jun 7', start: '2026-06-01', end: '2026-06-07' },
  { value: '2026-06-08', label: '[24] Jun 8 - Jun 14', start: '2026-06-08', end: '2026-06-14' },
]

export type PayrollForm = 'W-2' | '1099'

type PayProfile = 'hourly' | 'daily' | 'salary' | 'piecework' | 'mixed'

interface PayrollEmployeeBase {
  employeeId: string
  name: string
  dealer: string
  role: string
  form: PayrollForm
  profile: PayProfile
  /** hourly rate, daily rate or weekly salary depending on profile */
  rate: number
}

export const PAYROLL_ROLES = [
  'Detailer',
  'Washer',
  'Polisher',
  'Supervisor',
  'Interior Specialist',
] as const

export const PAYROLL_DEALERS = [
  'Toyota Miami',
  'Honda Fort Lauderdale',
  'Ford Hollywood',
  'Chevrolet Boca Raton',
  'Nissan Pompano',
  'BMW Coral Springs',
  'Mercedes Plantation',
  'Audi Davie',
  'Lexus Weston',
  'Infiniti Doral',
] as const

const E = (
  employeeId: string,
  name: string,
  dealer: string,
  role: string,
  form: PayrollForm,
  profile: PayProfile,
  rate: number,
): PayrollEmployeeBase => ({ employeeId, name, dealer, role, form, profile, rate })

const EMPLOYEES: PayrollEmployeeBase[] = [
  E('E-1001', 'James Smith', 'Toyota Miami', 'Detailer', 'W-2', 'hourly', 14),
  E('E-1002', 'Maria Garcia', 'Toyota Miami', 'Washer', 'W-2', 'hourly', 12),
  E('E-1003', 'Robert Johnson', 'Toyota Miami', 'Supervisor', 'W-2', 'salary', 980),
  E('E-1004', 'Jennifer Williams', 'Honda Fort Lauderdale', 'Detailer', 'W-2', 'piecework', 0),
  E('E-1005', 'Michael Brown', 'Honda Fort Lauderdale', 'Polisher', '1099', 'mixed', 15),
  E('E-1006', 'Linda Davis', 'Honda Fort Lauderdale', 'Washer', 'W-2', 'hourly', 12),
  E('E-1007', 'David Martinez', 'Ford Hollywood', 'Detailer', '1099', 'piecework', 0),
  E('E-1008', 'Patricia Rodriguez', 'Ford Hollywood', 'Interior Specialist', 'W-2', 'hourly', 16),
  E('E-1009', 'Christopher Wilson', 'Chevrolet Boca Raton', 'Detailer', 'W-2', 'daily', 130),
  E('E-1010', 'Sarah Anderson', 'Chevrolet Boca Raton', 'Washer', 'W-2', 'hourly', 12),
  E('E-1011', 'Carlos Mendez', 'Chevrolet Boca Raton', 'Supervisor', 'W-2', 'salary', 1040),
  E('E-1012', 'Ana Lopez', 'Nissan Pompano', 'Detailer', '1099', 'piecework', 0),
  E('E-1013', 'Kevin Taylor', 'Nissan Pompano', 'Washer', 'W-2', 'daily', 120),
  E('E-1014', 'Sofia Hernandez', 'BMW Coral Springs', 'Detailer', 'W-2', 'hourly', 15),
  E('E-1015', 'Daniel Moore', 'BMW Coral Springs', 'Polisher', 'W-2', 'mixed', 15),
  E('E-1016', 'Laura Jackson', 'BMW Coral Springs', 'Interior Specialist', 'W-2', 'hourly', 17),
  E('E-1017', 'Jorge Ramirez', 'Mercedes Plantation', 'Detailer', '1099', 'piecework', 0),
  E('E-1018', 'Emily White', 'Mercedes Plantation', 'Washer', 'W-2', 'hourly', 13),
  E('E-1019', 'Luis Torres', 'Audi Davie', 'Detailer', 'W-2', 'daily', 135),
  E('E-1020', 'Megan Harris', 'Audi Davie', 'Polisher', 'W-2', 'hourly', 15),
  E('E-1021', 'Pedro Sanchez', 'Audi Davie', 'Supervisor', 'W-2', 'salary', 1010),
  E('E-1022', 'Nicole Clark', 'Lexus Weston', 'Detailer', 'W-2', 'hourly', 14),
  E('E-1023', 'Miguel Flores', 'Lexus Weston', 'Washer', '1099', 'mixed', 13),
  E('E-1024', 'Amanda Lewis', 'Infiniti Doral', 'Detailer', 'W-2', 'hourly', 14),
  E('E-1025', 'Oscar Diaz', 'Infiniti Doral', 'Washer', 'W-2', 'daily', 118),
  E('E-1026', 'Rachel Walker', 'Toyota Miami', 'Polisher', 'W-2', 'piecework', 0),
]

/** Row shape — one line per employee, mirrors PayrollReportPojo fields. */
export interface PayrollReportRow {
  employeeId: string
  form: PayrollForm
  dealer: string
  employee: string
  role: string
  dailyRate: number
  hourlyRate: number
  workedDays: number // dailyPayCount
  workedHours: number // hoursRegPayed
  salary: number
  commission: number
  hourlyDailyPay: number // payHoursReg + payHoursOt + dailyPay
  closingsCount: number
  closings: number
  sundayCount: number
  sunday: number
  proratedCount: number
  prorated: number
  extraCount: number
  extra: number
  shopCount: number
  shop: number
  otherCount: number
  other: number
  piecework: number
  netPay: number
  /** Mirrors the red row + note in the XLSX ("Punch without clock out at …") */
  punchError: string | null
}

/** Deterministic PRNG (mulberry32) — stable rows per (week, employee). */
function rnd(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function getPayrollReportRows(weekValue: string): PayrollReportRow[] {
  const weekIdx = Math.max(0, PAYROLL_WEEKS.findIndex((w) => w.value === weekValue))
  const week = PAYROLL_WEEKS[weekIdx]

  return EMPLOYEES.map((emp, empIdx) => {
    const s = weekIdx * 1000 + empIdx * 7

    let dailyRate = 0
    let hourlyRate = 0
    let workedDays = 0
    let workedHours = 0
    let salary = 0
    let piecework = 0
    let hourlyDailyPay = 0

    if (emp.profile === 'hourly') {
      hourlyRate = emp.rate
      const hours = r2(36 + rnd(s + 1) * 10) // 36–46
      const reg = Math.min(40, hours)
      const ot = Math.max(0, hours - 40)
      workedHours = hours
      hourlyDailyPay = r2(reg * hourlyRate + ot * hourlyRate * 1.5)
    } else if (emp.profile === 'daily') {
      dailyRate = emp.rate
      workedDays = 4 + (rnd(s + 2) < 0.6 ? 1 : 0) + (rnd(s + 3) < 0.25 ? 1 : 0) // 4–6
      hourlyDailyPay = r2(workedDays * dailyRate)
    } else if (emp.profile === 'salary') {
      salary = emp.rate
    } else if (emp.profile === 'piecework') {
      piecework = r2(520 + rnd(s + 4) * 430) // 520–950
    } else {
      // mixed: part hourly + part piecework
      hourlyRate = emp.rate
      const hours = r2(20 + rnd(s + 5) * 10) // 20–30
      workedHours = hours
      hourlyDailyPay = r2(hours * hourlyRate)
      piecework = r2(250 + rnd(s + 6) * 220)
    }

    const commission = emp.role === 'Supervisor' && rnd(s + 7) < 0.45 ? r2(50 + rnd(s + 8) * 80) : 0

    const closingsCount = rnd(s + 9) < 0.28 ? 1 + (rnd(s + 10) < 0.3 ? 1 : 0) : 0
    const closings = r2(closingsCount * 25)

    const sundayCount = rnd(s + 11) < 0.18 ? 1 : 0
    const sunday = r2(sundayCount * 45)

    const proratedCount = rnd(s + 12) < 0.08 ? 1 : 0
    const prorated = r2(proratedCount * (60 + rnd(s + 13) * 40))

    const extraCount = rnd(s + 14) < 0.22 ? 1 : 0
    const extra = r2(extraCount * (30 + rnd(s + 15) * 35))

    const shopCount = rnd(s + 16) < 0.15 ? r2(1 + rnd(s + 17) * 2.5) : 0 // shop hours
    const shop = r2(shopCount * (hourlyRate || 13))

    const otherCount = rnd(s + 18) < 0.06 ? 1 : 0
    const other = r2(otherCount * (20 + rnd(s + 19) * 50))

    const netPay = r2(
      salary + commission + hourlyDailyPay + closings + sunday + prorated + extra + shop + other + piecework,
    )

    // ~8% of rows reproduce the XLSX red-row case (punch without clock out)
    let punchError: string | null = null
    if (rnd(s + 20) < 0.08) {
      const day = new Date(`${week.start}T12:00:00`)
      day.setDate(day.getDate() + Math.floor(rnd(s + 21) * 5))
      const mm = String(day.getMonth() + 1).padStart(2, '0')
      const dd = String(day.getDate()).padStart(2, '0')
      punchError = `Punch without clock out at ${mm}/${dd}/${day.getFullYear()}`
    }

    return {
      employeeId: emp.employeeId,
      form: emp.form,
      dealer: emp.dealer,
      employee: emp.name,
      role: emp.role,
      dailyRate,
      hourlyRate,
      workedDays,
      workedHours,
      salary,
      commission,
      hourlyDailyPay,
      closingsCount,
      closings,
      sundayCount,
      sunday,
      proratedCount,
      prorated,
      extraCount,
      extra,
      shopCount,
      shop,
      otherCount,
      other,
      piecework,
      netPay,
      punchError,
    }
  })
}
