import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  formatDownloadDuration,
  type DownloadJob,
  type DownloadJobItem,
} from "./download-job"

type DownloadStatusPanelProps = {
  job: DownloadJob
  now: number
  onDismiss: () => void
}

export function DownloadStatusPanel({
  job,
  now,
  onDismiss,
}: DownloadStatusPanelProps) {
  const progress =
    job.total === 0 ? 0 : Math.round((job.completed / job.total) * 100)
  const failedCount = job.items.filter((item) => item.status === "failed").length
  const duration = formatDownloadDuration(job.startedAt, job.completedAt, now)
  const statusLabel =
    job.status === "running"
      ? "Downloading"
      : job.status === "completed"
        ? "Complete"
        : "Failed"
  const statusClass =
    job.status === "running"
      ? "border-primary/30 bg-primary/5 text-primary"
      : job.status === "completed"
        ? "border-emerald-400/50 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-destructive/30 bg-destructive/10 text-destructive"
  const progressClass =
    job.status === "failed" ? "bg-destructive" : "bg-primary"

  function itemIcon(item: DownloadJobItem) {
    if (item.status === "completed") {
      return <CheckCircle2 className="size-3.5 text-emerald-600" />
    }

    if (item.status === "failed") {
      return <AlertCircle className="size-3.5 text-destructive" />
    }

    if (item.status === "running") {
      return <Loader2 className="size-3.5 animate-spin text-primary" />
    }

    return <span className="size-2 rounded-full bg-slate-300" />
  }

  return (
    <div
      className="mb-3 rounded-xl border border-border bg-muted/30 p-3"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Download className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{job.label}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                statusClass,
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {job.completed} of {job.total} downloaded
            </span>
            {failedCount > 0 && (
              <span className="text-destructive">{failedCount} failed</span>
            )}
            <span>
              {job.status === "running" ? "Elapsed" : "Finished in"} {duration}
            </span>
            <span
              className="max-w-full truncate font-mono"
              title={job.targetPath}
            >
              {job.targetPath}
            </span>
          </div>
        </div>

        {job.status !== "running" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss download status"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            progressClass,
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {job.status === "running" && job.current && (
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span className="truncate font-mono">{job.current}</span>
        </div>
      )}

      {job.error && (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {job.error}
        </div>
      )}

      <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-border bg-background">
        {job.items.map((item) => (
          <div
            key={item.id}
            className="flex min-w-0 items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {itemIcon(item)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">{item.name}</div>
              {item.error && (
                <div className="mt-0.5 text-xs text-destructive">
                  {item.error}
                </div>
              )}
            </div>
            <div className="shrink-0 text-xs capitalize text-muted-foreground">
              {item.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
