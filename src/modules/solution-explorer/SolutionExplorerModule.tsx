import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Layers,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react"

import {
  addExistingWebResourceToSolution,
  createWebResourceInSolution,
  getSolutionComponentDependencies,
  getSolutionComponentLayers,
  importWebResourcesInSolution,
  listSolutionComponents,
  listSolutions,
  listSolutionWebResourceCandidates,
  type SolutionManagedFilter,
} from "@/core/desktop/bridge"
import {
  getEnvironmentById,
  type DataverseEnvironment,
  type SolutionComponentSummary,
  type SolutionDependencyItem,
  type SolutionLayer,
  type SolutionSummary,
  type ToolWindow,
  type WebResource,
} from "@/core/dataverse/schemas"
import { useWorkspaceStore } from "@/store/workspace-store"
import { cn } from "@/lib/utils"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
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
  chooseWebResourceImportFiles,
  chooseWebResourceImportFolder,
} from "@/core/desktop/file-dialog"

type ManagedFilter = SolutionManagedFilter

type CreateWebResourceForm = {
  name: string
  displayName: string
  description: string
  type: WebResource["type"]
  content: string
}

type ImportWebResourcesForm = {
  sourcePaths: string[]
  targetRoot: string
  description: string
}

const groupOrder = [
  "Tables",
  "Columns",
  "Relationships",
  "Choices",
  "Keys and Indexes",
  "Forms",
  "Views",
  "Processes",
  "Web Resources",
  "Apps",
  "Environment Variables",
  "Security",
  "Developer Extensions",
  "Connectors",
  "AI",
  "Other",
]

const webResourceTypes: Array<{ value: WebResource["type"]; label: string }> = [
  { value: "js", label: "JavaScript" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "resx", label: "RESX" },
]

function formatDate(value?: string) {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function includesSearch(value: string | undefined, search: string) {
  return value?.toLowerCase().includes(search.toLowerCase()) ?? false
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

function solutionMatchesFilter(solution: SolutionSummary, filter: ManagedFilter) {
  if (filter === "managed") {
    return solution.isManaged
  }

  if (filter === "unmanaged") {
    return !solution.isManaged
  }

  return true
}

function groupComponents(components: SolutionComponentSummary[]) {
  const groups = new Map<string, SolutionComponentSummary[]>()

  for (const component of components) {
    const items = groups.get(component.group) ?? []
    items.push(component)
    groups.set(component.group, items)
  }

  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = groupOrder.indexOf(left)
    const rightIndex = groupOrder.indexOf(right)
    const normalizedLeft = leftIndex === -1 ? groupOrder.length : leftIndex
    const normalizedRight = rightIndex === -1 ? groupOrder.length : rightIndex

    return normalizedLeft - normalizedRight || left.localeCompare(right)
  })
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value?: string | number | boolean
}) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[11px] text-foreground">
        {value === undefined || value === "" ? "Unknown" : String(value)}
      </dd>
    </div>
  )
}

function DependencyTable({
  title,
  items,
  empty,
}: {
  title: string
  items: SolutionDependencyItem[]
  empty: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">{title}</h3>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="border py-4 text-center text-muted-foreground">{empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dependent</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">
                    {item.dependentComponentTypeLabel}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {item.dependentComponentObjectId}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {item.requiredComponentTypeLabel}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {item.requiredComponentObjectId}
                  </div>
                </TableCell>
                <TableCell>{item.dependencyTypeLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function LayersTable({ layers }: { layers: SolutionLayer[] }) {
  if (layers.length === 0) {
    return (
      <p className="border py-4 text-center text-muted-foreground">
        No layers returned for this component.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Solution</TableHead>
          <TableHead>Publisher</TableHead>
          <TableHead>Changed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {layers.map((layer) => (
          <TableRow key={layer.id}>
            <TableCell>{layer.order ?? "-"}</TableCell>
            <TableCell>
              <div className="font-medium">
                {layer.solutionName ?? layer.name}
              </div>
              <div className="text-muted-foreground">{layer.componentName}</div>
            </TableCell>
            <TableCell>{layer.publisherName ?? "Unknown"}</TableCell>
            <TableCell>{formatDate(layer.overwriteTime)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AddExistingWebResourceDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment?: DataverseEnvironment
  solution?: SolutionSummary
}) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState("")

  const candidatesQuery = useQuery({
    queryKey: ["solution-web-resource-candidates", environment?.id, solution?.id],
    enabled: Boolean(open && environment && solution),
    queryFn: () =>
      listSolutionWebResourceCandidates(
        environment as DataverseEnvironment,
        solution?.id ?? "",
      ),
  })

  const candidates = candidatesQuery.data ?? []
  const filteredCandidates = candidates.filter((candidate) => {
    const matches =
      includesSearch(candidate.name, search) ||
      includesSearch(candidate.displayName, search) ||
      includesSearch(candidate.type, search)

    return matches && !candidate.inSolution
  })

  const mutation = useMutation({
    mutationFn: (webResourceId: string) =>
      addExistingWebResourceToSolution(
        environment as DataverseEnvironment,
        solution?.uniqueName ?? "",
        webResourceId,
      ),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solutions", environment?.id] }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment?.id, solution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solution-web-resource-candidates", environment?.id, solution?.id],
        }),
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : "Add failed")
    },
  })

  const selectedCandidate = candidates.find((item) => item.id === selectedId)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch("")
      setSelectedId("")
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Existing Web Resource</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search web resources"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <ScrollArea className="h-72 border">
            {candidatesQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                No available web resources.
              </div>
            ) : (
              <div className="divide-y">
                {filteredCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left hover:bg-muted/60",
                      selectedId === candidate.id && "bg-muted",
                    )}
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {candidate.displayName || candidate.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {candidate.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{candidate.type}</Badge>
                      {selectedId === candidate.id && <Check className="size-4" />}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!selectedCandidate || mutation.isPending}
            onClick={() => selectedCandidate && mutation.mutate(selectedCandidate.id)}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateWebResourceDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment?: DataverseEnvironment
  solution?: SolutionSummary
}) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [form, setForm] = useState<CreateWebResourceForm>({
    name: "",
    displayName: "",
    description: "",
    type: "js",
    content: "",
  })

  const mutation = useMutation({
    mutationFn: (input: CreateWebResourceForm) =>
      createWebResourceInSolution(environment as DataverseEnvironment, {
        solutionUniqueName: solution?.uniqueName ?? "",
        ...input,
      }),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solutions", environment?.id] }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment?.id, solution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solution-web-resource-candidates", environment?.id, solution?.id],
        }),
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : "Create failed")
    },
  })

  function updateField<Key extends keyof CreateWebResourceForm>(
    key: Key,
    value: CreateWebResourceForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setForm({
        name: "",
        displayName: "",
        description: "",
        type: "js",
        content: "",
      })
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Web Resource</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(form)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1">
              <Label htmlFor="web-resource-name">Name</Label>
              <Input
                id="web-resource-name"
                placeholder="new_/scripts/account-form.js"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="web-resource-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  updateField("type", value as WebResource["type"])
                }
              >
                <SelectTrigger id="web-resource-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {webResourceTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-display-name">Display Name</Label>
            <Input
              id="web-resource-display-name"
              value={form.displayName}
              onChange={(event) => updateField("displayName", event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-description">Description</Label>
            <Input
              id="web-resource-description"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-content">Content</Label>
            <textarea
              id="web-resource-content"
              className="h-48 w-full resize-none border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              value={form.content}
              onChange={(event) => updateField("content", event.target.value)}
              spellCheck={false}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !form.name.trim()}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus2 className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportWebResourcesDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment?: DataverseEnvironment
  solution?: SolutionSummary
}) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [form, setForm] = useState<ImportWebResourcesForm>({
    sourcePaths: [],
    targetRoot: defaultWebResourceRoot(solution),
    description: "",
  })

  const mutation = useMutation({
    mutationFn: (input: ImportWebResourcesForm) =>
      importWebResourcesInSolution(environment as DataverseEnvironment, {
        solutionUniqueName: solution?.uniqueName ?? "",
        ...input,
      }),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solutions", environment?.id] }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment?.id, solution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solution-web-resource-candidates", environment?.id, solution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment?.id],
        }),
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : "Import failed")
    },
  })

  function resetForm() {
    setForm({
      sourcePaths: [],
      targetRoot: defaultWebResourceRoot(solution),
      description: "",
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
      mutation.reset()
    }

    onOpenChange(nextOpen)
  }

  function updateField<Key extends keyof ImportWebResourcesForm>(
    key: Key,
    value: ImportWebResourcesForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Web Resources</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(form)
          }}
        >
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
            <div className="truncate border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
              {formatSelectedSource(form.sourcePaths)}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-root">Web Resource Root</Label>
            <Input
              id="web-resource-import-root"
              placeholder="AG_/CustomWebresource"
              value={form.targetRoot}
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
                !form.targetRoot.trim()
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SolutionExplorerModule({ window }: { window: ToolWindow }) {
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [solutionSearch, setSolutionSearch] = useState("")
  const [managedFilter, setManagedFilter] = useState<ManagedFilter>("unmanaged")
  const [componentSearch, setComponentSearch] = useState("")
  const [selectedSolutionId, setSelectedSolutionId] = useState("")
  const [selectedComponentId, setSelectedComponentId] = useState("")
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const environment =
    getEnvironmentById(config, window.environmentId) ??
    getEnvironmentById(config, config.currentEnvironmentId)

  const solutionsQuery = useQuery({
    queryKey: ["solutions", environment?.id, managedFilter],
    enabled: Boolean(environment),
    queryFn: () =>
      listSolutions(environment as DataverseEnvironment, managedFilter),
  })

  const solutions = useMemo(
    () => solutionsQuery.data ?? [],
    [solutionsQuery.data],
  )
  const filteredSolutions = useMemo(
    () =>
      solutions.filter((solution) => {
        const matchesSearch =
          includesSearch(solution.friendlyName, solutionSearch) ||
          includesSearch(solution.uniqueName, solutionSearch) ||
          includesSearch(solution.publisherName, solutionSearch)

        return matchesSearch && solutionMatchesFilter(solution, managedFilter)
      }),
    [solutions, solutionSearch, managedFilter],
  )

  const effectiveSelectedSolutionId = filteredSolutions.some(
    (solution) => solution.id === selectedSolutionId,
  )
    ? selectedSolutionId
    : filteredSolutions[0]?.id ?? ""
  const selectedSolution = solutions.find(
    (solution) => solution.id === effectiveSelectedSolutionId,
  )

  const componentsQuery = useQuery({
    queryKey: ["solution-components", environment?.id, selectedSolution?.id],
    enabled: Boolean(environment && selectedSolution),
    queryFn: () =>
      listSolutionComponents(
        environment as DataverseEnvironment,
        selectedSolution?.id ?? "",
      ),
  })

  const components = useMemo(
    () => componentsQuery.data ?? [],
    [componentsQuery.data],
  )
  const filteredComponents = useMemo(
    () =>
      components.filter(
        (component) =>
          includesSearch(component.displayName, componentSearch) ||
          includesSearch(component.logicalName, componentSearch) ||
          includesSearch(component.schemaName, componentSearch) ||
          includesSearch(component.componentTypeLabel, componentSearch) ||
          includesSearch(component.group, componentSearch) ||
          includesSearch(component.objectId, componentSearch),
      ),
    [components, componentSearch],
  )
  const componentGroups = useMemo(
    () => groupComponents(filteredComponents),
    [filteredComponents],
  )

  const effectiveSelectedComponentId = filteredComponents.some(
    (component) => component.id === selectedComponentId,
  )
    ? selectedComponentId
    : filteredComponents[0]?.id ?? ""
  const selectedComponent = components.find(
    (component) => component.id === effectiveSelectedComponentId,
  )

  const dependenciesQuery = useQuery({
    queryKey: [
      "solution-component-dependencies",
      environment?.id,
      selectedComponent?.objectId,
      selectedComponent?.componentType,
    ],
    enabled: Boolean(environment && selectedComponent),
    queryFn: () =>
      getSolutionComponentDependencies(
        environment as DataverseEnvironment,
        selectedComponent as SolutionComponentSummary,
      ),
  })

  const layersQuery = useQuery({
    queryKey: [
      "solution-component-layers",
      environment?.id,
      selectedComponent?.objectId,
      selectedComponent?.layerName,
    ],
    enabled: Boolean(environment && selectedComponent),
    queryFn: () =>
      getSolutionComponentLayers(
        environment as DataverseEnvironment,
        selectedComponent as SolutionComponentSummary,
      ),
  })

  if (!environment) {
    return (
      <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center text-sm text-muted-foreground">
        Select an environment before opening this tool.
      </section>
    )
  }

  const canWriteWebResources = Boolean(selectedSolution && !selectedSolution.isManaged)
  const dependencies = dependenciesQuery.data
  const layers = layersQuery.data ?? []

  return (
    <section className="grid h-full min-h-0 grid-cols-1 border-l bg-background xl:grid-cols-[18rem_minmax(34rem,1fr)_26rem]">
      <aside className="min-h-0 border-r">
        <div className="space-y-3 border-b p-3">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Solutions</h2>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {environment.name}
            </p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search solutions"
              value={solutionSearch}
              onChange={(event) => setSolutionSearch(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Select
              value={managedFilter}
              onValueChange={(value) => setManagedFilter(value as ManagedFilter)}
            >
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unmanaged">Unmanaged</SelectItem>
                <SelectItem value="managed">Managed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Refresh solutions"
              onClick={() => void solutionsQuery.refetch()}
            >
              <RefreshCw
                className={cn("size-4", solutionsQuery.isFetching && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-9.75rem)]">
          {solutionsQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading
            </div>
          ) : filteredSolutions.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No solutions found.
            </div>
          ) : (
            <div className="divide-y">
              {filteredSolutions.map((solution) => (
                <button
                  key={solution.id}
                  type="button"
                  className={cn(
                    "w-full px-3 py-3 text-left hover:bg-muted/60",
                    solution.id === effectiveSelectedSolutionId && "bg-muted",
                  )}
                  onClick={() => {
                    setSelectedSolutionId(solution.id)
                    setComponentSearch("")
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {solution.friendlyName}
                    </span>
                    <Badge variant={solution.isManaged ? "secondary" : "outline"}>
                      {solution.isManaged ? "Managed" : "Unmanaged"}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {solution.uniqueName}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{solution.publisherName ?? "Unknown publisher"}</span>
                    <span>
                      {solution.id === selectedSolution?.id && componentsQuery.data
                        ? `${componentsQuery.data.length} components`
                        : solution.componentCount === undefined
                          ? "Open to count"
                          : `${solution.componentCount} components`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>

      <main className="min-h-0 border-r">
        <div className="space-y-3 border-b p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-medium">
                  {selectedSolution?.friendlyName ?? "No solution"}
                </h2>
                {selectedSolution && (
                  <Badge variant={selectedSolution.isManaged ? "secondary" : "outline"}>
                    {selectedSolution.isManaged ? "Managed" : "Unmanaged"}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{selectedSolution?.uniqueName}</span>
                <span>v{selectedSolution?.version || "Unknown"}</span>
                <span>{selectedSolution?.publisherName ?? "Unknown publisher"}</span>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWriteWebResources}
                onClick={() => setImportOpen(true)}
              >
                <Upload className="size-4" />
                Import
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWriteWebResources}
                onClick={() => setAddExistingOpen(true)}
              >
                <Plus className="size-4" />
                Existing
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canWriteWebResources}
                onClick={() => setCreateOpen(true)}
              >
                <FilePlus2 className="size-4" />
                New
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search components"
                value={componentSearch}
                onChange={(event) => setComponentSearch(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedSolution}
              onClick={() => void componentsQuery.refetch()}
            >
              <RefreshCw
                className={cn("size-4", componentsQuery.isFetching && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-8.75rem)]">
          {componentsQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading
            </div>
          ) : !selectedSolution ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Select a solution.
            </div>
          ) : componentGroups.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              No components found.
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Managed</TableHead>
                  <TableHead>Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {componentGroups.flatMap(([group, items]) => [
                  <TableRow key={`group-${group}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={4} className="font-medium">
                      {group} <span className="text-muted-foreground">{items.length}</span>
                    </TableCell>
                  </TableRow>,
                  ...items.map((component) => (
                    <TableRow
                      key={component.id}
                      data-state={
                        component.id === effectiveSelectedComponentId
                          ? "selected"
                          : undefined
                      }
                      className="cursor-pointer"
                      onClick={() => setSelectedComponentId(component.id)}
                    >
                      <TableCell>
                        <div className="max-w-[28rem] truncate font-medium">
                          {component.displayName}
                        </div>
                        <div className="max-w-[28rem] truncate font-mono text-[11px] text-muted-foreground">
                          {component.logicalName ?? component.schemaName ?? component.objectId}
                        </div>
                      </TableCell>
                      <TableCell>{component.componentTypeLabel}</TableCell>
                      <TableCell>
                        {component.isManaged === undefined ? (
                          <span className="text-muted-foreground">Unknown</span>
                        ) : component.isManaged ? (
                          "Yes"
                        ) : (
                          "No"
                        )}
                      </TableCell>
                      <TableCell>{formatDate(component.modifiedOn)}</TableCell>
                    </TableRow>
                  )),
                ])}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </main>

      <aside className="min-h-0">
        <div className="border-b p-3">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Inspector</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {selectedComponent?.displayName ?? "No component selected"}
          </p>
        </div>

        <Tabs defaultValue="details" className="h-[calc(100%-4.1rem)] gap-0">
          <TabsList variant="line" className="mx-3 mt-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger value="layers">Layers</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="min-h-0 p-3">
            {!selectedComponent ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                Select a component.
              </div>
            ) : (
              <ScrollArea className="h-full">
                <dl className="border">
                  <DetailRow label="Name" value={selectedComponent.displayName} />
                  <DetailRow label="Type" value={selectedComponent.componentTypeLabel} />
                  <DetailRow label="Group" value={selectedComponent.group} />
                  <DetailRow label="Component ID" value={selectedComponent.id} />
                  <DetailRow label="Object ID" value={selectedComponent.objectId} />
                  <DetailRow label="Logical Name" value={selectedComponent.logicalName} />
                  <DetailRow label="Schema Name" value={selectedComponent.schemaName} />
                  <DetailRow
                    label="Managed"
                    value={
                      selectedComponent.isManaged === undefined
                        ? undefined
                        : selectedComponent.isManaged
                    }
                  />
                  <DetailRow label="Created" value={formatDate(selectedComponent.createdOn)} />
                  <DetailRow label="Modified" value={formatDate(selectedComponent.modifiedOn)} />
                  <DetailRow
                    label="Root Behavior"
                    value={selectedComponent.rootComponentBehaviorLabel}
                  />
                  <DetailRow label="Version" value={selectedComponent.version} />
                </dl>

                {selectedComponent.relatedRecordUrl && (
                  <a
                    className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    href={selectedComponent.relatedRecordUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setLastMessage("Opening Dataverse record")}
                  >
                    <ExternalLink className="size-3.5" />
                    Open record
                  </a>
                )}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="dependencies" className="min-h-0 p-3">
            <ScrollArea className="h-full">
              {!selectedComponent ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  Select a component.
                </div>
              ) : dependenciesQuery.isLoading ? (
                <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading
                </div>
              ) : dependenciesQuery.isError ? (
                <div className="flex h-64 items-center justify-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" />
                  Could not load dependencies.
                </div>
              ) : (
                <div className="space-y-5">
                  <DependencyTable
                    title="This Depends On"
                    items={dependencies?.required ?? []}
                    empty="No required components returned."
                  />
                  <Separator />
                  <DependencyTable
                    title="Used By"
                    items={dependencies?.dependents ?? []}
                    empty="No dependent components returned."
                  />
                  <Separator />
                  <DependencyTable
                    title="Delete Blockers"
                    items={dependencies?.deleteBlockers ?? []}
                    empty="No delete blockers returned."
                  />
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layers" className="min-h-0 p-3">
            <ScrollArea className="h-full">
              {!selectedComponent ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  Select a component.
                </div>
              ) : layersQuery.isLoading ? (
                <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading
                </div>
              ) : layersQuery.isError ? (
                <div className="flex h-64 items-center justify-center gap-2 text-destructive">
                  <Layers className="size-4" />
                  Could not load layers.
                </div>
              ) : (
                <LayersTable layers={layers} />
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>

      <AddExistingWebResourceDialog
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        environment={environment}
        solution={selectedSolution}
      />
      <CreateWebResourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        environment={environment}
        solution={selectedSolution}
      />
      <ImportWebResourcesDialog
        key={selectedSolution?.id ?? "no-solution"}
        open={importOpen}
        onOpenChange={setImportOpen}
        environment={environment}
        solution={selectedSolution}
      />
    </section>
  )
}
