import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  SunMoon,
  Trash2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChangelogContent, ChangelogDialog } from "@/components/changelog"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { appNightlyLabel, appVersion, appWindowTitle } from "@/core/build-info"
import {
  appearanceModes,
  appearanceThemes,
  getAppearanceTheme,
  getAppearanceThemeClassName,
  type AppearanceMode,
  type AppearanceThemeId,
} from "@/core/appearance/themes"
import {
  getChangelogBuildId,
  markChangelogBuildSeen,
  shouldShowChangelogForBuild,
} from "@/core/changelog"
import { getRunningAppVersion } from "@/core/desktop/app-version"
import {
  checkForAppUpdate,
  installLatestAppUpdate,
  type AvailableAppUpdate,
  type AppUpdateProgress,
} from "@/core/desktop/updater"
import {
  dataverseUrlPattern,
  getEnvironmentById,
  normalizeEnvironmentUrl,
  type DataverseEnvironment,
  type ToolId,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import { getToolDefinition, toolRegistry } from "@/modules/tool-registry"
import {
  useWorkspaceStore,
  type AppNotification,
} from "@/store/workspace-store"

const AiChatModule = lazy(() =>
  import("@/modules/ai-chat/AiChatModule").then((module) => ({
    default: module.AiChatModule,
  })),
)
const FetchXmlBuilderModule = lazy(() =>
  import("@/modules/fetchxml-builder/FetchXmlBuilderModule").then((module) => ({
    default: module.FetchXmlBuilderModule,
  })),
)
const FormLogicCopilotModule = lazy(() =>
  import("@/modules/form-logic-copilot/FormLogicCopilotModule").then(
    (module) => ({
      default: module.FormLogicCopilotModule,
    }),
  ),
)
const PluginRegistrationModule = lazy(() =>
  import("@/modules/plugin-registration/PluginRegistrationModule").then(
    (module) => ({
      default: module.PluginRegistrationModule,
    }),
  ),
)
const SolutionExplorerModule = lazy(() =>
  import("@/modules/solution-explorer/SolutionExplorerModule").then(
    (module) => ({
      default: module.SolutionExplorerModule,
    }),
  ),
)
const WebResourceManagementModule = lazy(() =>
  import("@/modules/webresource-management/WebResourceManagementModule").then(
    (module) => ({
      default: module.WebResourceManagementModule,
    }),
  ),
)

const appearanceModeLabels: Record<AppearanceMode, string> = {
  light: "Light",
  dark: "Dark",
}

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

type EnvironmentFormDialogProps = {
  mode: "add" | "edit"
  environment?: DataverseEnvironment
  trigger: ReactNode
}

function validateEnvironmentForm(
  environments: DataverseEnvironment[],
  name: string,
  normalizedUrl: string,
  currentEnvironmentId?: string,
) {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return "Name is required"
  }

  if (!dataverseUrlPattern.test(normalizedUrl)) {
    return "Use a URL like https://org.crm.dynamics.com"
  }

  const duplicateName = environments.some(
    (environment) =>
      environment.id !== currentEnvironmentId &&
      environment.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  )

  if (duplicateName) {
    return "Environment name already exists"
  }

  const duplicateUrl = environments.some(
    (environment) =>
      environment.id !== currentEnvironmentId &&
      normalizeEnvironmentUrl(environment.url).toLowerCase() ===
        normalizedUrl.toLowerCase(),
  )

  if (duplicateUrl) {
    return "Environment URL already exists"
  }

  return undefined
}

function EnvironmentFormDialog({
  mode,
  environment,
  trigger,
}: EnvironmentFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const config = useWorkspaceStore((state) => state.config)
  const addEnvironment = useWorkspaceStore((state) => state.addEnvironment)
  const updateEnvironment = useWorkspaceStore(
    (state) => state.updateEnvironment,
  )

  function resetForm() {
    setName(environment?.name ?? "")
    setUrl(environment?.url ?? "")
    setError(undefined)
    setSubmitting(false)
  }

  async function submitEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedUrl = normalizeEnvironmentUrl(url)
    const validationError = validateEnvironmentForm(
      config.environments,
      name,
      normalizedUrl,
      environment?.id,
    )
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)

    if (mode === "edit" && environment) {
      const updated = await updateEnvironment(environment.id, {
        name,
        url: normalizedUrl,
      })

      if (!updated) {
        setSubmitting(false)
        setError("Could not update environment")
        return
      }
    } else {
      addEnvironment({ name, url: normalizedUrl })
    }

    setName("")
    setUrl("")
    setError(undefined)
    setSubmitting(false)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          resetForm()
        }
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submitEnvironment} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit Environment" : "Add Environment"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {mode === "edit"
                ? "Edit a saved Dataverse environment."
                : "Add a Dataverse environment by name and organization URL."}
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
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "edit" ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageEnvironmentsDialog() {
  const config = useWorkspaceStore((state) => state.config)
  const connectEnvironment = useWorkspaceStore(
    (state) => state.connectEnvironment,
  )
  const deleteEnvironment = useWorkspaceStore(
    (state) => state.deleteEnvironment,
  )
  const [deleteTarget, setDeleteTarget] = useState<DataverseEnvironment>()
  const [reconnectingId, setReconnectingId] = useState<string>()
  const [deleting, setDeleting] = useState(false)

  async function reconnect(environmentId: string) {
    setReconnectingId(environmentId)
    try {
      await connectEnvironment(environmentId)
    } finally {
      setReconnectingId(undefined)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)
    const deleted = await deleteEnvironment(deleteTarget.id)
    setDeleting(false)

    if (deleted) {
      setDeleteTarget(undefined)
    }
  }

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <SlidersHorizontal />
            Manage
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Environments</DialogTitle>
            <DialogDescription>
              Edit, reconnect, or delete saved Dataverse environments.
            </DialogDescription>
          </DialogHeader>

          {config.environments.length === 0 ? (
            <div className="border bg-background p-6 text-center text-xs text-muted-foreground">
              No environments saved.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.environments.map((environment) => {
                  const reconnecting =
                    reconnectingId === environment.id ||
                    environment.authState === "connecting"

                  return (
                    <TableRow key={environment.id}>
                      <TableCell className="font-medium">
                        {environment.name}
                      </TableCell>
                      <TableCell className="max-w-72 truncate font-mono text-[11px] text-muted-foreground">
                        {environment.url}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {environment.authState}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <EnvironmentFormDialog
                            mode="edit"
                            environment={environment}
                            trigger={
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                title={`Edit ${environment.name}`}
                              >
                                <Pencil />
                                <span className="sr-only">Edit</span>
                              </Button>
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            title={`Reconnect ${environment.name}`}
                            disabled={reconnecting}
                            onClick={() => void reconnect(environment.id)}
                          >
                            {reconnecting ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                            <span className="sr-only">Reconnect</span>
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-xs"
                            title={`Delete ${environment.name}`}
                            disabled={reconnecting}
                            onClick={() => setDeleteTarget(environment)}
                          >
                            <Trash2 />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(undefined)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.name} from local OpenDataverse state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SettingsDialog({ appVersion }: { appVersion: string }) {
  const appearanceThemeId = useWorkspaceStore(
    (state) => state.userSettings.appearance.theme,
  )
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )
  const experimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.userSettings.dangerZone.experimentalAiAgentEnabled,
  )
  const setAppearanceTheme = useWorkspaceStore(
    (state) => state.setAppearanceTheme,
  )
  const setAppearanceMode = useWorkspaceStore(
    (state) => state.setAppearanceMode,
  )
  const setExperimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.setExperimentalAiAgentEnabled,
  )
  const selectedTheme = getAppearanceTheme(appearanceThemeId)

  function changeTheme(value: string) {
    setAppearanceTheme(value as AppearanceThemeId)
  }

  function changeMode(value: string) {
    setAppearanceMode(value as AppearanceMode)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" size="sm">
          <Settings />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="grid h-[min(680px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Configure OpenDataverse settings.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="appearance" className="min-h-0">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="appearance" className="flex-none px-2">
              Appearance
            </TabsTrigger>
            <TabsTrigger value="danger-zone" className="flex-none px-2">
              Danger Zone
            </TabsTrigger>
            <TabsTrigger value="changelog" className="flex-none px-2">
              Changelog
            </TabsTrigger>
          </TabsList>
          <TabsContent value="appearance" className="min-h-0 pt-3">
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex min-h-8 items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Palette className="size-4 shrink-0 text-muted-foreground" />
                    <Label
                      htmlFor="settings-appearance-theme"
                      className="text-sm font-medium"
                    >
                      Theme
                    </Label>
                  </div>
                  <Select
                    value={appearanceThemeId}
                    onValueChange={changeTheme}
                  >
                    <SelectTrigger
                      id="settings-appearance-theme"
                      className="w-44"
                    >
                      <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {appearanceThemes.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-1.5 pl-6" aria-hidden="true">
                  {selectedTheme.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="size-4 rounded-sm border border-border"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-background p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <SunMoon className="size-4 shrink-0 text-muted-foreground" />
                  <Label
                    htmlFor="settings-appearance-mode"
                    className="text-sm font-medium"
                  >
                    Mode
                  </Label>
                </div>
                <Select value={appearanceMode} onValueChange={changeMode}>
                  <SelectTrigger
                    id="settings-appearance-mode"
                    className="w-32"
                  >
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {appearanceModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {appearanceModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="danger-zone" className="min-h-0 pt-3">
            <div className="flex min-h-20 items-start justify-between gap-4 border border-destructive/40 bg-destructive/10 px-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <Label
                    htmlFor="settings-experimental-ai-agent"
                    className="text-sm font-medium"
                  >
                    AI Agent (Experimental)
                  </Label>
                  <p className="mt-1 text-xs leading-5 text-destructive">
                    Unsafe module. It can make Dataverse changes, and serious
                    harm could come to an environment.
                  </p>
                </div>
              </div>
              <Switch
                id="settings-experimental-ai-agent"
                checked={experimentalAiAgentEnabled}
                onCheckedChange={setExperimentalAiAgentEnabled}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="changelog"
            className="min-h-0 overflow-hidden pt-3"
          >
            <ChangelogContent appVersion={appVersion} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function ToolWindowLoading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Loading
    </div>
  )
}

function renderToolWindowContent(window: ToolWindow) {
  if (window.toolId === "autopublisher") {
    return <WebResourceManagementModule window={window} />
  }

  if (window.toolId === "ai-chat") {
    return <AiChatModule window={window} />
  }

  if (window.toolId === "ai-agent-experimental") {
    return <AiChatModule window={window} mode="experimental-agent" />
  }

  if (window.toolId === "fetchxml-builder") {
    return <FetchXmlBuilderModule window={window} />
  }

  if (window.toolId === "form-logic-copilot") {
    return <FormLogicCopilotModule window={window} />
  }

  if (window.toolId === "plugin-registration") {
    return <PluginRegistrationModule window={window} />
  }

  if (window.toolId === "solution-explorer") {
    return <SolutionExplorerModule window={window} />
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

function renderToolWindow(window: ToolWindow) {
  return (
    <Suspense fallback={<ToolWindowLoading />}>
      {renderToolWindowContent(window)}
    </Suspense>
  )
}

type PendingToolOpen = {
  toolId: ToolId
  newWindow?: boolean
}

function AppNotificationCenter({
  notification,
  onDismiss,
}: {
  notification?: AppNotification
  onDismiss: (notificationId?: string) => void
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [clickedNotificationId, setClickedNotificationId] = useState<string>()

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

  function keepNotificationOpen() {
    setClickedNotificationId(notification?.id)
  }

  const isError = notification.severity === "error"
  const Icon = isError
    ? AlertTriangle
    : notification.severity === "success"
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
            {notification.message}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  )
}

function App() {
  const hydrate = useWorkspaceStore((state) => state.hydrate)
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
  const heartbeatEnvironment = useWorkspaceStore(
    (state) => state.heartbeatEnvironment,
  )
  const openTool = useWorkspaceStore((state) => state.openTool)
  const closeWindow = useWorkspaceStore((state) => state.closeWindow)
  const activateWindow = useWorkspaceStore((state) => state.activateWindow)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const dismissNotification = useWorkspaceStore(
    (state) => state.dismissNotification,
  )
  const appearanceThemeId = useWorkspaceStore(
    (state) => state.userSettings.appearance.theme,
  )
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )
  const experimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.userSettings.dangerZone.experimentalAiAgentEnabled,
  )
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null)
  const [runningAppVersion, setRunningAppVersion] = useState(appVersion)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<AppUpdateProgress>()
  const [pendingToolOpen, setPendingToolOpen] = useState<PendingToolOpen>()
  const [collapsedToolGroupIds, setCollapsedToolGroupIds] = useState(
    () => new Set<string>(),
  )

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const root = document.documentElement
    const themeClassNames = appearanceThemes.map((theme) =>
      getAppearanceThemeClassName(theme.id),
    )

    root.classList.remove(...themeClassNames)
    root.classList.add(getAppearanceThemeClassName(appearanceThemeId))
    root.classList.toggle("dark", appearanceMode === "dark")
    root.dataset.appearanceTheme = appearanceThemeId
    root.dataset.appearanceMode = appearanceMode
  }, [appearanceMode, appearanceThemeId])

  useEffect(() => {
    let cancelled = false

    async function syncChangelogState() {
      const version = await getRunningAppVersion()
      if (cancelled) {
        return
      }

      setRunningAppVersion(version)

      const buildId = getChangelogBuildId(version)
      if (shouldShowChangelogForBuild(buildId)) {
        markChangelogBuildSeen(buildId)
        setChangelogOpen(true)
      }
    }

    void syncChangelogState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const environmentId = config.currentEnvironmentId
    if (loadState !== "ready" || !environmentId) {
      return
    }

    const interval = window.setInterval(() => {
      void heartbeatEnvironment(environmentId)
    }, 10 * 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [config.currentEnvironmentId, heartbeatEnvironment, loadState])

  useEffect(() => {
    document.title = appWindowTitle

    if (!("__TAURI_INTERNALS__" in window)) {
      return
    }

    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setTitle(appWindowTitle),
      )
      .catch(() => undefined)
  }, [])

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
    setLastMessage("Checking for the latest OpenDataverse update")

    try {
      const installed = await installLatestAppUpdate(
        setUpdateProgress,
        (update) => {
          setAvailableUpdate(update)
          setLastMessage(`Installing OpenDataverse ${update.version}`)
        },
      )
      if (!installed) {
        setAvailableUpdate(null)
        setLastMessage("OpenDataverse is up to date")
      }
    } catch (error) {
      setInstallingUpdate(false)
      showError("Update failed", error, "Could not install update")
    }
  }

  const activeEnvironment = getEnvironmentById(
    config,
    config.currentEnvironmentId,
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
          {config.environments.length > 0 ? (
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
                  {config.environments.map((environment) => (
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
                {config.environments.map((environment) => (
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

            {loadState !== "loading" &&
              activeWindow &&
              renderToolWindow(activeWindow)}

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
