import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

import { SrsAuthContextService } from './srs-auth-context.service'

/**
 * Valida el JWT EXACTAMENTE como PHP (firebase/php-jwt):
 *   - Header `Authorization: Bearer <token>` (igual que headauth.php)
 *   - HS256 + secret JWT_AUTH (= JWT_SECRET en el .env)
 *   - El payload es { iat, data: { id, codigoInterno, idUsuarioRolrel } }
 *
 * Con el `id` del usuario resuelve provider + tipo (SrsAuthContextService) y lo
 * deja en request.srsContext para filtrar por provider/dealers en cada query.
 */
@Injectable()
export class SrsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly authContext: SrsAuthContextService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest()
    const header = (request.headers['authorization'] ?? '') as string
    const token = header.replace('Bearer ', '').trim()
    if (!token) {
      throw new UnauthorizedException('Falta el token (Authorization: Bearer)')
    }

    let payload: any
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('jwtSecret'),
        algorithms: ['HS256'],
      })
    } catch {
      throw new UnauthorizedException('Token inválido')
    }

    const data = payload?.data ?? {}
    const idUsuario = Number(data.id)
    if (!idUsuario) {
      throw new UnauthorizedException('Token sin usuario')
    }

    const fallbackProvider = Number(request.query?.idDealerProvider ?? 0) || null

    const context = await this.authContext.resolveContext(
      idUsuario,
      data.idUsuarioRolrel ? Number(data.idUsuarioRolrel) : null,
      fallbackProvider,
    )
    if (!context.idDealerProvider) {
      throw new UnauthorizedException('No se pudo resolver el provider del usuario')
    }

    request.srsContext = context
    return true
  }
}
