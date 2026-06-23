/**
 * de un texto similar a este
 * The UPDATE statement conflicted with the FOREIGN KEY constraint "fk_cabtipodom". The conflict occurred in database "test_Smartway", table "dbo.tipodomi", column "tidonro".'
 * extrae el nombre de la columna
 * @param errorMessage
 * @returns
 */
export function getColumnNameFromEx(errorMessage: string): string | null {
  // Expresión regular para buscar el nombre de la columna entre comillas dentro del mensaje de error
  const regex = /column '(.*?)'/

  // Ejecutar la expresión regular en el mensaje de error
  const match = errorMessage.match(regex)

  // Extraer el nombre de la columna si se encontró una coincidencia
  return match ? match[1] : null
}

/**
 *
 * @param date
 * @returns YYYY-MM-DD
 */
export function formatDate2String(date: Date): string {
  console.log(date)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0') // El mes se indexa desde 0, por lo que se suma 1
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
/**
 * 
 * @param date recibe YYYY-MM-DDTH24:MM:SST
 * @returns YYYY-MM-DD
 */
export function formatString2YYYYMMDD(date: string): string | null {
  if (!date) {
    return null;
  }

  const match = date.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}
/**
 * 
 * @param dateString devuelve si una fecha YYYY-MM-DD es valida, por ejemplo que no sea 30 de febrero
 * @returns 
 */
export function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split('-').map(Number);

  if (year < 1000 || year > 9999 || month < 1 || month > 12) {
    return false;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return false;
  }

  return true;
}

/**
 * 
 * @param timeString devuelve si un horario HH:MM es valido
 * @returns 
 */
export function isValidTime(timeString: string): boolean {
  const timeRegex = /^\d{2}:\d{2}$/

  if (!timeRegex.test(timeString)) {
    return false;
  }

  const [hour, minutes] = timeString.split(':').map(Number);

  if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
    return false;
  }

  return true;
}

/**
 * 
 * @param timeString devuelve si la hora "from" es mas alta que la hora "to"
 * @returns 
 */
export function isValidTimeBetween(from: string, to: string): boolean {
  const timeRegex = /^\d{2}:\d{2}$/

  if (!timeRegex.test(from) || !timeRegex.test(to)) {
    return false;
  }

  const [hourFrom, minutesFrom] = from.split(':').map(Number);
  const [hourTo, minutesTo] = to.split(':').map(Number);

  if (hourFrom > hourTo) {
    return false;
  }

  return true;
}
export const monthsList = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export const nameMonthsList = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

/**
 * Limpia los campos sensibles de un objeto User
 * Remueve: createdAt, idCompany, password, tempPassword, updatedAt
 * @param user Objeto User a limpiar
 * @returns Objeto User sin los campos sensibles o null si user es null/undefined
 */
export function cleanUserData(user: any): any {
  if (!user) return null
  const { createdAt, idCompany, password, updatedAt, ...rest } = user
  // Remover tempPassword si existe (es privado pero puede venir en el objeto)
  delete rest.tempPassword
  return rest
}