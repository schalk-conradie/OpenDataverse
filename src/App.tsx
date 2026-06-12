import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  DatabaseZap,
  Download,
  Loader2,
  Plus,
  Settings,
  SquareStack,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  checkForAppUpdate,
  installAvailableAppUpdate,
  type AvailableAppUpdate,
  type AppUpdateProgress,
} from "@/core/desktop/updater"
import {
  dataverseUrlPattern,
  getEnvironmentById,
  normalizeEnvironmentUrl,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import { AutopublisherModule } from "@/modules/autopublisher/AutopublisherModule"
import { getToolDefinition, toolRegistry } from "@/modules/tool-registry"
import { useWorkspaceStore } from "@/store/workspace-store"

function EnvironmentDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string>()
  const addEnvironment = useWorkspaceStore((state) => state.addEnvironment)

  function submitEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedUrl = normalizeEnvironmentUrl(url)
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    if (!dataverseUrlPattern.test(normalizedUrl)) {
      setError("Use a URL like https://org.crm.dynamics.com")
      return
    }

    addEnvironment({ name, url: normalizedUrl })
    setName("")
    setUrl("")
    setError(undefined)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Add environment">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submitEnvironment} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add Environment</DialogTitle>
            <DialogDescription className="sr-only">
              Add a Dataverse environment by name and organization URL.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="environment-name">Name</Label>
            <Input
              id="environment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-url">URL</Label>
            <Input
              id="environment-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://org.crm.dynamics.com"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function renderToolWindow(window: ToolWindow) {
  if (window.toolId === "autopublisher") {
    return <AutopublisherModule window={window} />
  }

  const tool = getToolDefinition(window.toolId)

  return (
    <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center">
      <div>
        <tool.icon className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 text-base font-medium">{tool.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Planned</p>
      </div>
    </section>
  )
}

function App() {
  const hydrate = useWorkspaceStore((state) => state.hydrate)
  const config = useWorkspaceStore((state) => state.config)
  const loadState = useWorkspaceStore((state) => state.loadState)
  const openWindows = useWorkspaceStore((state) => state.openWindows)
  const activeWindowId = useWorkspaceStore((state) => state.activeWindowId)
  const lastMessage = useWorkspaceStore((state) => state.lastMessage)
  const selectEnvironment = useWorkspaceStore((state) => state.selectEnvironment)
  const openTool = useWorkspaceStore((state) => state.openTool)
  const closeWindow = useWorkspaceStore((state) => state.closeWindow)
  const activateWindow = useWorkspaceStore((state) => state.activateWindow)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<AppUpdateProgress>()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    let cancelled = false

    async function refreshAvailableUpdate() {
      try {
        const update = await checkForAppUpdate()
        if (cancelled) {
          return
        }

        setAvailableUpdate(update)
      } catch {
        if (!cancelled) {
          setAvailableUpdate(null)
        }
      }
    }

    void refreshAvailableUpdate()
    const interval = window.setInterval(refreshAvailableUpdate, 30 * 60 * 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  async function installUpdate() {
    if (installingUpdate) {
      return
    }

    setInstallingUpdate(true)
    setUpdateProgress(undefined)
    setLastMessage(
      availableUpdate
        ? `Installing OpenDataverse ${availableUpdate.version}`
        : "Checking for updates",
    )

    try {
      const installed = await installAvailableAppUpdate(setUpdateProgress)
      if (!installed) {
        setAvailableUpdate(null)
        setLastMessage("OpenDataverse is up to date")
      }
    } catch (error) {
      setInstallingUpdate(false)
      setLastMessage(
        error instanceof Error ? error.message : "Could not install update",
      )
    }
  }

  const activeEnvironment = getEnvironmentById(
    config,
    config.currentEnvironmentId,
  )
  const activeWindow = useMemo(
    () => openWindows.find((window) => window.id === activeWindowId),
    [activeWindowId, openWindows],
  )

  return (
    <main className="grid h-screen min-h-0 grid-cols-[280px_minmax(0,1fr)] bg-muted/30 text-sm text-foreground">
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-sidebar">
        <header className="flex h-16 items-center gap-3 border-b px-4">
          <div className="flex size-9 items-center justify-center border bg-background">
            <DatabaseZap className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold">
                OpenDataverse
              </h1>
              {availableUpdate && (
                <button
                  className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[11px] font-medium leading-none text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-80"
                  type="button"
                  title={`Install OpenDataverse ${availableUpdate.version}`}
                  onClick={installUpdate}
                  disabled={installingUpdate}
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
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-3 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Environment</Label>
            <EnvironmentDialog />
          </div>
          <Select
            value={config.currentEnvironmentId ?? ""}
            onValueChange={selectEnvironment}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              {config.environments.map((environment) => (
                <SelectItem key={environment.id} value={environment.id}>
                  {environment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeEnvironment && (
            <div className="min-w-0 text-xs text-muted-foreground">
              <div className="truncate">{activeEnvironment.url}</div>
              <div className="mt-2">
                <Badge variant="outline" className="capitalize">
                  {activeEnvironment.authState}
                </Badge>
              </div>
            </div>
          )}
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          <div className="px-2 py-2 text-xs font-medium text-muted-foreground">
            Tools
          </div>
          <div className="grid gap-1">
            {toolRegistry.map((tool) => (
              <button
                key={tool.id}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-background",
                  tool.status === "planned" && "opacity-60",
                )}
                type="button"
                onClick={() => openTool(tool.id)}
              >
                <tool.icon className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {tool.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {tool.description}
                  </span>
                </span>
                {tool.status === "planned" && (
                  <Badge variant="secondary" className="shrink-0">
                    Planned
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </section>

        <footer className="border-t p-3">
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Settings />
            Settings
          </Button>
          {lastMessage && (
            <>
              <Separator className="my-3" />
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {lastMessage}
              </p>
            </>
          )}
        </footer>
      </aside>

      <section className="flex min-w-0 min-h-0 flex-col">
        <div className="flex h-10 items-end overflow-x-auto border-b bg-background px-2">
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
                  "flex h-9 max-w-64 items-center gap-2 border border-b-0 px-3 text-left text-xs",
                  active
                    ? "bg-muted text-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/60",
                )}
                type="button"
                onClick={() => activateWindow(window.id)}
              >
                <tool.icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {window.title}
                  {windowEnvironment ? ` - ${windowEnvironment.name}` : ""}
                </span>
                <span
                  className="flex size-5 shrink-0 items-center justify-center hover:text-foreground"
                  role="button"
                  tabIndex={0}
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

          {loadState !== "loading" && activeWindow && renderToolWindow(activeWindow)}

          {loadState !== "loading" && !activeWindow && (
            <div className="flex h-full items-center justify-center bg-background">
              <Button onClick={() => openTool("autopublisher")}>
                <SquareStack />
                Open Tool
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
