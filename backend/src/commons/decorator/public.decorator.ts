import { SetMetadata } from '@nestjs/common'

/**
 * Ruta sin login (plans/plan-buenas-practicas-v0, 3.5; https://docs.nestjs.com/security/authentication#enable-authentication-globally).
 * El guard global (`SrsJwtGuard` como `APP_GUARD`) cierra todo lo demás. **Siempre por método, nunca en la clase**: uno
 * en la clase abre también las rutas que se sumen después. Lo controla `src/commons/guards/routes.spec.ts`.
 */
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
