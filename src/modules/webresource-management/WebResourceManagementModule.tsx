import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { dirname, normalize } from "@tauri-apps/api/path"
import { watch, type UnwatchFn, type WatchEvent } from "@tauri-apps/plugin-fs"
import Editor from "@monaco-editor/react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileSymlink,
  Folder,
  FolderPlus,
  FolderOpen,
  FolderSync,
  History,
  ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  createWebResourceInSolution,
  deleteWebResources,
  downloadWebResources,
  getWebResourceContent,
  importWebResourcesInSolution,
  listWebResourceActivity,
  listWebResources,
  listSolutions,
  publishWebResource,
  saveWebResourceContent,
  type SolutionManagedFilter,
} from "@/core/desktop/bridge"
import {
  chooseLocalFile,
  chooseWebResourceDownloadFile,
  chooseWebResourceDownloadFolder,
  chooseWebResourceImportFiles,
  chooseWebResourceImportFolder,
} from "@/core/desktop/file-dialog"
import {
  getBindingsForEnvironment,
  getEnvironmentById,
  type DataverseEnvironment,
  type SolutionSummary,
  type ToolWindow,
  type WebResource,
  type WebResourceActivity,
  type WebResourceBinding,
  type WebResourceContent,
} from "@/core/dataverse/schemas"
import { isTauriRuntime } from "@/core/desktop/bridge"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"
import {
  configureWebResourceIntellisense,
  editorLanguageForWebResource,
  editorPathForWebResource,
} from "./intellisense"

type WebResourceManagementModuleProps = {
  window: ToolWindow
}

type ResourceContentSaveAction = "save" | "publish"

type ResourceDraftState = {
  resourceId: string
  content: string
}

type ResourceActionError = {
  resourceId: string
  message: string
}

type ImportWebResourcesForm = {
  sourcePaths: string[]
  solutionUniqueName: string
  targetRoot: string
  description: string
}

type WebResourceFolderUpload = {
  targetRoot: string
  sourcePaths: string[]
}

type WebResourceFolderCreate = {
  parentPath: string
}

type ResourceViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource?: WebResource
  content?: WebResourceContent
  error: unknown
  loading: boolean
  savingAction?: ResourceContentSaveAction
  onSave: (
    content: WebResourceContent,
    draftContent: string,
    publish: boolean,
  ) => Promise<void>
}

type ResourceTreeFolder = {
  type: "folder"
  id: string
  name: string
  path: string
  children: ResourceTreeNode[]
  resourceCount: number
  boundCount: number
  markerResource?: WebResource
}

type ResourceTreeFile = {
  type: "file"
  id: string
  name: string
  resource: WebResource
}

type ResourceTreeNode = ResourceTreeFolder | ResourceTreeFile

type ResourceTreeRow =
  | {
      type: "folder"
      folder: ResourceTreeFolder
      depth: number
    }
  | {
      type: "file"
      file: ResourceTreeFile
      depth: number
    }

type WatchedBinding = {
  binding: WebResourceBinding
  directoryPath: string
  localPath: string
}

type AutoPublishTimer = ReturnType<typeof globalThis.setTimeout>

type DeleteWebResourceTarget = {
  kind: "root" | "folder" | "file"
  label: string
  resources: WebResource[]
}

type DownloadJobStatus = "running" | "completed" | "failed"

type DownloadJobItemStatus = "pending" | "running" | "completed" | "failed"

type DownloadJobItem = {
  id: string
  name: string
  status: DownloadJobItemStatus
  error?: string
}

type DownloadJob = {
  id: string
  label: string
  targetPath: string
  total: number
  completed: number
  status: DownloadJobStatus
  items: DownloadJobItem[]
  startedAt: number
  completedAt?: number
  current?: string
  error?: string
}

const webResourceImportSolutionFilter: SolutionManagedFilter = "unmanaged"
const folderMarkerFileName = ".folder.xml"
const folderMarkerContent =
  "<!-- OpenDataverse folder marker. Add web resources to this path. -->"

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

function formatActivityTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function activityKindPill(activity: WebResourceActivity) {
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

function resourceIcon(resource: WebResource) {
  if (resource.type === "image") {
    return ImageIcon
  }

  return FileCode2
}

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

function splitResourceName(name: string) {
  const parts = name.split("/").filter(Boolean)

  return parts.length > 0 ? parts : [name]
}

function normalizeWebResourcePath(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
}

function isFolderMarkerResourceName(name: string) {
  return normalizeWebResourcePath(name).endsWith(`/${folderMarkerFileName}`)
}

function isRootFolder(folder: ResourceTreeFolder) {
  return !folder.path.includes("/")
}

function validateFolderName(value: string) {
  const folderName = value.trim()

  if (!folderName) {
    return "Folder name is required."
  }

  if (folderName.includes("/") || folderName.includes("\\")) {
    return "Folder name cannot contain slashes."
  }

  if (
    /\s/.test(folderName) ||
    Array.from(folderName).some((char) => {
      const codePoint = char.codePointAt(0) ?? 0

      return codePoint < 32 || codePoint === 127
    })
  ) {
    return "Folder name cannot contain whitespace or control characters."
  }

  return undefined
}

function validateRootName(value: string) {
  const folderValidation = validateFolderName(value)
  if (folderValidation) {
    return folderValidation.replace("Folder", "Root").replace("folder", "root")
  }

  if (!value.trim().includes("_")) {
    return "Root name must contain an underscore."
  }

  return undefined
}

function sortResourceTree(nodes: ResourceTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  })

  for (const node of nodes) {
    if (node.type === "folder") {
      sortResourceTree(node.children)
    }
  }
}

function buildResourceTree(
  resources: WebResource[],
  boundResourceIds: Set<string>,
) {
  const root: ResourceTreeFolder = {
    type: "folder",
    id: "folder:",
    name: "",
    path: "",
    children: [],
    resourceCount: 0,
    boundCount: 0,
  }
  const folderByPath = new Map<string, ResourceTreeFolder>()

  for (const resource of resources) {
    const parts = splitResourceName(resource.name)
    const fileName = parts.at(-1) ?? resource.name
    const isBound = boundResourceIds.has(resource.id)
    const isFolderMarker = isFolderMarkerResourceName(resource.name)
    let parent = root
    const pathParts: string[] = []

    if (!isFolderMarker) {
      root.resourceCount += 1
    }
    if (isBound && !isFolderMarker) {
      root.boundCount += 1
    }

    for (const part of parts.slice(0, -1)) {
      pathParts.push(part)
      const folderPath = pathParts.join("/")
      let folder = folderByPath.get(folderPath)

      if (!folder) {
        folder = {
          type: "folder",
          id: `folder:${folderPath}`,
          name: part,
          path: folderPath,
          children: [],
          resourceCount: 0,
          boundCount: 0,
        }
        folderByPath.set(folderPath, folder)
        parent.children.push(folder)
      }

      if (!isFolderMarker) {
        folder.resourceCount += 1
      }
      if (isBound && !isFolderMarker) {
        folder.boundCount += 1
      }
      parent = folder
    }

    if (isFolderMarker) {
      parent.markerResource = resource
      continue
    }

    parent.children.push({
      type: "file",
      id: `file:${resource.id}`,
      name: fileName,
      resource,
    })
  }

  sortResourceTree(root.children)

  return root.children
}

function collectFolderIds(nodes: ResourceTreeNode[]) {
  const ids: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }

  return ids
}

function collectFolderPaths(nodes: ResourceTreeNode[]) {
  const paths: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path)
      paths.push(...collectFolderPaths(node.children))
    }
  }

  return paths
}

function collectFolderResources(folder: ResourceTreeFolder) {
  const resources: WebResource[] = []

  if (folder.markerResource) {
    resources.push(folder.markerResource)
  }

  for (const child of folder.children) {
    if (child.type === "file") {
      resources.push(child.resource)
    } else {
      resources.push(...collectFolderResources(child))
    }
  }

  return resources
}

function collectFolderFileResources(folder: ResourceTreeFolder) {
  const resources: WebResource[] = []

  for (const child of folder.children) {
    if (child.type === "file") {
      resources.push(child.resource)
    } else {
      resources.push(...collectFolderFileResources(child))
    }
  }

  return resources
}

function flattenResourceTree(
  nodes: ResourceTreeNode[],
  expandedFolderIds: Set<string>,
  forceExpanded: boolean,
  depth = 0,
) {
  const rows: ResourceTreeRow[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      rows.push({ type: "folder", folder: node, depth })

      if (forceExpanded || expandedFolderIds.has(node.id)) {
        rows.push(
          ...flattenResourceTree(
            node.children,
            expandedFolderIds,
            forceExpanded,
            depth + 1,
          ),
        )
      }
    } else {
      rows.push({ type: "file", file: node, depth })
    }
  }

  return rows
}

function formatResourceCount(count: number) {
  return count === 1 ? "1 item" : `${count} items`
}

function formatDownloadDuration(
  startedAt: number,
  completedAt: number | undefined,
  now: number,
) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor(((completedAt ?? now) - startedAt) / 1000),
  )

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }

  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function createDownloadJob(
  label: string,
  targetPath: string,
  resources: WebResource[],
): DownloadJob {
  const startedAt = Date.now()

  return {
    id: `download:${startedAt}:${Math.random().toString(36).slice(2)}`,
    label,
    targetPath,
    total: resources.length,
    completed: 0,
    status: "running",
    startedAt,
    items: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      status: "pending",
    })),
  }
}

function defaultWebResourceRoot(solution?: SolutionSummary) {
  const prefix = solution?.publisherPrefix?.trim() || "new"

  return `${prefix}_/CustomWebresource`
}

function formatSelectedSource(paths: string[]) {
  if (paths.length === 0) {
    return "No source selected"
  }

  if (paths.length === 1) {
    return paths[0]
  }

  return `${paths.length} files selected`
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

function ImportWebResourcesDialog({
  open,
  onOpenChange,
  environment,
  solutions,
  solutionsLoading,
  initialSourcePaths = [],
  initialTargetRoot,
  title = "Import Web Resources",
  submitLabel = "Import",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solutions: SolutionSummary[]
  solutionsLoading: boolean
  initialSourcePaths?: string[]
  initialTargetRoot?: string
  title?: string
  submitLabel?: string
}) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [form, setForm] = useState<ImportWebResourcesForm>({
    sourcePaths: initialSourcePaths,
    solutionUniqueName: "",
    targetRoot: initialTargetRoot ?? "",
    description: "",
  })
  const selectedSolution =
    solutions.find((solution) => solution.uniqueName === form.solutionUniqueName) ??
    solutions[0]
  const targetRoot = form.targetRoot.trim() || defaultWebResourceRoot(selectedSolution)

  const mutation = useMutation({
    mutationFn: (input: ImportWebResourcesForm) =>
      importWebResourcesInSolution(environment, {
        solutionUniqueName: input.solutionUniqueName,
        sourcePaths: input.sourcePaths,
        targetRoot: input.targetRoot,
        description: input.description,
      }),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment.id],
        }),
      ])
      onOpenChange(false)
      resetForm()
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : "Import failed")
    },
  })

  function resetForm() {
    setForm({
      sourcePaths: initialSourcePaths,
      solutionUniqueName: "",
      targetRoot: initialTargetRoot ?? "",
      description: "",
    })
    mutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }

    onOpenChange(nextOpen)
  }

  function updateField<Key extends keyof ImportWebResourcesForm>(
    key: Key,
    value: ImportWebResourcesForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function selectSolution(solutionUniqueName: string) {
    const previousDefault = defaultWebResourceRoot(selectedSolution)
    const nextSolution = solutions.find(
      (solution) => solution.uniqueName === solutionUniqueName,
    )

    setForm((current) => ({
      ...current,
      solutionUniqueName,
      targetRoot:
        current.targetRoot.trim() === "" || current.targetRoot === previousDefault
          ? defaultWebResourceRoot(nextSolution)
          : current.targetRoot,
    }))
  }

  async function selectFiles() {
    const sourcePaths = await chooseWebResourceImportFiles()
    if (sourcePaths.length === 0) {
      return
    }

    updateField("sourcePaths", sourcePaths)
  }

  async function selectFolder() {
    const sourcePath = await chooseWebResourceImportFolder()
    if (!sourcePath) {
      return
    }

    updateField("sourcePaths", [sourcePath])
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedSolution) {
      setLastMessage("Select an unmanaged solution before importing web resources.")
      return
    }

    mutation.mutate({
      ...form,
      solutionUniqueName: selectedSolution.uniqueName,
      targetRoot,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{environment.name}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitImport}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void selectFiles()}
            >
              <Upload className="size-4" />
              Files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void selectFolder()}
            >
              <FolderOpen className="size-4" />
              Folder
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Source</Label>
            <div className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {formatSelectedSource(form.sourcePaths)}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-solution">Solution</Label>
            <Select
              value={selectedSolution?.uniqueName}
              onValueChange={selectSolution}
              disabled={solutionsLoading || solutions.length === 0}
            >
              <SelectTrigger id="web-resource-import-solution" className="w-full">
                <SelectValue
                  placeholder={
                    solutionsLoading ? "Loading solutions" : "Select solution"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {solutions.map((solution) => (
                  <SelectItem key={solution.id} value={solution.uniqueName}>
                    {solution.friendlyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-root">Web Resource Root</Label>
            <Input
              id="web-resource-import-root"
              placeholder="AG_/CustomWebresource"
              value={targetRoot}
              onChange={(event) => updateField("targetRoot", event.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-description">Description</Label>
            <Input
              id="web-resource-import-description"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                form.sourcePaths.length === 0 ||
                !selectedSolution ||
                !targetRoot.trim()
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddFolderDialog({
  open,
  onOpenChange,
  environment,
  solutions,
  solutionsLoading,
  parentPath,
  existingFolderPaths,
  onFolderCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solutions: SolutionSummary[]
  solutionsLoading: boolean
  parentPath: string
  existingFolderPaths: Set<string>
  onFolderCreated: (folderPath: string) => void
}) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [folderName, setFolderName] = useState("")
  const [solutionUniqueName, setSolutionUniqueName] = useState("")
  const [validationMessage, setValidationMessage] = useState<string>()
  const selectedSolution =
    solutions.find((solution) => solution.uniqueName === solutionUniqueName) ??
    solutions[0]
  const normalizedParentPath = normalizeWebResourcePath(parentPath)
  const normalizedFolderName = normalizeWebResourcePath(folderName)
  const creatingRoot = !normalizedParentPath
  const folderPath = normalizeWebResourcePath(
    normalizedParentPath
      ? `${normalizedParentPath}/${normalizedFolderName}`
      : normalizedFolderName,
  )
  const displayFolderPath = folderPath
    ? creatingRoot
      ? `${folderPath}/`
      : folderPath
    : ""
  const markerName = folderPath
    ? `${folderPath}/${folderMarkerFileName}`
    : folderMarkerFileName

  const mutation = useMutation({
    mutationFn: () =>
      createWebResourceInSolution(environment, {
        solutionUniqueName: selectedSolution?.uniqueName ?? "",
        name: markerName,
        displayName: folderName.trim(),
        description: "OpenDataverse folder marker",
        type: "xml",
        content: folderMarkerContent,
      }),
    onSuccess: async (result) => {
      setLastMessage(
        selectedSolution
          ? `Created ${creatingRoot ? "root" : "folder"} ${displayFolderPath} in ${selectedSolution.uniqueName}.`
          : result.message,
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment.id],
        }),
      ])
      onFolderCreated(folderPath)
      handleOpenChange(false)
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : "Create folder failed")
    },
  })

  function resetForm() {
    setFolderName("")
    setSolutionUniqueName("")
    setValidationMessage(undefined)
    mutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }

    onOpenChange(nextOpen)
  }

  function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = creatingRoot
      ? validateRootName(folderName)
      : validateFolderName(folderName)
    if (validationError) {
      setValidationMessage(validationError)
      return
    }

    if (!selectedSolution) {
      setValidationMessage(
        creatingRoot
          ? "Select an unmanaged solution before creating a root."
          : "Select an unmanaged solution before creating a folder.",
      )
      return
    }

    if (existingFolderPaths.has(folderPath)) {
      setValidationMessage(
        `${creatingRoot ? "Root" : "Folder"} already exists: ${displayFolderPath}`,
      )
      return
    }

    setValidationMessage(undefined)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creatingRoot ? "Add Root" : "Add Folder"}</DialogTitle>
          <DialogDescription>
            {normalizedParentPath
              ? `Create a folder under ${normalizedParentPath}.`
              : "Create a publisher-style root such as sc_/ for new web resources."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitFolder}>
          <div className="space-y-1">
            <Label htmlFor="web-resource-folder-name">
              {creatingRoot ? "Root Name" : "Folder Name"}
            </Label>
            <Input
              id="web-resource-folder-name"
              placeholder={creatingRoot ? "sc_" : "AccountsView"}
              value={folderName}
              onChange={(event) => {
                setFolderName(event.target.value)
                setValidationMessage(undefined)
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-folder-solution">Solution</Label>
            <Select
              value={selectedSolution?.uniqueName}
              onValueChange={setSolutionUniqueName}
              disabled={solutionsLoading || solutions.length === 0}
            >
              <SelectTrigger id="web-resource-folder-solution" className="w-full">
                <SelectValue
                  placeholder={
                    solutionsLoading ? "Loading solutions" : "Select solution"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {solutions.map((solution) => (
                  <SelectItem key={solution.id} value={solution.uniqueName}>
                    {solution.friendlyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Web Resource Path</Label>
            <div className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {displayFolderPath ||
                (creatingRoot ? "Enter a root name" : "Enter a folder name")}
            </div>
          </div>

          {validationMessage && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {validationMessage}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !folderName.trim() ||
                !selectedSolution ||
                !folderPath
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderPlus className="size-4" />
              )}
              {creatingRoot ? "Add Root" : "Add Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteWebResourceDialog({
  open,
  onOpenChange,
  target,
  deleting,
  boundResourceIds,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target?: DeleteWebResourceTarget
  deleting: boolean
  boundResourceIds: Set<string>
  onConfirm: () => void
}) {
  const managedCount =
    target?.resources.filter((resource) => resource.isManaged).length ?? 0
  const boundCount =
    target?.resources.filter((resource) => boundResourceIds.has(resource.id))
      .length ?? 0
  const deleteDisabled =
    deleting || !target || target.resources.length === 0 || managedCount > 0
  const targetLabel =
    target?.kind === "root"
      ? "root"
      : target?.kind === "folder"
        ? "folder"
        : "file"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {targetLabel}</DialogTitle>
          <DialogDescription>
            This removes web resources from Dataverse. This action cannot be
            undone from OpenDataverse.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">{target.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {target.resources.length} web resource
                {target.resources.length === 1 ? "" : "s"} selected for delete
              </div>
            </div>

            {managedCount > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {managedCount} managed web resource
                {managedCount === 1 ? "" : "s"} cannot be deleted from this
                flow.
              </div>
            )}

            {boundCount > 0 && managedCount === 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-800">
                {boundCount} local binding{boundCount === 1 ? "" : "s"} will
                be removed after delete.
              </div>
            )}

            {target.resources.some((resource) => resource.isManaged) ? null : (
              <div className="max-h-44 overflow-auto rounded-lg border border-border">
                {target.resources.slice(0, 12).map((resource) => (
                  <div
                    key={resource.id}
                    className="border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="truncate font-mono text-xs">
                      {resource.name}
                    </div>
                  </div>
                ))}
                {target.resources.length > 12 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    and {target.resources.length - 12} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            disabled={deleteDisabled}
            onClick={onConfirm}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DownloadStatusPanel({
  job,
  now,
  onDismiss,
}: {
  job: DownloadJob
  now: number
  onDismiss: () => void
}) {
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

function ResourceViewerDialog({
  open,
  onOpenChange,
  resource,
  content,
  error,
  loading,
  savingAction,
  onSave,
}: ResourceViewerDialogProps) {
  const [editResourceId, setEditResourceId] = useState<string>()
  const [draftState, setDraftState] = useState<ResourceDraftState>()
  const [actionError, setActionError] = useState<ResourceActionError>()
  const resourceId = content?.id
  const savedContent = content?.content ?? ""
  const contentEncoding = content?.contentEncoding ?? "text"
  const isBinaryContent = contentEncoding === "base64"
  const imagePreviewSrc =
    content && isBinaryContent
      ? `data:${content.mimeType ?? "application/octet-stream"};base64,${content.content}`
      : undefined
  const draftContent =
    !isBinaryContent && draftState && draftState.resourceId === resourceId
      ? draftState.content
      : savedContent
  const dirty = !isBinaryContent && draftContent !== savedContent
  const isSaving = Boolean(savingAction)
  const canEdit = Boolean(
    content && !isBinaryContent && !loading && !error && !resource?.isManaged,
  )
  const editMode = editResourceId === resourceId && canEdit
  const actionErrorMessage =
    actionError && actionError.resourceId === resourceId
      ? actionError.message
      : undefined
  const editorLanguage = editorLanguageForWebResource(content)
  const editorPath = editorPathForWebResource(content)

  async function copyContent() {
    if (!draftContent || isBinaryContent) {
      return
    }

    await navigator.clipboard.writeText(draftContent)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSaving && !nextOpen) {
      return
    }

    if (!nextOpen) {
      setDraftState(undefined)
      setEditResourceId(undefined)
      setActionError(undefined)
    }

    onOpenChange(nextOpen)
  }

  function handleEditModeChange(enabled: boolean) {
    if (!canEdit) {
      return
    }

    setEditResourceId(enabled ? resourceId : undefined)
  }

  function revertDraft() {
    setDraftState(undefined)
    setActionError(undefined)
  }

  async function saveDraft(publish: boolean) {
    if (!content || !canEdit) {
      return
    }

    setActionError(undefined)

    try {
      await onSave(content, draftContent, publish)
      setDraftState(undefined)
    } catch (error) {
      setActionError(
        {
          resourceId: content.id,
          message:
            error instanceof Error
              ? error.message
              : String(error ?? "Could not save web resource"),
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[min(900px,calc(100vh-3rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] 2xl:w-[1480px] 2xl:max-w-[1480px]">
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
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
                {content?.mimeType && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {content.mimeType}
                  </span>
                )}
                {dirty && (
                  <Badge
                    variant="outline"
                    className="border-amber-400/70 bg-amber-50/80 text-amber-700"
                  >
                    Unsaved
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {loading && (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading
                </span>
              )}
              <Label
                htmlFor="resource-editor-edit-mode"
                className={cn(
                  "flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground",
                  canEdit && "text-foreground",
                )}
              >
                Edit
                <Switch
                  id="resource-editor-edit-mode"
                  size="sm"
                  checked={editMode && canEdit}
                  onCheckedChange={handleEditModeChange}
                  disabled={!canEdit || isSaving}
                />
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyContent()}
                disabled={!draftContent || isBinaryContent}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={revertDraft}
                disabled={!dirty || isSaving}
              >
                <RotateCcw className="size-3.5" />
                Revert
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                <X className="size-3.5" />
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveDraft(false)}
                disabled={!canEdit || !dirty || isSaving}
              >
                {savingAction === "save" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                onClick={() => void saveDraft(true)}
                disabled={!canEdit || isSaving}
              >
                {savingAction === "publish" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Save & Publish
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div>
            {Boolean(error) && (
              <div className="m-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </div>
            )}

            {actionErrorMessage && (
              <div className="m-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {actionErrorMessage}
              </div>
            )}
          </div>

          {!error && loading && !content && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading content
            </div>
          )}

              {!error && (!loading || content) && (
                <div className="min-h-0">
                  {imagePreviewSrc ? (
                    <div className="flex h-full min-h-0 items-center justify-center bg-muted/20 p-6">
                      <div className="flex max-h-full max-w-full flex-col items-center gap-3">
                        <img
                          src={imagePreviewSrc}
                          alt={content?.name ?? "Web resource image"}
                          className="max-h-[calc(100vh-14rem)] max-w-full rounded-lg border border-border bg-background object-contain shadow-sm"
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ImageIcon className="size-3.5" />
                          Preview only. Use Bind and Publish to replace binary
                          image content.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Editor
                      beforeMount={configureWebResourceIntellisense}
                      height="100%"
                      language={editorLanguage}
                      path={editorPath}
                      value={draftContent}
                      onChange={(value) => {
                        if (resourceId) {
                          setDraftState({ resourceId, content: value ?? "" })
                        }
                      }}
                      loading={
                        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Loading content
                        </div>
                      }
                      options={{
                        readOnly: !editMode || !canEdit || isSaving,
                        minimap: { enabled: true },
                        fontSize: 13,
                        lineNumbersMinChars: 3,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        wordWrap: "on",
                        renderLineHighlight: "line",
                        quickSuggestions: {
                          other: true,
                          comments: false,
                          strings: false,
                        },
                        suggestOnTriggerCharacters: true,
                        tabCompletion: "on",
                        parameterHints: { enabled: true, cycle: true },
                        hover: { enabled: true },
                      }}
                      theme="vs"
                    />
                  )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function WebResourceManagementModule({
  window,
}: WebResourceManagementModuleProps) {
  const [query, setQuery] = useState("")
  const [includeManaged, setIncludeManaged] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceViewerOpen, setResourceViewerOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
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
      setLastMessage(error instanceof Error ? error.message : "Delete failed")
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
        const message =
          error instanceof Error
            ? error.message
            : String(error ?? "Download failed")
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
        error instanceof Error
          ? `${trigger === "auto" ? "Auto-publish failed: " : ""}${error.message}`
          : String(error ?? "Publish failed"),
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
      setLastMessage(
        error instanceof Error
          ? error.message
          : String(error ?? "Could not save web resource"),
      )
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
              error instanceof Error
                ? `Auto-publish watcher failed: ${error.message}`
                : "Auto-publish watcher failed",
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
        error instanceof Error
          ? `Could not start auto-publish watcher: ${error.message}`
          : "Could not start auto-publish watcher",
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
                onClick={() => setExpandedFolderIds(new Set(folderIds))}
                disabled={folderIds.length === 0}
              >
                <FolderOpen className="size-3.5" />
                Expand
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedFolderIds(new Set())}
                disabled={folderIds.length === 0}
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

        <TabsContent
          value="resources"
          className="min-h-0 flex-1 overflow-hidden p-0"
        >
          {resourceQuery.error && (
            <div className="border-b border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {resourceQuery.error instanceof Error
                ? resourceQuery.error.message
                : String(resourceQuery.error)}
            </div>
          )}

          <div className="h-full min-h-0 overflow-auto p-3">
            {downloadJob && (
              <DownloadStatusPanel
                job={downloadJob}
                now={downloadNow}
                onDismiss={() => setDownloadJob(undefined)}
              />
            )}

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
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading web resources
                      </span>
                    </TableCell>
                  </TableRow>
                )}

                {!resourceQuery.isLoading &&
                  resourceTreeRows.map((row) => {
                    if (row.type === "folder") {
                      const expanded =
                        searchActive || expandedFolderIds.has(row.folder.id)
                      const downloadableResourceCount =
                        collectFolderFileResources(row.folder).length

                      return (
                        <ContextMenu key={row.folder.id}>
                          <ContextMenuTrigger asChild>
                            <TableRow
                              aria-expanded={expanded}
                              className={cn(
                                "bg-muted/30 font-medium",
                                !searchActive && "cursor-pointer",
                              )}
                              onClick={() => {
                                if (!searchActive) {
                                  toggleFolder(row.folder.id)
                                }
                              }}
                            >
                              <TableCell className="max-w-96">
                                <div
                                  className="flex min-w-0 items-center gap-1.5"
                                  style={{
                                    paddingLeft: `${row.depth * 1.25}rem`,
                                  }}
                                  title={row.folder.path}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-expanded={expanded}
                                    aria-label={`${
                                      expanded ? "Collapse" : "Expand"
                                    } ${row.folder.path}`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      toggleFolder(row.folder.id)
                                    }}
                                    disabled={searchActive}
                                  >
                                    {expanded ? (
                                      <ChevronDown className="size-3.5" />
                                    ) : (
                                      <ChevronRight className="size-3.5" />
                                    )}
                                  </Button>
                                  {expanded ? (
                                    <FolderOpen className="size-4 shrink-0 text-primary" />
                                  ) : (
                                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="truncate font-mono text-xs">
                                    {row.folder.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">Folder</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatResourceCount(row.folder.resourceCount)}
                              </TableCell>
                              <TableCell>
                                {row.folder.boundCount > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    {row.folder.boundCount} bound
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Unbound
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right" />
                            </TableRow>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onSelect={() =>
                                showAddFolderDialog(row.folder.path)
                              }
                            >
                              <FolderPlus className="size-4" />
                              Add Folder
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() =>
                                void uploadFilesToFolder(row.folder)
                              }
                            >
                              <Upload className="size-4" />
                              Upload Files To Folder
                            </ContextMenuItem>
                            <ContextMenuItem
                              disabled={
                                downloadableResourceCount === 0 || downloadRunning
                              }
                              onSelect={() => void downloadFolder(row.folder)}
                            >
                              <Download className="size-4" />
                              Download{" "}
                              {isRootFolder(row.folder) ? "Root" : "Folder"}
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => showDeleteFolderDialog(row.folder)}
                            >
                              <Trash2 className="size-4" />
                              Delete {isRootFolder(row.folder) ? "Root" : "Folder"}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    }

                    const resource = row.file.resource
                    const binding = bindings.find(
                      (item) => item.webResourceId === resource.id,
                    )
                    const selected = selectedResourceId === resource.id
                    const ResourceIcon = resourceIcon(resource)

                    return (
                      <ContextMenu key={resource.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow
                            className={cn(
                              "cursor-pointer",
                              selected && "bg-primary/5 hover:bg-primary/5",
                            )}
                            onClick={() => openResourceViewer(resource)}
                          >
                            <TableCell className="max-w-96">
                              <div
                                className="flex min-w-0 items-center gap-1.5"
                                style={{
                                  paddingLeft: `${row.depth * 1.25 + 1.75}rem`,
                                }}
                                title={resource.name}
                              >
                                <ResourceIcon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate font-mono text-xs">
                                  {row.file.name}
                                </span>
                              </div>
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
                                  className="border-emerald-400/50 bg-emerald-50/70 text-emerald-700"
                                  variant="outline"
                                >
                                  Bound
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Unbound
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`View ${resource.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openResourceViewer(resource)
                                  }}
                                >
                                  <Code2 className="size-3.5" />
                                </Button>
                                {binding ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Unbind ${resource.name}`}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      unbindResource(binding)
                                    }}
                                    disabled={publishingIds.has(binding.id)}
                                  >
                                    <Unlink className="size-3.5" />
                                    Unbind
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void bindResource(resource)
                                    }}
                                  >
                                    <FileSymlink className="size-3.5" />
                                    Bind
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    showDeleteFileDialog(resource)
                                  }}
                                  disabled={resource.isManaged}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onSelect={() => openResourceViewer(resource)}
                          >
                            <Code2 className="size-4" />
                            View File
                          </ContextMenuItem>
                          {binding ? (
                            <ContextMenuItem
                              disabled={publishingIds.has(binding.id)}
                              onSelect={() => unbindResource(binding)}
                            >
                              <Unlink className="size-4" />
                              Unbind
                            </ContextMenuItem>
                          ) : (
                            <ContextMenuItem
                              onSelect={() => void bindResource(resource)}
                            >
                              <FileSymlink className="size-4" />
                              Bind
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem
                            disabled={downloadRunning}
                            onSelect={() => void downloadFile(resource)}
                          >
                            <Download className="size-4" />
                            Download File
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={resource.isManaged}
                            className="text-destructive focus:text-destructive"
                            onSelect={() => showDeleteFileDialog(resource)}
                          >
                            <Trash2 className="size-4" />
                            Delete File
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )
                  })}

                {!resourceQuery.isLoading && resources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
                          <Search className="size-4" />
                        </div>
                        <div className="text-sm">
                          No web resources found
                          {query.trim() ? " for this search" : ""}
                        </div>
                        {!query.trim() && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void resourceQuery.refetch()}
                          >
                            <RefreshCw className="size-3.5" />
                            Refresh
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent
          value="bindings"
          className="min-h-0 flex-1 overflow-auto p-3"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local File</TableHead>
                <TableHead>Web Resource</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void publishBinding(binding)}
                        disabled={publishingIds.has(binding.id)}
                      >
                        {publishingIds.has(binding.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                        Publish
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unbindResource(binding)}
                        disabled={publishingIds.has(binding.id)}
                      >
                        <Unlink className="size-3.5" />
                        Unbind
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {bindings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
                        <FileSymlink className="size-4" />
                      </div>
                      <div className="text-sm">
                        No local files bound to {environment.name}
                      </div>
                      <p className="max-w-xs text-xs">
                        Bind a web resource to a local file to enable auto-publish
                        on save.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

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
                onClick={() => void refetchActivity()}
                disabled={activityQuery.isFetching}
              >
                {activityQuery.isFetching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {activityQuery.isLoading && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading Dataverse audit history
              </div>
            )}

            {activityQuery.isError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4" />
                  Audit history unavailable
                </div>
                <p className="mt-1 max-w-2xl text-xs">
                  {activityQuery.error instanceof Error
                    ? activityQuery.error.message
                    : "Dataverse did not return web resource audit history for this environment."}
                </p>
              </div>
            )}

            {!activityQuery.isLoading &&
              !activityQuery.isError &&
              (activityQuery.data?.length ?? 0) === 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-6">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                    <History className="size-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3 text-center text-sm font-medium">
                    No audited web resource activity
                  </div>
                  <p className="mx-auto mt-1 max-w-md text-center text-xs text-muted-foreground">
                    Turn on Dataverse auditing for the web resource table and
                    its columns to capture change history.
                  </p>
                </div>
              )}

            {!activityQuery.isError && (activityQuery.data?.length ?? 0) > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                {(activityQuery.data ?? []).map((activity, index) => (
                  <article
                    key={activity.id}
                    className={cn(
                      "grid gap-3 p-3 text-sm md:grid-cols-[180px_minmax(0,1fr)]",
                      index !== (activityQuery.data?.length ?? 0) - 1 &&
                        "border-b border-border",
                    )}
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatActivityTime(activity.occurredOn)}
                      </div>
                      {activityKindPill(activity)}
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
                      <div className="text-sm font-medium">
                        {activity.detail}
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>By {activity.actorName}</span>
                        {activity.actorDomain && (
                          <span className="font-mono">
                            {activity.actorDomain}
                          </span>
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
      </Tabs>
    </section>
  )
}
