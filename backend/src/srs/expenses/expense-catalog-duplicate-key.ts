/**
 * Clave de «posible duplicado» de una compañía o categoría de gastos (GENERIC_DATA 34/35), para el switch
 * «Possible duplicates» de Settings (plans/plan-expenses-posibles-duplicados, D1): el mismo nombre si se ignoran
 * mayúsculas, espacios, signos, acentos y un «The» al principio. Nada de parecidos sueltos: «Amazon» y «Amazon.com»
 * no se juntan. Es el único lugar donde se decide qué nombres son «parecidos».
 *
 * Un nombre que queda vacío (solo signos) devuelve '' y nunca agrupa.
 */
export function catalogDuplicateKey(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}
