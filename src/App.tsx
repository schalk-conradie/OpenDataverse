import { useMemo, useState } from "react"
import {
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react"

import { AppNotificationCenter } from "@/components/app-shell/app-notification-center"
import {
  EnvironmentFormDialog,
  ManageEnvironmentsDialog,
} from "@/components/app-shell/environment-dialogs"
import { SettingsDialog } from "@/components/app-shell/settings-dialog"
import { ToolWindowContent } from "@/components/app-shell/tool-window-content"
import { useAppPresentation } from "@/components/app-shell/use-app-presentation"
import { useAppStartup } from "@/components/app-shell/use-app-startup"
import { useAppUpdater } from "@/components/app-shell/use-app-updater"
import { useEnvironmentHeartbeat } from "@/components/app-shell/use-environment-heartbeat"
import { ChangelogDialog } from "@/components/changelog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { appNightlyLabel } from "@/core/build-info"
import {
  getEnvironmentById,
  sortEnvironmentsByName,
  type ToolId,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import { getToolDefinition, toolRegistry } from "@/modules/tool-registry"
import { useWorkspaceStore } from "@/store/workspace-store"

type SidebarToolGroup = {
  id: string
  title: string
  toolIds: ToolId[]
}

const sidebarToolGroups: SidebarToolGroup[] = [
  {
    id: "ai",
    title: "AI",
    toolIds: ["ai-chat", "form-logic-copilot", "ai-agent-experimental"],
  },
  {
    id: "dev-tools",
    title: "Dev Tools",
    toolIds: ["autopublisher", "fetchxml-builder", "plugin-registration"],
  },
  {
    id: "solution-tools",
    title: "Solution Tools",
    toolIds: ["solution-explorer"],
  },
]

type PendingToolOpen = {
  toolId: ToolId
  newWindow?: boolean
}

function App() {
  const config = useWorkspaceStore((state) => state.config)
  const loadState = useWorkspaceStore((state) => state.loadState)
  const openWindows = useWorkspaceStore((state) => state.openWindows)
  const activeWindowId = useWorkspaceStore((state) => state.activeWindowId)
  const lastMessage = useWorkspaceStore((state) => state.lastMessage)
  const lastNotification = useWorkspaceStore((state) => state.lastNotification)
  const selectEnvironment = useWorkspaceStore(
    (state) => state.selectEnvironment,
  )
  const connectEnvironment = useWorkspaceStore(
    (state) => state.connectEnvironment,
  )
  const openTool = useWorkspaceStore((state) => state.openTool)
  const closeWindow = useWorkspaceStore((state) => state.closeWindow)
  const activateWindow = useWorkspaceStore((state) => state.activateWindow)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const dismissNotification = useWorkspaceStore(
    (state) => state.dismissNotification,
  )
  const experimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.userSettings.dangerZone.experimentalAiAgentEnabled,
  )
  const [pendingToolOpen, setPendingToolOpen] = useState<PendingToolOpen>()
  const [collapsedToolGroupIds, setCollapsedToolGroupIds] = useState(
    () => new Set<string>(),
  )

  const { runningAppVersion, changelogOpen, setChangelogOpen } = useAppStartup()
  const { availableUpdate, installingUpdate, updateProgress, installUpdate } =
    useAppUpdater()

  useAppPresentation()
  useEnvironmentHeartbeat()

  const activeEnvironment = getEnvironmentById(
    config,
    config.currentEnvironmentId,
  )
  const sortedEnvironments = useMemo(
    () => sortEnvironmentsByName(config.environments),
    [config.environments],
  )
  const activeEnvironmentNeedsReconnect =
    activeEnvironment?.authState === "expired" ||
    activeEnvironment?.authState === "error"
  const activeWindow = useMemo(
    () => openWindows.find((window) => window.id === activeWindowId),
    [activeWindowId, openWindows],
  )
  const pendingTool = pendingToolOpen
    ? getToolDefinition(pendingToolOpen.toolId)
    : undefined
  const visibleTools = useMemo(
    () =>
      toolRegistry.filter(
        (tool) =>
          tool.id !== "ai-agent-experimental" || experimentalAiAgentEnabled,
      ),
    [experimentalAiAgentEnabled],
  )
  const visibleToolGroups = useMemo(() => {
    const toolsById = new Map(visibleTools.map((tool) => [tool.id, tool]))

    return sidebarToolGroups
      .map((group) => ({
        ...group,
        tools: group.toolIds.flatMap((toolId) => {
          const tool = toolsById.get(toolId)

          return tool ? [tool] : []
        }),
      }))
      .filter((group) => group.tools.length > 0)
  }, [visibleTools])

  function toggleToolGroup(groupId: string) {
    setCollapsedToolGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  function requestEnvironmentForTool(
    toolId: ToolId,
    options?: Pick<PendingToolOpen, "newWindow">,
  ) {
    setPendingToolOpen({ toolId, newWindow: options?.newWindow })
    setLastMessage("Select an environment before opening a tool")
  }

  function handleOpenTool(
    toolId: ToolId,
    options?: Pick<PendingToolOpen, "newWindow">,
  ) {
    if (!activeEnvironment) {
      requestEnvironmentForTool(toolId, options)
      return
    }

    openTool(toolId, options)
  }

  function selectPromptEnvironment(environmentId: string) {
    const toolOpen = pendingToolOpen

    selectEnvironment(environmentId)
    setPendingToolOpen(undefined)

    if (toolOpen) {
      openTool(toolOpen.toolId, { newWindow: toolOpen.newWindow })
    }
  }

  return (
    <>
      <ChangelogDialog
        appVersion={runningAppVersion}
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
      />
      <AppNotificationCenter
        notification={lastNotification}
        onDismiss={dismissNotification}
      />

      <Dialog
        open={Boolean(pendingToolOpen)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingToolOpen(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Environment</DialogTitle>
            <DialogDescription>
              Choose an environment before opening{" "}
              {pendingTool?.title ?? "a tool"}.
            </DialogDescription>
          </DialogHeader>
          {sortedEnvironments.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="environment-prompt-select">Environment</Label>
              <Select value="" onValueChange={selectPromptEnvironment}>
                <SelectTrigger
                  id="environment-prompt-select"
                  className="w-full bg-background"
                >
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {sortedEnvironments.map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add an environment before opening tools.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingToolOpen(undefined)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="grid h-screen min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-background text-sm text-foreground">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
          <header className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg shadow-sm ring-1 ring-border/70">
              <img
                src="/opendataverse-icon.png"
                alt=""
                className="size-full"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight">
                  OpenDataverse
                </h1>
                {availableUpdate && (
                  <Button
                    className="h-5 gap-1 rounded-full px-2 text-[11px]"
                    type="button"
                    title={`Install OpenDataverse ${availableUpdate.version}`}
                    onClick={installUpdate}
                    disabled={installingUpdate}
                    size="xs"
                  >
                    {installingUpdate ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    <span>
                      {installingUpdate && updateProgress?.percentage
                        ? `${updateProgress.percentage}%`
                        : "Update"}
                    </span>
                  </Button>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {appNightlyLabel}
              </div>
            </div>
          </header>

          <section className="grid gap-3 border-b border-sidebar-border p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Environment
              </Label>
              <div className="flex items-center gap-1">
                <ManageEnvironmentsDialog />
                <EnvironmentFormDialog
                  mode="add"
                  trigger={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Add environment"
                    >
                      <Plus />
                    </Button>
                  }
                />
              </div>
            </div>
            <Select
              value={config.currentEnvironmentId ?? ""}
              onValueChange={selectEnvironment}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                {sortedEnvironments.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeEnvironment && (
              <div className="min-w-0 rounded-md border border-sidebar-border bg-background p-2.5 text-xs">
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {activeEnvironment.url}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="h-4 gap-1 px-1.5 text-[11px] capitalize"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        activeEnvironment.authState === "connected" &&
                          "bg-emerald-500",
                        activeEnvironment.authState === "connecting" &&
                          "bg-amber-500",
                        activeEnvironment.authState === "expired" &&
                          "bg-destructive",
                        activeEnvironment.authState === "error" &&
                          "bg-destructive",
                        activeEnvironment.authState === "disconnected" &&
                          "bg-muted-foreground",
                      )}
                    />
                    {activeEnvironment.authState}
                  </Badge>
                  {activeEnvironmentNeedsReconnect && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        void connectEnvironment(activeEnvironment.id)
                      }
                    >
                      <RefreshCw />
                      Reconnect
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
            <div className="space-y-3">
              {visibleToolGroups.map((group) => {
                const collapsed = collapsedToolGroupIds.has(group.id)
                const groupPanelId = `sidebar-tool-group-${group.id}`

                return (
                  <div key={group.id} className="min-w-0">
                    <button
                      type="button"
                      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                      aria-expanded={!collapsed}
                      aria-controls={groupPanelId}
                      onClick={() => toggleToolGroup(group.id)}
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition-transform",
                          !collapsed && "rotate-90",
                        )}
                      />
                      <span className="truncate">{group.title}</span>
                    </button>

                    {!collapsed && (
                      <div id={groupPanelId} className="mt-1 grid gap-0.5">
                        {group.tools.map((tool) => {
                          const active = activeWindow?.toolId === tool.id

                          return (
                            <ContextMenu key={tool.id}>
                              <ContextMenuTrigger asChild>
                                <button
                                  className={cn(
                                    "group flex w-full min-w-0 items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-all hover:border-border hover:bg-background focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                                    active && "border-border bg-primary/5",
                                    tool.status === "planned" && "opacity-60",
                                  )}
                                  type="button"
                                  onClick={() => handleOpenTool(tool.id)}
                                >
                                  <div
                                    className={cn(
                                      "flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:text-primary",
                                      active &&
                                        "border-primary/20 text-primary",
                                    )}
                                  >
                                    <tool.icon className="size-3.5" />
                                  </div>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium">
                                      {tool.title}
                                    </span>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                      {tool.description}
                                    </span>
                                  </span>
                                  {tool.status === "planned" && (
                                    <Badge
                                      variant="secondary"
                                      className="h-4 shrink-0 px-1.5 text-[10px]"
                                    >
                                      Planned
                                    </Badge>
                                  )}
                                </button>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onSelect={() =>
                                    handleOpenTool(tool.id, {
                                      newWindow: true,
                                    })
                                  }
                                >
                                  <Plus className="size-3.5" />
                                  Open Second Tab
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <footer className="border-t border-sidebar-border p-3">
            <SettingsDialog appVersion={runningAppVersion} />
            {lastMessage && (
              <>
                <Separator className="my-3" />
                <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {lastMessage}
                </p>
              </>
            )}
          </footer>
        </aside>

        <section className="flex min-w-0 min-h-0 flex-col bg-muted/30">
          <div className="flex h-10 items-end overflow-x-auto border-b border-border bg-background px-2">
            {openWindows.map((window) => {
              const tool = getToolDefinition(window.toolId)
              const windowEnvironment = getEnvironmentById(
                config,
                window.environmentId ?? config.currentEnvironmentId,
              )
              const active = window.id === activeWindowId

              return (
                <button
                  key={window.id}
                  className={cn(
                    "group/tab relative flex h-9 max-w-64 items-center gap-2 rounded-t-md border border-b-0 px-3 text-left text-xs transition-all",
                    active
                      ? "z-10 bg-muted text-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  type="button"
                  onClick={() => activateWindow(window.id)}
                >
                  {active && (
                    <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
                  )}
                  <tool.icon className="size-3.5 shrink-0 text-muted-foreground group-hover/tab:text-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {window.title}
                    {windowEnvironment ? ` - ${windowEnvironment.name}` : ""}
                  </span>
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/20 hover:text-foreground"
                    role="button"
                    tabIndex={0}
                    aria-label="Close tab"
                    onClick={(event) => {
                      event.stopPropagation()
                      closeWindow(window.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation()
                        closeWindow(window.id)
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </button>
              )
            })}
          </div>

          <div className="min-h-0 flex-1">
            {loadState === "loading" && (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            )}

            {loadState !== "loading" && activeWindow && (
              <ToolWindowContent window={activeWindow} />
            )}

            {loadState !== "loading" && !activeWindow && (
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-sm text-muted-foreground">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/70">
                  <img
                    src="/opendataverse-icon.png"
                    alt=""
                    className="size-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">No tool open</p>
                  <p className="mt-1 text-xs">
                    Select a tool from the sidebar to start working.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

export default App
