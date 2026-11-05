import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { CompanyModule, ContratistaService } from '../service/contratista.service'

export const COMPANY_MODULE_KEY = 'companyModule'

/**
 * The company of the session needs this module checked (legacy dealer_edit > Modules & function access).
 * Goes with `@UseGuards(SrsJwtGuard, CompanyModuleGuard)`: SrsJwtGuard leaves `request.srsContext`.
 */
export const RequireCompanyModule = (module: CompanyModule) => SetMetadata(COMPANY_MODULE_KEY, module)

@Injectable()
export class CompanyModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ContratistaService) private readonly contratistas: ContratistaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<CompanyModule | undefined>(COMPANY_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!module) return true
    const ctx: SrsContext | undefined = context.switchToHttp().getRequest().srsContext
    if (!ctx?.idDealerProvider) throw new ForbiddenException('Forbidden')
    await this.contratistas.assertCompanyModule(ctx, module)
    return true
  }
}
