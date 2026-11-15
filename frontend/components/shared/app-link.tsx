import Link from 'next/link'

/**
 * El único componente de enlace del proyecto (regla global «Cambiar de pantalla es instantáneo», punto 1;
 * plans/plan-buenas-practicas-v0, 4.3). Todo enlace interno pasa por acá: navegación sin recargar el documento y
 * precarga. Sin estilos propios. Pasa la `ref` (React 19), así anda con `asChild` de Radix. `<a>` solo para enlaces
 * externos, descargas y `/api/...` (el lint marca un `<a href="/…">`; `lib/links.test.ts` controla los imports).
 */
export function AppLink(props: React.ComponentProps<typeof Link>) {
  return <Link {...props} />
}
