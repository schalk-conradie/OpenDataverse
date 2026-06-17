import { ScrollText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { appNightlyLabel } from "@/core/build-info"
import { changelogEntries, latestChangelogEntry } from "@/core/changelog"
import { cn } from "@/lib/utils"

type ChangelogContentProps = {
  appVersion: string
  className?: string
}

export function ChangelogContent({
  appVersion,
  className,
}: ChangelogContentProps) {
  return (
    <div className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3", className)}>
      <div className="flex min-h-12 items-center justify-between gap-4 border bg-background px-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">OpenDataverse {appVersion}</div>
          <div className="truncate text-xs text-muted-foreground">
            {appNightlyLabel}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          v{latestChangelogEntry.version}
        </Badge>
      </div>

      <ScrollArea className="min-h-0">
        <div className="grid gap-4 pr-3">
          {changelogEntries.map((entry, index) => (
            <article key={entry.version} className="grid gap-2 border-l pl-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{entry.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    v{entry.version} - {entry.date}
                  </p>
                </div>
                {index === 0 && (
                  <Badge variant="secondary" className="shrink-0">
                    Latest
                  </Badge>
                )}
              </div>
              <ul className="grid gap-1 text-xs/relaxed text-muted-foreground">
                {entry.changes.map((change) => (
                  <li key={change} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 bg-muted-foreground" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

type ChangelogDialogProps = {
  appVersion: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangelogDialog({
  appVersion,
  open,
  onOpenChange,
}: ChangelogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-4" />
            Changelog
          </DialogTitle>
          <DialogDescription className="sr-only">
            Recent OpenDataverse changes.
          </DialogDescription>
        </DialogHeader>

        <ChangelogContent appVersion={appVersion} />

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
