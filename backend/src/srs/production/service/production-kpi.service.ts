import { Inject, Injectable } from '@nestjs/common'

import { ProductionKpiRepository } from '../repository/production-kpi.repository'
import { ProductionKpiDto, WoStatusSliceDto } from '../dto/production-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'

/**
 * Lógica de KPIs de producción. El contexto (provider + usuario) ya viene
 * resuelto y validado por el guard. Filtra por provider; las vistas por dealer
 * aplican RESTRICTION_DEALER_V2 con el id del usuario.
 */
@Injectable()
export class ProductionKpiService {
  constructor(
    @Inject(ProductionKpiRepository) private readonly repository: ProductionKpiRepository,
  ) {}

  async getProductionKpis(ctx: SrsContext, fechaDesde: string, fechaHasta: string): Promise<ProductionKpiDto> {
    return this.repository.getProductionKpis(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }

  async getOpenPipeline(ctx: SrsContext): Promise<WoStatusSliceDto[]> {
    return this.repository.getOpenPipeline(ctx.idDealerProvider)
  }

  async getDealerProduction(ctx: SrsContext, fechaDesde: string, fechaHasta: string) {
    return this.repository.getDealerProduction(ctx.idDealerProvider, ctx.idUsuario, fechaDesde, fechaHasta)
  }
}
