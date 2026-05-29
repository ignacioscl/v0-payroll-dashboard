'use client'

import { Bell, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export function NotificationsPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full hover:bg-muted/80"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-muted-foreground transition-colors group-data-[state=open]:text-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-80 overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-0 shadow-2xl shadow-black/20 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-3 data-[side=top]:slide-in-from-bottom-3"
      >
        <div className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent px-4 py-3">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Notifications</p>
              <p className="text-[11px] text-muted-foreground">Stay updated on punch issues</p>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
          className="flex flex-col items-center px-6 py-8 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 shadow-inner ring-1 ring-border/50">
            <Sparkles className="h-6 w-6 text-primary/70" />
          </div>
          <p className="text-sm font-medium text-foreground">Not yet implemented</p>
          <p className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            Real-time alerts for punch issues will appear here in a future release.
          </p>
        </motion.div>
      </PopoverContent>
    </Popover>
  )
}
