// Archivo fijo de prueba para lib/gate/lint.test.ts: un enlace interno con <a> que ESLint tiene que marcar.
// Lo ignoran el lint del repo (eslint.config.mjs) y el control de archivos sin uso. No lo importa nadie.
export function EnlaceInterno() {
  return <a href="/billing">Billing</a>
}
