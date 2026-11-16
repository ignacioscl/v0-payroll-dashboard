import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * ESLint del front (plans/plan-buenas-practicas-v0, 3.2). Config plana, como la doc de Next 16
 * (`03-api-reference/05-config/03-eslint.md`): `next lint` ya no existe. Corre en `pnpm run gate` y en el Dockerfile.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Los mismos archivos que la config de Next: ahí está definido el plugin react-hooks.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      // Reglas del compilador de React con muchos casos hoy: en warn, con la cuenta anotada como tarea con nombre
      // `eslint-react-compiler-v0` en plans/plan-general/PLAN-GENERAL.md (14/11/2026: set-state-in-effect 69, refs 2 en
      // grouped-issues-table.tsx, a propósito y documentado). Se pasan a error al corregirlas.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      // Regla global «Cambiar de pantalla es instantáneo»: todo enlace interno es <Link>. `no-html-link-for-pages`
      // no mira App Router, por eso esta. `<a>` solo para externos, descargas y `/api/...`.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'] > Literal[value=/^\\/(?!api\\/)/]",
          message: 'Enlace interno con <a>: usá <Link> de next/link (navegación sin recargar el documento).',
        },
      ],
    },
  },
  globalIgnores(['lib/gate/__lint__/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**', 'public/**']),
])

export default eslintConfig
