'use client'

import { BarChart3 } from 'lucide-react'

/**
 * What a chart card shows when it has nothing to draw (no dealers, no dates, or no data): the message in the place of
 * the chart, at the chart height, so the card keeps its size. An empty recharts chart is a blank box that paints a gray
 * rectangle on hover.
 */
export function ChartEmptyState({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
      style={{ height }}
      data-testid="chart-empty-state"
    >
      <BarChart3 className="size-8 opacity-40" aria-hidden />
      <p>{message}</p>
    </div>
  )
}
