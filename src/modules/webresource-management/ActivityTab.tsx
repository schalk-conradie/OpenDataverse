import type { JSX } from "react"
import { AlertCircle, History, Loader2, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TabsContent } from "@/components/ui/tabs"
import type { WebResourceActivity } from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { cn } from "@/lib/utils"

type ActivityTabProps = {
  activities: readonly WebResourceActivity[]
  error: unknown
  fetching: boolean
  loading: boolean
  onRefresh: () => void
}

function formatActivityTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function ActivityKindPill({
  activity,
}: {
  activity: WebResourceActivity
}): JSX.Element {
  const styles: Record<WebResourceActivity["kind"], string> = {
    change: "border-slate-300/60 bg-slate-50/70 text-slate-700",
    publish: "border-emerald-400/50 bg-emerald-50/70 text-emerald-700",
    create: "border-emerald-400/50 bg-emerald-50/70 text-emerald-700",
    delete: "border-destructive/30 bg-destructive/10 text-destructive",
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
        styles[activity.kind],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {activity.kind === "publish"
        ? "Publish"
        : activity.kind === "create"
          ? "Create"
          : activity.kind === "delete"
            ? "Delete"
            : "Change"}
    </span>
  )
}

export function ActivityTab({
  activities,
  error,
  fetching,
  loading,
  onRefresh,
}: ActivityTabProps): JSX.Element {
  return (
    <TabsContent
      value="activity"
      className="min-h-0 flex-1 overflow-auto p-4"
    >
      <div className="max-w-4xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Dataverse activity</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Latest audited web resource changes and publish events when
              Dataverse records them.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={fetching}
          >
            {fetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading Dataverse audit history
          </div>
        )}

        {error != null && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="size-4" />
              Audit history unavailable
            </div>
            <p className="mt-1 max-w-2xl text-xs">
              {formatErrorMessage(
                error,
                "Dataverse did not return web resource audit history for this environment.",
              )}
            </p>
          </div>
        )}

        {!loading && error == null && activities.length === 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-6">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
              <History className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-center text-sm font-medium">
              No audited web resource activity
            </div>
            <p className="mx-auto mt-1 max-w-md text-center text-xs text-muted-foreground">
              Turn on Dataverse auditing for the web resource table and its
              columns to capture change history.
            </p>
          </div>
        )}

        {error == null && activities.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            {activities.map((activity, index) => (
              <article
                key={activity.id}
                className={cn(
                  "grid gap-3 p-3 text-sm md:grid-cols-[180px_minmax(0,1fr)]",
                  index !== activities.length - 1 && "border-b border-border",
                )}
              >
                <div className="space-y-1">
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatActivityTime(activity.occurredOn)}
                  </div>
                  <ActivityKindPill activity={activity} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-xs">
                      {activity.webResourceName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {activity.action}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{activity.detail}</div>
                  <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>By {activity.actorName}</span>
                    {activity.actorDomain && (
                      <span className="font-mono">{activity.actorDomain}</span>
                    )}
                    <span>{activity.operation}</span>
                  </div>
                  {activity.changedAttributes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activity.changedAttributes.slice(0, 6).map((field) => (
                        <Badge key={field} variant="outline">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </TabsContent>
  )
}
