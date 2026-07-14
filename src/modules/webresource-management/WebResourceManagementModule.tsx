import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { dirname, normalize } from "@tauri-apps/api/path"
import { watch, type UnwatchFn, type WatchEvent } from "@tauri-apps/plugin-fs"
import {
  Folder,
  FolderPlus,
  FolderOpen,
  FolderSync,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatErrorMessage } from "@/core/errors"
import {
  chooseLocalFile,
  chooseWebResourceDownloadFile,
  chooseWebResourceDownloadFolder,
  chooseWebResourceImportFiles,
} from "@/core/desktop/file-dialog"
import {
  getBindingsForEnvironment,
  getEnvironmentById,
  type DataverseEnvironment,
  type ToolWindow,
  type WebResource,
  type WebResourceBinding,
  type WebResourceContent,
} from "@/core/dataverse/schemas"
import { isTauriRuntime } from "@/core/desktop/runtime"
import { cn } from "@/lib/utils"
import {
  listSolutions,
  type SolutionManagedFilter,
} from "@/modules/solution-explorer/gateway"
import { useWorkspaceStore } from "@/store/workspace-store"
import { AddFolderDialog } from "./AddFolderDialog"
import { AddWebResourceToSolutionDialog } from "./AddWebResourceToSolutionDialog"
import { ActivityTab } from "./ActivityTab"
import { BindingsTab } from "./BindingsTab"
import {
  DeleteWebResourceDialog,
  type DeleteWebResourceTarget,
} from "./DeleteWebResourceDialog"
import { ImportWebResourcesDialog } from "./ImportWebResourcesDialog"
import { ResourcesTab } from "./ResourcesTab"
import {
  ResourceViewerDialog,
  type ResourceContentSaveAction,
} from "./ResourceViewerDialog"
import { createDownloadJob, type DownloadJob } from "./download-job"
import {
  deleteWebResources,
  downloadWebResources,
  getWebResourceContent,
  listWebResourceActivity,
  listWebResources,
  publishWebResource,
  saveWebResourceContent,
} from "./gateway"
import {
  buildBindingTree,
  buildResourceTree,
  collectBindingFolderIds,
  collectFolderFileResources,
  collectFolderIds,
  collectFolderPaths,
  collectFolderResources,
  flattenBindingTree,
  flattenResourceTree,
  isRootFolder,
  type ResourceTreeFolder,
} from "./tree-model"

type WebResourceManagementModuleProps = {
  window: ToolWindow
}

type WebResourceFolderUpload = {
  targetRoot: string
  sourcePaths: string[]
}

type WebResourceFolderCreate = {
  parentPath: string
}

type WatchedBinding = {
  binding: WebResourceBinding
  directoryPath: string
  localPath: string
}

type AutoPublishTimer = ReturnType<typeof globalThis.setTimeout>

const webResourceImportSolutionFilter: SolutionManagedFilter = "unmanaged"

function statusDotColor(authState: DataverseEnvironment["authState"]) {
  switch (authState) {
    case "connected":
      return "bg-emerald-500"
    case "connecting":
      return "bg-sky-500"
    case "error":
    case "expired":
      return "bg-destructive"
    default:
      return "bg-muted-foreground"
  }
}

function isAccessOnlyEvent(event: WatchEvent) {
  return (
    typeof event.type === "object" &&
    "access" in event.type &&
    !("create" in event.type) &&
    !("modify" in event.type) &&
    !("remove" in event.type)
  )
}

async function normalizeFilePath(path: string) {
  return normalize(path)
}

async function createWatchedBindings(bindings: WebResourceBinding[]) {
  const watchedBindings = await Promise.all(
    bindings.map(async (binding) => {
      const localPath = await normalizeFilePath(binding.localPath)

      return {
        binding,
        directoryPath: await dirname(localPath),
        localPath,
      } satisfies WatchedBinding
    }),
  )
  const bindingsByDirectory = new Map<string, WatchedBinding[]>()

  for (const watchedBinding of watchedBindings) {
    const directoryBindings =
      bindingsByDirectory.get(watchedBinding.directoryPath) ?? []

    directoryBindings.push(watchedBinding)
    bindingsByDirectory.set(watchedBinding.directoryPath, directoryBindings)
  }

  return bindingsByDirectory
}

export function WebResourceManagementModule({
  window,
}: WebResourceManagementModuleProps) {
  const [query, setQuery] = useState("")
  const [includeManaged, setIncludeManaged] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceViewerOpen, setResourceViewerOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [addToSolutionResource, setAddToSolutionResource] = useState<WebResource>()
  const [folderUpload, setFolderUpload] = useState<WebResourceFolderUpload>()
  const [folderCreate, setFolderCreate] = useState<WebResourceFolderCreate>()
  const [savingResourceAction, setSavingResourceAction] =
    useState<ResourceContentSaveAction>()
  const [deleteTarget, setDeleteTarget] = useState<DeleteWebResourceTarget>()
  const [downloadJob, setDownloadJob] = useState<DownloadJob>()
  const [downloadNow, setDownloadNow] = useState(() => Date.now())
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [collapsedBindingFolderIds, setCollapsedBindingFolderIds] = useState<
    Set<string>
  >(() => new Set())
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())
  const config = useWorkspaceStore((state) => state.config)
  const addBinding = useWorkspaceStore((state) => state.addBinding)
  const updateBinding = useWorkspaceStore((state) => state.updateBinding)
  const removeBinding = useWorkspaceStore((state) => state.removeBinding)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const queryClient = useQueryClient()
  const environment =
    getEnvironmentById(config, window.environmentId) ??
    getEnvironmentById(config, config.currentEnvironmentId)
  const downloadRunning = downloadJob?.status === "running"
  const bindings = useMemo(
    () => getBindingsForEnvironment(config, environment?.id),
    [config, environment?.id],
  )
  const autoPublishBindings = useMemo(
    () => bindings.filter((binding) => binding.autoPublish),
    [bindings],
  )
  const bindingTree = useMemo(() => buildBindingTree(bindings), [bindings])
  const bindingFolderIds = useMemo(
    () => collectBindingFolderIds(bindingTree),
    [bindingTree],
  )
  const bindingTreeRows = useMemo(
    () => flattenBindingTree(bindingTree, collapsedBindingFolderIds),
    [bindingTree, collapsedBindingFolderIds],
  )
  const publishingBindingIdsRef = useRef<Set<string>>(new Set())
  const autoPublishTimersRef = useRef<Map<string, AutoPublishTimer>>(new Map())

  const resourceQuery = useQuery({
    queryKey: ["webResources", environment?.id, includeManaged],
    enabled: Boolean(environment),
    queryFn: () => listWebResources(environment as DataverseEnvironment, includeManaged),
  })
  const refetchResources = resourceQuery.refetch
  const activityQuery = useQuery({
    queryKey: ["webResourceActivity", environment?.id],
    enabled: Boolean(environment),
    queryFn: () =>
      listWebResourceActivity(environment as DataverseEnvironment),
  })
  const refetchActivity = activityQuery.refetch
  const unmanagedSolutionsQuery = useQuery({
    queryKey: ["solutions", environment?.id, webResourceImportSolutionFilter],
    enabled: Boolean(environment),
    queryFn: () =>
      listSolutions(
        environment as DataverseEnvironment,
        webResourceImportSolutionFilter,
      ),
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
  const boundResourceIds = useMemo(
    () => new Set(bindings.map((binding) => binding.webResourceId)),
    [bindings],
  )
  const deleteMutation = useMutation({
    mutationFn: (target: DeleteWebResourceTarget) =>
      deleteWebResources(
        environment as DataverseEnvironment,
        target.resources.map((resource) => resource.id),
      ),
    onSuccess: async (result, target) => {
      const deletedResourceIds = new Set(
        target.resources.map((resource) => resource.id),
      )

      for (const binding of bindings) {
        if (deletedResourceIds.has(binding.webResourceId)) {
          removeBinding(binding.id)
        }
      }

      if (selectedResourceId && deletedResourceIds.has(selectedResourceId)) {
        setSelectedResourceId(undefined)
        setResourceViewerOpen(false)
      }

      setLastMessage(result.message)
      setDeleteTarget(undefined)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment?.id],
        }),
      ])
    },
    onError: (error) => {
      setLastMessage(formatErrorMessage(error, "Delete failed"))
    },
  })
  const resourceTree = useMemo(
    () => buildResourceTree(resources, boundResourceIds),
    [boundResourceIds, resources],
  )
  const folderIds = useMemo(() => collectFolderIds(resourceTree), [resourceTree])
  const folderPaths = useMemo(
    () => new Set(collectFolderPaths(resourceTree)),
    [resourceTree],
  )
  const searchActive = query.trim().length > 0
  const resourceTreeRows = useMemo(
    () => flattenResourceTree(resourceTree, expandedFolderIds, searchActive),
    [expandedFolderIds, resourceTree, searchActive],
  )

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)

      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }

      return next
    })
  }

  function toggleBindingFolder(folderId: string) {
    setCollapsedBindingFolderIds((current) => {
      const next = new Set(current)

      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }

      return next
    })
  }

  function showAddFolderDialog(parentPath = "") {
    setFolderCreate({ parentPath })
  }

  function showDeleteFolderDialog(folder: ResourceTreeFolder) {
    const folderResources = collectFolderResources(folder)
    const dedupedResources = Array.from(
      new Map(folderResources.map((resource) => [resource.id, resource])).values(),
    )

    setDeleteTarget({
      kind: isRootFolder(folder) ? "root" : "folder",
      label: isRootFolder(folder) ? `${folder.path}/` : folder.path,
      resources: dedupedResources,
    })
  }

  function showDeleteFileDialog(resource: WebResource) {
    setDeleteTarget({
      kind: "file",
      label: resource.name,
      resources: [resource],
    })
  }

  function confirmDeleteTarget() {
    if (!deleteTarget || deleteMutation.isPending) {
      return
    }

    deleteMutation.mutate(deleteTarget)
  }

  function updateDownloadJob(
    jobId: string,
    updater: (job: DownloadJob) => DownloadJob,
  ) {
    setDownloadJob((current) => {
      if (!current || current.id !== jobId) {
        return current
      }

      return updater(current)
    })
  }

  async function runDownloadJob({
    label,
    targetPath,
    resources: resourcesToDownload,
    preservePaths,
    completeMessage,
  }: {
    label: string
    targetPath: string
    resources: WebResource[]
    preservePaths: boolean
    completeMessage: string
  }) {
    if (!environment) {
      return
    }

    const job = createDownloadJob(label, targetPath, resourcesToDownload)
    setDownloadJob(job)
    setDownloadNow(job.startedAt)

    for (const resource of resourcesToDownload) {
      updateDownloadJob(job.id, (current) => ({
        ...current,
        current: resource.name,
        error: undefined,
        items: current.items.map((item) =>
          item.id === resource.id
            ? { ...item, status: "running", error: undefined }
            : item,
        ),
      }))

      try {
        await downloadWebResources(environment, {
          webResourceIds: [resource.id],
          targetPath,
          preservePaths,
        })
      } catch (error) {
        const message = formatErrorMessage(error, "Download failed")
        const completedAt = Date.now()

        updateDownloadJob(job.id, (current) => ({
          ...current,
          status: "failed",
          completedAt,
          current: undefined,
          error: message,
          items: current.items.map((item) =>
            item.id === resource.id
              ? { ...item, status: "failed", error: message }
              : item.status === "running"
                ? { ...item, status: "pending" }
                : item,
          ),
        }))
        setLastMessage(message)
        return
      }

      updateDownloadJob(job.id, (current) => ({
        ...current,
        completed: Math.min(current.total, current.completed + 1),
        items: current.items.map((item) =>
          item.id === resource.id
            ? { ...item, status: "completed", error: undefined }
            : item,
        ),
      }))
    }

    updateDownloadJob(job.id, (current) => ({
      ...current,
      status: "completed",
      completedAt: Date.now(),
      current: undefined,
      completed: current.total,
    }))
    setLastMessage(completeMessage)
  }

  async function downloadFolder(folder: ResourceTreeFolder) {
    if (!environment) {
      return
    }

    if (downloadRunning) {
      setLastMessage("A download is already running.")
      return
    }

    const resourcesToDownload = collectFolderFileResources(folder)
    if (resourcesToDownload.length === 0) {
      setLastMessage(`No files to download from ${folder.path}.`)
      return
    }

    const targetPath = await chooseWebResourceDownloadFolder()
    if (!targetPath) {
      return
    }

    const label = isRootFolder(folder) ? `${folder.path}/` : folder.path
    const folderKind = isRootFolder(folder) ? "root" : "folder"
    const fileLabel = resourcesToDownload.length === 1 ? "file" : "files"

    await runDownloadJob({
      label: `Download ${folderKind} ${label}`,
      targetPath,
      resources: resourcesToDownload,
      preservePaths: true,
      completeMessage: `Downloaded ${resourcesToDownload.length} ${fileLabel} from ${label}.`,
    })
  }

  async function downloadFile(resource: WebResource) {
    if (!environment) {
      return
    }

    if (downloadRunning) {
      setLastMessage("A download is already running.")
      return
    }

    const targetPath = await chooseWebResourceDownloadFile(resource.name)
    if (!targetPath) {
      return
    }

    await runDownloadJob({
      label: `Download ${resource.name}`,
      targetPath,
      resources: [resource],
      preservePaths: false,
      completeMessage: `Downloaded ${resource.name}.`,
    })
  }

  function handleFolderCreated(folderPath: string) {
    const folderId = `folder:${folderPath}`

    setExpandedFolderIds((current) => {
      const next = new Set(current)
      const parts = folderPath.split("/").filter(Boolean)

      for (let index = 0; index < parts.length; index += 1) {
        next.add(`folder:${parts.slice(0, index + 1).join("/")}`)
      }

      next.add(folderId)
      return next
    })
  }

  const setBindingPublishing = useCallback((
    bindingId: string,
    publishing: boolean,
  ) => {
    setPublishingIds((current) => {
      const next = new Set(current)

      if (publishing) {
        next.add(bindingId)
      } else {
        next.delete(bindingId)
      }

      publishingBindingIdsRef.current = next
      return next
    })
  }, [])

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

  function unbindResource(binding: WebResourceBinding) {
    const pendingTimer = autoPublishTimersRef.current.get(binding.id)

    if (pendingTimer) {
      globalThis.clearTimeout(pendingTimer)
      autoPublishTimersRef.current.delete(binding.id)
    }

    removeBinding(binding.id)
  }

  function openResourceViewer(resource: WebResource) {
    setSelectedResourceId(resource.id)
    setResourceViewerOpen(true)
  }

  async function uploadFilesToFolder(folder: ResourceTreeFolder) {
    const sourcePaths = await chooseWebResourceImportFiles()

    if (sourcePaths.length === 0) {
      return
    }

    setFolderUpload({
      targetRoot: folder.path,
      sourcePaths,
    })
  }

  const publishBinding = useCallback(async (
    binding: WebResourceBinding,
    trigger: "manual" | "auto" = "manual",
  ) => {
    if (!environment) {
      return
    }

    if (publishingBindingIdsRef.current.has(binding.id)) {
      return
    }

    setBindingPublishing(binding.id, true)
    if (trigger === "auto") {
      setLastMessage(`Auto-publishing ${binding.webResourceName}`)
    }

    try {
      const result = await publishWebResource(environment, binding)
      updateBinding(binding.id, {
        lastKnownVersion:
          resources.find((resource) => resource.id === binding.webResourceId)
            ?.version ?? binding.lastKnownVersion,
      })
      setLastMessage(
        trigger === "auto"
          ? `Auto-published ${binding.webResourceName}`
          : result.message,
      )
      await Promise.all([refetchResources(), refetchActivity()])
    } catch (error) {
      setLastMessage(
        `${trigger === "auto" ? "Auto-publish failed: " : ""}${formatErrorMessage(error, "Publish failed")}`,
      )
    } finally {
      setBindingPublishing(binding.id, false)
    }
  }, [
    environment,
    refetchActivity,
    refetchResources,
    resources,
    setBindingPublishing,
    setLastMessage,
    updateBinding,
  ])

  const queueAutoPublish = useCallback((binding: WebResourceBinding) => {
    const existingTimer = autoPublishTimersRef.current.get(binding.id)

    if (existingTimer) {
      globalThis.clearTimeout(existingTimer)
    }

    const timer = globalThis.setTimeout(() => {
      autoPublishTimersRef.current.delete(binding.id)
      void publishBinding(binding, "auto")
    }, 300)

    autoPublishTimersRef.current.set(binding.id, timer)
  }, [publishBinding])

  async function publishAllBindings() {
    for (const binding of bindings) {
      await publishBinding(binding)
    }
  }

  async function saveResourceContent(
    content: WebResourceContent,
    draftContent: string,
    publish: boolean,
  ) {
    if (!environment) {
      return
    }

    setSavingResourceAction(publish ? "publish" : "save")

    try {
      const updatedContent = { ...content, content: draftContent }
      const result = await saveWebResourceContent(
        environment,
        updatedContent,
        publish,
      )

      queryClient.setQueryData(
        ["webResourceContent", environment.id, content.id],
        updatedContent,
      )
      setLastMessage(result.message)
      await Promise.all([refetchResources(), refetchActivity()])
    } catch (error) {
      setLastMessage(formatErrorMessage(error, "Could not save web resource"))
      throw error
    } finally {
      setSavingResourceAction(undefined)
    }
  }

  useEffect(() => {
    const autoPublishTimers = autoPublishTimersRef.current

    return () => {
      for (const timer of autoPublishTimers.values()) {
        globalThis.clearTimeout(timer)
      }
      autoPublishTimers.clear()
    }
  }, [])

  useEffect(() => {
    if (!downloadRunning) {
      return
    }

    const timer = globalThis.setInterval(() => setDownloadNow(Date.now()), 1000)

    return () => globalThis.clearInterval(timer)
  }, [downloadJob?.id, downloadRunning])

  useEffect(() => {
    if (!environment || !isTauriRuntime() || autoPublishBindings.length === 0) {
      return
    }

    let cancelled = false
    let unwatch: UnwatchFn | undefined
    const autoPublishTimers = autoPublishTimersRef.current

    async function startAutoPublishWatcher() {
      const bindingsByDirectory =
        await createWatchedBindings(autoPublishBindings)
      const directoryPaths = [...bindingsByDirectory.keys()]

      if (cancelled || directoryPaths.length === 0) {
        return
      }

      unwatch = await watch(
        directoryPaths,
        (event) => {
          if (cancelled || isAccessOnlyEvent(event)) {
            return
          }

          void (async () => {
            const changedBindings = new Map<string, WebResourceBinding>()

            for (const eventPath of event.paths) {
              const changedPath = await normalizeFilePath(eventPath)
              const changedDirectory = await dirname(changedPath)
              const directoryBindings =
                bindingsByDirectory.get(changedDirectory) ?? []

              for (const watchedBinding of directoryBindings) {
                if (watchedBinding.localPath === changedPath) {
                  changedBindings.set(
                    watchedBinding.binding.id,
                    watchedBinding.binding,
                  )
                }
              }
            }

            for (const binding of changedBindings.values()) {
              queueAutoPublish(binding)
            }
          })().catch((error: unknown) => {
            setLastMessage(
              `Auto-publish watcher failed: ${formatErrorMessage(error, "Unknown watcher error")}`,
            )
          })
        },
        {
          delayMs: 500,
          recursive: false,
        },
      )

      if (cancelled) {
        unwatch()
      }
    }

    void startAutoPublishWatcher().catch((error: unknown) => {
      setLastMessage(
        `Could not start auto-publish watcher: ${formatErrorMessage(error, "Unknown watcher error")}`,
      )
    })

    return () => {
      cancelled = true
      unwatch?.()

      for (const binding of autoPublishBindings) {
        const timer = autoPublishTimers.get(binding.id)

        if (timer) {
          globalThis.clearTimeout(timer)
          autoPublishTimers.delete(binding.id)
        }
      }
    }
  }, [autoPublishBindings, environment, queueAutoPublish, setLastMessage])

  if (!environment) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-4 border-l border-border bg-background p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/60">
          <FolderSync className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-medium">No environment selected</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add or select a Dataverse environment to manage web resources.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <ResourceViewerDialog
        open={resourceViewerOpen}
        onOpenChange={setResourceViewerOpen}
        resource={selectedResource}
        content={resourceContentQuery.data}
        error={resourceContentQuery.error}
        loading={resourceContentQuery.isFetching}
        savingAction={savingResourceAction}
        onSave={saveResourceContent}
      />
      <DeleteWebResourceDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined)
            deleteMutation.reset()
          }
        }}
        target={deleteTarget}
        deleting={deleteMutation.isPending}
        boundResourceIds={boundResourceIds}
        onConfirm={confirmDeleteTarget}
      />
      <ImportWebResourcesDialog
        key={environment.id}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        environment={environment}
        solutions={unmanagedSolutionsQuery.data ?? []}
        solutionsLoading={unmanagedSolutionsQuery.isLoading}
        solutionsError={unmanagedSolutionsQuery.error}
      />
      <AddWebResourceToSolutionDialog
        key={`${environment.id}:${addToSolutionResource?.id ?? "no-resource"}`}
        open={Boolean(addToSolutionResource)}
        onOpenChange={(open) => {
          if (!open) {
            setAddToSolutionResource(undefined)
          }
        }}
        environment={environment}
        resource={addToSolutionResource}
        solutions={unmanagedSolutionsQuery.data ?? []}
        solutionsLoading={unmanagedSolutionsQuery.isLoading}
        solutionsError={unmanagedSolutionsQuery.error}
      />
      <ImportWebResourcesDialog
        key={`${environment.id}:${folderUpload?.targetRoot ?? ""}:${folderUpload?.sourcePaths.join("|") ?? ""}`}
        open={Boolean(folderUpload)}
        onOpenChange={(open) => {
          if (!open) {
            setFolderUpload(undefined)
          }
        }}
        environment={environment}
        solutions={unmanagedSolutionsQuery.data ?? []}
        solutionsLoading={unmanagedSolutionsQuery.isLoading}
        solutionsError={unmanagedSolutionsQuery.error}
        initialSourcePaths={folderUpload?.sourcePaths}
        initialTargetRoot={folderUpload?.targetRoot}
        title="Upload Web Resources To Folder"
        submitLabel="Upload"
      />
      <AddFolderDialog
        key={`${environment.id}:${folderCreate?.parentPath ?? ""}`}
        open={Boolean(folderCreate)}
        onOpenChange={(open) => {
          if (!open) {
            setFolderCreate(undefined)
          }
        }}
        environment={environment}
        solutions={unmanagedSolutionsQuery.data ?? []}
        solutionsLoading={unmanagedSolutionsQuery.isLoading}
        solutionsError={unmanagedSolutionsQuery.error}
        parentPath={folderCreate?.parentPath ?? ""}
        existingFolderPaths={folderPaths}
        onFolderCreated={handleFolderCreated}
      />

      <header className="flex min-h-[3.75rem] items-center justify-between gap-4 border-b border-border bg-background px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-base font-medium">
              Webresource Management
            </h2>
            <Badge variant="outline">{environment.name}</Badge>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  statusDotColor(environment.authState),
                )}
              />
              <span className="text-xs font-medium capitalize text-foreground/80">
                {environment.authState}
              </span>
            </div>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {environment.url}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
            <RefreshCw
              className={cn(
                "size-3.5",
                resourceQuery.isFetching && "animate-spin",
              )}
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="size-3.5" />
            Import
          </Button>
          <Button
            size="sm"
            onClick={() => void publishAllBindings()}
            disabled={bindings.length === 0 || publishingIds.size > 0}
          >
            {publishingIds.size > 0 ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Publish
          </Button>
        </div>
      </header>

      <Tabs defaultValue="resources" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <TabsList>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="bindings">Bindings</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => showAddFolderDialog()}
              >
                <FolderPlus className="size-3.5" />
                Add Root
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExpandedFolderIds(new Set(folderIds))
                  setCollapsedBindingFolderIds(new Set())
                }}
                disabled={folderIds.length === 0 && bindingFolderIds.length === 0}
              >
                <FolderOpen className="size-3.5" />
                Expand
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExpandedFolderIds(new Set())
                  setCollapsedBindingFolderIds(new Set(bindingFolderIds))
                }}
                disabled={folderIds.length === 0 && bindingFolderIds.length === 0}
              >
                <Folder className="size-3.5" />
                Collapse
              </Button>
            </div>
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              Managed
              <Switch
                checked={includeManaged}
                onCheckedChange={setIncludeManaged}
              />
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-64 rounded-md pl-8 text-xs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resources"
              />
            </div>
          </div>
        </div>

        <ResourcesTab
          bindings={bindings}
          downloadJob={downloadJob}
          downloadNow={downloadNow}
          downloadRunning={downloadRunning}
          error={resourceQuery.error}
          expandedFolderIds={expandedFolderIds}
          loading={resourceQuery.isLoading}
          publishingIds={publishingIds}
          query={query}
          resources={resources}
          rows={resourceTreeRows}
          searchActive={searchActive}
          selectedResourceId={selectedResourceId}
          solutionsAvailable={(unmanagedSolutionsQuery.data ?? []).length > 0}
          solutionsLoading={unmanagedSolutionsQuery.isLoading}
          onAddFolder={showAddFolderDialog}
          onAddToSolution={setAddToSolutionResource}
          onBind={(resource) => {
            void bindResource(resource)
          }}
          onDeleteFolder={showDeleteFolderDialog}
          onDeleteResource={showDeleteFileDialog}
          onDismissDownload={() => setDownloadJob(undefined)}
          onDownloadFolder={(folder) => {
            void downloadFolder(folder)
          }}
          onDownloadResource={(resource) => {
            void downloadFile(resource)
          }}
          onOpenResource={openResourceViewer}
          onRefresh={() => {
            void resourceQuery.refetch()
          }}
          onToggleFolder={toggleFolder}
          onUnbind={unbindResource}
          onUploadFiles={(folder) => {
            void uploadFilesToFolder(folder)
          }}
        />

        <BindingsTab
          bindingCount={bindings.length}
          collapsedFolderIds={collapsedBindingFolderIds}
          environmentName={environment.name}
          publishingIds={publishingIds}
          rows={bindingTreeRows}
          onPublish={(binding) => {
            void publishBinding(binding)
          }}
          onToggleAutoPublish={(bindingId, autoPublish) =>
            updateBinding(bindingId, { autoPublish })
          }
          onToggleFolder={toggleBindingFolder}
          onUnbind={unbindResource}
        />

        <ActivityTab
          activities={activityQuery.data ?? []}
          error={activityQuery.isError ? activityQuery.error : undefined}
          fetching={activityQuery.isFetching}
          loading={activityQuery.isLoading}
          onRefresh={() => {
            void refetchActivity()
          }}
        />
      </Tabs>
    </section>
  )
}
