import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  X,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { appNightlyLabel, appVersion } from "@/core/build-info"
import { isTauriRuntime } from "@/core/desktop/runtime"
import { cn } from "@/lib/utils"
import type { AppNotification } from "@/store/workspace-store"

const githubIssueUrl = "https://github.com/schalk-conradie/OpenDataverse/issues/new"

type AppNotificationCenterProps = {
  notification?: AppNotification
  onDismiss: (notificationId?: string) => void
}

export function AppNotificationCenter({
  notification,
  onDismiss,
}: AppNotificationCenterProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [clickedNotificationId, setClickedNotificationId] = useState<string>()
  const [copyState, setCopyState] = useState<{
    notificationId?: string
    status: "idle" | "copied" | "failed"
  }>({ status: "idle" })

  const errorLog = useMemo(() => {
    if (!notification) {
      return ""
    }

    return [
      "OpenDataverse error report",
      `Version: ${appVersion}`,
      `Build: ${appNightlyLabel}`,
      `Runtime: ${isTauriRuntime() ? "Tauri" : "Browser preview"}`,
      `Time: ${notification.createdAt}`,
      `Title: ${notification.title ?? "Operation failed"}`,
      "",
      "Message:",
      notification.message,
      "",
      "Details:",
      notification.details ?? notification.message,
    ].join("\n")
  }, [notification])

  useEffect(() => {
    if (!notification || clickedNotificationId === notification.id) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      onDismiss(notification.id)
    }, 5000)

    return () => window.clearTimeout(timeoutId)
  }, [clickedNotificationId, notification, onDismiss])

  if (!notification) {
    return null
  }
  const activeNotification = notification

  function keepNotificationOpen() {
    setClickedNotificationId(activeNotification.id)
  }

  async function copyErrorLog() {
    try {
      await navigator.clipboard.writeText(errorLog)
      setCopyState({ notificationId: activeNotification.id, status: "copied" })
    } catch {
      setCopyState({ notificationId: activeNotification.id, status: "failed" })
    }
  }

  async function openGitHubIssue() {
    const url = new URL(githubIssueUrl)
    url.searchParams.set(
      "title",
      `[Error] ${activeNotification.title ?? "Operation failed"}`,
    )
    url.searchParams.set(
      "body",
      [
        "### Error log",
        "",
        "```text",
        errorLog.replaceAll("```", "` ` `"),
        "```",
      ].join("\n"),
    )

    try {
      if (isTauriRuntime()) {
        await openUrl(url.toString())
      } else {
        window.open(url.toString(), "_blank", "noopener,noreferrer")
      }
    } catch {
      window.open(url.toString(), "_blank", "noopener,noreferrer")
    }
  }

  const isError = activeNotification.severity === "error"
  const copyStatus =
    copyState.notificationId === activeNotification.id
      ? copyState.status
      : "idle"
  const Icon = isError
    ? AlertTriangle
    : activeNotification.severity === "success"
      ? CheckCircle2
      : Info

  return (
    <>
      <div
        className="fixed right-4 bottom-4 z-[70] w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl shadow-black/10"
        onPointerDownCapture={keepNotificationOpen}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background",
              isError && "border-destructive/20 text-destructive",
              notification.severity === "success" && "text-emerald-600",
              notification.severity === "info" && "text-primary",
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium", isError && "text-destructive")}>
              {notification.title ??
                (isError ? "Operation failed" : "OpenDataverse")}
            </p>
            <p className="mt-1 line-clamp-3 break-words text-muted-foreground">
              {notification.message}
            </p>
            {isError && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-2"
                onClick={() => {
                  keepNotificationOpen()
                  setDetailOpen(true)
                }}
              >
                Details
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(notification.id)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              {notification.title ?? "Operation failed"}
            </DialogTitle>
            <DialogDescription>
              The operation did not complete. Review the details below before
              retrying.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-auto rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-[11px] break-words whitespace-pre-wrap text-destructive">
            {notification.details ?? notification.message}
          </div>
          <DialogFooter showCloseButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyErrorLog()}
            >
              {copyStatus === "copied" ? <CheckCircle2 /> : <Copy />}
              {copyStatus === "copied"
                ? "Copied"
                : copyStatus === "failed"
                  ? "Copy failed"
                  : "Copy log"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void openGitHubIssue()}
            >
              <ExternalLink />
              GitHub issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
