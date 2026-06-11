import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { openUrl } from "@tauri-apps/plugin-opener"
import Editor from "@monaco-editor/react"
import {
  Code2,
  Copy,
  FileSymlink,
  FolderSync,
  Loader2,
  Play,
  RefreshCw,
  Search,
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  completeBrowserAuth,
  getWebResourceContent,
  listWebResources,
  startBrowserAuth,
  publishWebResource,
} from "@/core/desktop/bridge"
import { chooseLocalFile } from "@/core/desktop/file-dialog"
import {
  getBindingsForEnvironment,
  getEnvironmentById,
  type BrowserAuthStart,
  type DataverseEnvironment,
  type ToolWindow,
  type WebResource,
  type WebResourceBinding,
  type WebResourceContent,
} from "@/core/dataverse/schemas"
import { isTauriRuntime } from "@/core/desktop/bridge"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"
import { publisherEvents } from "./activity-events"

type AutopublisherModuleProps = {
  window: ToolWindow
}

type AuthDialogState = {
  open: boolean
  browserAuth?: BrowserAuthStart
  error?: string
  waiting: boolean
}

type ResourceViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource?: WebResource
  content?: WebResourceContent
  error: unknown
  loading: boolean
}

function typeBadge(resource: WebResource) {
  const labels: Record<WebResource["type"], string> = {
    html: "HTML",
    css: "CSS",
    js: "JS",
    xml: "XML",
    image: "IMG",
    resx: "RESX",
  }

  return labels[resource.type]
}

function AuthDialog({
  authDialog,
  onOpenChange,
}: {
  authDialog: AuthDialogState
  onOpenChange: (open: boolean) => void
}) {
  async function copyRedirectUri() {
    if (!authDialog.browserAuth) {
      return
    }

    await navigator.clipboard.writeText(authDialog.browserAuth.redirectUri)
  }

  return (
    <Dialog open={authDialog.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect To Dataverse</DialogTitle>
          <DialogDescription>
            Finish Microsoft sign-in in your browser. OpenDataverse is waiting
            on the local redirect URL.
          </DialogDescription>
        </DialogHeader>

        {authDialog.browserAuth ? (
          <div className="grid gap-4">
            <div className="border bg-muted p-3">
              <div className="text-xs text-muted-foreground">Redirect URL</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm tracking-normal">
                  {authDialog.browserAuth.redirectUri}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyRedirectUri()}
                >
                  <Copy />
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              A browser window should open automatically. After sign-in, the
              redirect page can be closed.
            </p>
            <Button
              variant="outline"
              onClick={() => void openUrl(authDialog.browserAuth!.authUrl)}
              disabled={!isTauriRuntime()}
            >
              Open Sign-In
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing sign-in
          </div>
        )}

        {authDialog.error && (
          <p className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {authDialog.error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled>
            {authDialog.waiting && <Loader2 className="animate-spin" />}
            {authDialog.waiting ? "Waiting For Sign-In" : "Sign-In Stopped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResourceViewerDialog({
  open,
  onOpenChange,
  resource,
  content,
  error,
  loading,
}: ResourceViewerDialogProps) {
  async function copyContent() {
    if (!content?.content) {
      return
    }

    await navigator.clipboard.writeText(content.content)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(900px,calc(100vh-3rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] 2xl:w-[1480px] 2xl:max-w-[1480px]">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="truncate font-mono text-sm">
                {resource?.name ?? "Web Resource"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Web resource source viewer.
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {resource && (
                  <Badge variant="secondary">{typeBadge(resource)}</Badge>
                )}
                {resource?.isManaged && (
                  <Badge variant="outline">Managed</Badge>
                )}
                {content?.language && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {content.language}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {loading && (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyContent()}
                disabled={!content?.content}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {Boolean(error) && (
            <div className="m-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error instanceof Error ? error.message : String(error)}
            </div>
          )}

          {!error && loading && !content && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading content
            </div>
          )}

          {!error && (!loading || content) && (
            <Editor
              height="100%"
              language={content?.language ?? "plaintext"}
              value={content?.content ?? ""}
              loading={
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading content
                </div>
              }
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 13,
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                renderLineHighlight: "line",
              }}
              theme="vs"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AutopublisherModule({ window }: AutopublisherModuleProps) {
  const [query, setQuery] = useState("")
  const [includeManaged, setIncludeManaged] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceViewerOpen, setResourceViewerOpen] = useState(false)
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())
  const [authDialog, setAuthDialog] = useState<AuthDialogState>({
    open: false,
    waiting: false,
  })
  const config = useWorkspaceStore((state) => state.config)
  const addBinding = useWorkspaceStore((state) => state.addBinding)
  const updateBinding = useWorkspaceStore((state) => state.updateBinding)
  const checkConnection = useWorkspaceStore((state) => state.connectEnvironment)
  const setEnvironmentAuthState = useWorkspaceStore(
    (state) => state.setEnvironmentAuthState,
  )
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const environment =
    getEnvironmentById(config, window.environmentId) ??
    getEnvironmentById(config, config.currentEnvironmentId)
  const bindings = getBindingsForEnvironment(config, environment?.id)

  const resourceQuery = useQuery({
    queryKey: ["webResources", environment?.id, includeManaged],
    enabled: Boolean(environment),
    queryFn: () => listWebResources(environment as DataverseEnvironment, includeManaged),
  })

  const selectedResource = useMemo(
    () =>
      (resourceQuery.data ?? []).find(
        (resource) => resource.id === selectedResourceId,
      ),
    [resourceQuery.data, selectedResourceId],
  )

  const resourceContentQuery = useQuery({
    queryKey: ["webResourceContent", environment?.id, selectedResourceId],
    enabled: Boolean(environment && selectedResourceId && resourceViewerOpen),
    queryFn: () =>
      getWebResourceContent(
        environment as DataverseEnvironment,
        selectedResourceId as string,
      ),
  })

  const resources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return (resourceQuery.data ?? []).filter((resource) => {
      if (!normalizedQuery) {
        return true
      }

      return resource.name.toLowerCase().includes(normalizedQuery)
    })
  }, [query, resourceQuery.data])

  async function startAuthFlow(environment: DataverseEnvironment) {
    setAuthDialog({ open: true, waiting: true })
    setEnvironmentAuthState(environment.id, "connecting", "Starting sign-in")

    try {
      const browserAuth = await startBrowserAuth(environment)
      setAuthDialog({ open: true, waiting: true, browserAuth })

      if (isTauriRuntime()) {
        await openUrl(browserAuth.authUrl)
      }

      const session = await completeBrowserAuth(
        environment,
        browserAuth.sessionId,
      )
      setEnvironmentAuthState(environment.id, "connected", session.message)
      setAuthDialog({ open: false, waiting: false })
      await resourceQuery.refetch()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Sign-in failed")
      setEnvironmentAuthState(environment.id, "error", message)
      setAuthDialog((current) => ({
        ...current,
        open: true,
        waiting: false,
        error: message,
      }))
    }
  }

  async function bindResource(resource: WebResource) {
    if (!environment) {
      return
    }

    const localPath = await chooseLocalFile()
    if (!localPath) {
      return
    }

    addBinding({
      environmentId: environment.id,
      localPath,
      webResourceName: resource.name,
      webResourceId: resource.id,
      lastKnownVersion: resource.version,
      autoPublish: true,
    })
  }

  function openResourceViewer(resource: WebResource) {
    setSelectedResourceId(resource.id)
    setResourceViewerOpen(true)
  }

  async function publishBinding(binding: WebResourceBinding) {
    if (!environment) {
      return
    }

    setPublishingIds((current) => new Set(current).add(binding.id))
    try {
      const result = await publishWebResource(environment, binding)
      updateBinding(binding.id, {
        lastKnownVersion:
          resources.find((resource) => resource.id === binding.webResourceId)
            ?.version ?? binding.lastKnownVersion,
      })
      setLastMessage(result.message)
      await resourceQuery.refetch()
    } catch (error) {
      setLastMessage(
        error instanceof Error
          ? error.message
          : String(error ?? "Publish failed"),
      )
    } finally {
      setPublishingIds((current) => {
        const next = new Set(current)
        next.delete(binding.id)
        return next
      })
    }
  }

  async function publishAllBindings() {
    for (const binding of bindings) {
      await publishBinding(binding)
    }
  }

  if (!environment) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-3 border-l bg-background p-8 text-center">
        <div className="flex size-12 items-center justify-center border bg-muted">
          <FolderSync className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-medium">No Environment</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add or select a Dataverse environment to open this tool window.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l bg-background">
      <AuthDialog
        authDialog={authDialog}
        onOpenChange={(open) =>
          setAuthDialog((current) => ({ ...current, open }))
        }
      />
      <ResourceViewerDialog
        open={resourceViewerOpen}
        onOpenChange={setResourceViewerOpen}
        resource={selectedResource}
        content={resourceContentQuery.data}
        error={resourceContentQuery.error}
        loading={resourceContentQuery.isFetching}
      />

      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium">Autopublisher</h2>
            <Badge variant="outline">{environment.name}</Badge>
            <Badge
              className={cn(
                "capitalize",
                environment.authState === "connected" &&
                  "border-emerald-300 bg-emerald-50 text-emerald-700",
                environment.authState === "connecting" &&
                  "border-sky-300 bg-sky-50 text-sky-700",
                environment.authState === "error" &&
                  "border-red-300 bg-red-50 text-red-700",
              )}
              variant="outline"
            >
              {environment.authState}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {environment.url}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void startAuthFlow(environment)}
            disabled={authDialog.waiting}
          >
            {authDialog.waiting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            Connect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void checkConnection(environment.id)}
          >
            Check
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh"
            onClick={() => {
              void resourceQuery.refetch()
              if (resourceViewerOpen && selectedResourceId) {
                void resourceContentQuery.refetch()
              }
            }}
            disabled={resourceQuery.isFetching}
          >
            <RefreshCw className={cn(resourceQuery.isFetching && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={() => void publishAllBindings()}
            disabled={bindings.length === 0 || publishingIds.size > 0}
          >
            {publishingIds.size > 0 ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            Publish
          </Button>
        </div>
      </header>

      <Tabs defaultValue="resources" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="bindings">Bindings</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              Managed
              <Switch
                checked={includeManaged}
                onCheckedChange={setIncludeManaged}
              />
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-64 pl-7"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resources"
              />
            </div>
          </div>
        </div>

        <TabsContent value="resources" className="min-h-0 flex-1 overflow-hidden p-0">
          {resourceQuery.error && (
            <div className="border-b border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {resourceQuery.error instanceof Error
                ? resourceQuery.error.message
                : String(resourceQuery.error)}
            </div>
          )}

          <div className="h-full min-h-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48%]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourceQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading web resources
                      </span>
                    </TableCell>
                  </TableRow>
                )}

                {!resourceQuery.isLoading &&
                  resources.map((resource) => {
                    const binding = bindings.find(
                      (item) => item.webResourceId === resource.id,
                    )
                    const selected = selectedResourceId === resource.id

                    return (
                      <TableRow
                        key={resource.id}
                        className={cn(
                          "cursor-pointer",
                          selected && "bg-muted/80 hover:bg-muted",
                        )}
                        onClick={() => openResourceViewer(resource)}
                      >
                        <TableCell className="max-w-96 truncate font-mono text-xs">
                          {resource.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {typeBadge(resource)}
                          </Badge>
                        </TableCell>
                        <TableCell>{resource.version || "-"}</TableCell>
                        <TableCell>
                          {binding ? (
                            <Badge
                              className="border-emerald-300 bg-emerald-50 text-emerald-700"
                              variant="outline"
                            >
                              Bound
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              Unbound
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`View ${resource.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                openResourceViewer(resource)
                              }}
                            >
                              <Code2 />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                void bindResource(resource)
                              }}
                            >
                              <FileSymlink />
                              Bind
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}

                {!resourceQuery.isLoading && resources.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-28 text-center text-muted-foreground"
                    >
                      No web resources loaded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bindings" className="min-h-0 flex-1 overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local File</TableHead>
                <TableHead>Web Resource</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((binding) => (
                <TableRow key={binding.id}>
                  <TableCell className="max-w-72 truncate font-mono text-xs">
                    {binding.localPath}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {binding.webResourceName}
                  </TableCell>
                  <TableCell>{binding.lastKnownVersion || "-"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={binding.autoPublish}
                      onCheckedChange={(autoPublish) =>
                        updateBinding(binding.id, { autoPublish })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void publishBinding(binding)}
                      disabled={publishingIds.has(binding.id)}
                    >
                      {publishingIds.has(binding.id) ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Play />
                      )}
                      Publish
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {bindings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    No bindings for {environment.name}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-auto p-4">
          <div className="max-w-3xl border">
            {publisherEvents.map((event, index) => (
              <div key={event.id}>
                <div className="grid grid-cols-[72px_1fr] gap-4 p-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {event.time}
                  </span>
                  <div>
                    <div className="font-medium">{event.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.detail}
                    </div>
                  </div>
                </div>
                {index < publisherEvents.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
