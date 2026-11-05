import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { BrandingDto, ContratistaQueryDto, UpdateBrandingDto } from '../dto/contratista.dto'
import { Contratista } from '../entity/contratista.entity'
import { ContratistaRepository } from '../repository/contratista.repository'

/** Legacy usuarios.id_rol — the two roles allowed to manage their own branding. */
const ID_ROL_ADMIN_GENERAL = 1
const ID_ROL_ADMIN_COMPANY = 2

/** Company checks of legacy dealer_edit > Modules & function access (plans/plan-checks-expenses-tint). */
export type CompanyModule = 'expenses' | 'windowTintClosing'

const COMPANY_MODULE_COLUMN: Record<CompanyModule, 'hasExpenses' | 'hasWindowTintClosing'> = {
  expenses: 'hasExpenses',
  windowTintClosing: 'hasWindowTintClosing',
}

@Injectable()
export class ContratistaService extends GlobalBaseService<Contratista, ContratistaQueryDto> {
  constructor(
    @Inject(ContratistaRepository) private readonly repository: ContratistaRepository,
  ) {
    super()
  }

  protected getRepository(): ContratistaRepository {
    return this.repository
  }

  findManyByIds(ids: number[]) {
    return this.repository.findByIds(ids)
  }

  /** Empresas para el campo «Company» del monitor de jobs (solo Admin General, lo exige el controller). */
  findProvidersWithActiveDealers() {
    return this.repository.findProvidersWithActiveDealers()
  }

  /** Dealers valid for this provider (DEALER_REL / id_empresa / self). */
  findScopedByIds(ids: number[], idProvider: number) {
    return this.repository.findScopedByIds(ids, idProvider)
  }

  /**
   * Branding always targets the company resolved from the JWT, never an id sent by
   * the browser — so nobody can repaint another tenant.
   */
  async getBranding(ctx: SrsContext): Promise<BrandingDto> {
    const company = await this.requireCompany(ctx)
    const v0Logo = company.v0LogoImg?.trim() || null
    return {
      accentColor: company.accentColor?.trim() || null,
      logoFile: v0Logo ?? (company.logoImg?.trim() || null),
      logoIsV0: Boolean(v0Logo),
    }
  }

  async updateBranding(ctx: SrsContext, payload: UpdateBrandingDto): Promise<BrandingDto> {
    this.assertCanManageBranding(ctx)
    await this.requireCompany(ctx)
    if (payload.accentColor !== undefined) {
      await this.repository.update(ctx.idDealerProvider, {
        accentColor: payload.accentColor ?? null,
      })
    }
    return this.getBranding(ctx)
  }

  /** Points the v0 logo at an already-stored file. Legacy `logo_img` is left alone. */
  async setV0Logo(ctx: SrsContext, fileName: string): Promise<BrandingDto> {
    this.assertCanManageBranding(ctx)
    await this.requireCompany(ctx)
    await this.repository.update(ctx.idDealerProvider, { v0LogoImg: fileName })
    return this.getBranding(ctx)
  }

  /** Drops the v0 logo, so v0 falls back to whatever legacy shows. */
  async clearV0Logo(ctx: SrsContext): Promise<BrandingDto> {
    this.assertCanManageBranding(ctx)
    await this.requireCompany(ctx)
    await this.repository.update(ctx.idDealerProvider, { v0LogoImg: null })
    return this.getBranding(ctx)
  }

  /**
   * Does the company of the session have this module checked? Read from the DB on every request, so a
   * change in legacy counts right away. The company is the session's (`ctx.idDealerProvider`), the same
   * as legacy `Usuario::getCompany()`.
   */
  async hasCompanyModule(idDealerProvider: number, module: CompanyModule): Promise<boolean> {
    const company = await this.repository.findOne({ where: { id: idDealerProvider } })
    return Number(company?.[COMPANY_MODULE_COLUMN[module]] ?? 0) === 1
  }

  /** 403 when the company doesn't have the module, whatever the user's permissions. */
  async assertCompanyModule(ctx: SrsContext, module: CompanyModule): Promise<void> {
    if (!(await this.hasCompanyModule(ctx.idDealerProvider, module))) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private assertCanManageBranding(ctx: SrsContext) {
    if (ctx.idRol !== ID_ROL_ADMIN_GENERAL && ctx.idRol !== ID_ROL_ADMIN_COMPANY) {
      throw new ForbiddenException('Forbidden')
    }
  }

  private async requireCompany(ctx: SrsContext): Promise<Contratista> {
    const company = await this.repository.findOne({ where: { id: ctx.idDealerProvider } })
    if (!company) throw new NotFoundException('Company not found')
    return company
  }
}
