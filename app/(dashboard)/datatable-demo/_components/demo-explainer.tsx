'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lightbulb } from 'lucide-react'

interface DemoExplainerProps {
  title: string
  description: React.ReactNode
  howConfiguredLabel?: string
  /** Steps with title, optional badge, and a snippet. */
  steps: { title: string; badge?: string; code: string; note?: React.ReactNode }[]
}

/**
 * Side panel shown next to each demo, walking through how the feature is
 * configured. Keep snippets short and concrete — copy-pasteable.
 */
export function DemoExplainer({ title, description, howConfiguredLabel = 'How this is configured', steps }: DemoExplainerProps) {
  return (
    <Card className="gap-0 overflow-hidden border-amber-200 bg-amber-50/40 p-0">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-3 py-2">
        <Lightbulb className="size-3.5 text-amber-700" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
          {howConfiguredLabel}
        </h3>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>

        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.title} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[9px] font-semibold text-white">
                  {i + 1}
                </span>
                <span className="text-xs font-semibold text-foreground">{step.title}</span>
                {step.badge && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                    {step.badge}
                  </Badge>
                )}
              </div>
              <pre className="overflow-x-auto rounded-md border border-amber-200 bg-white p-2 text-[10.5px] leading-snug text-foreground">
                <code>{step.code}</code>
              </pre>
              {step.note && (
                <p className="text-[10.5px] leading-snug text-muted-foreground">
                  {step.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}
