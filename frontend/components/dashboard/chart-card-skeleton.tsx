import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Lugar del gráfico mientras se baja recharts (`next/dynamic`, plans/plan-buenas-practicas-v0, 1.6). Misma tarjeta
 * y mismo alto que el gráfico cargando, así la pantalla no salta cuando llega.
 */
export function ChartCardSkeleton({ height = 280 }: { height?: number }) {
  return (
    <Card className="bg-card border-border" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  )
}
