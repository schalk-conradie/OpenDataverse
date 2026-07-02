import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Archive,
  Boxes,
  ChevronDown,
  ChevronRight,
  Check,
  Download,
  FileCode2,
  FileSearch,
  ImagePlus,
  Layers,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import {
  exportPluginRegistration,
  getPluginComponentDependencies,
  getPluginRegistrationSnapshot,
  inspectPluginAssembly,
  listPluginMessageFilters,
  listPluginStepImages,
  listPluginSteps,
  listPluginTypes,
  registerPluginAssembly,
  registerPluginServiceEndpoint,
  registerPluginStep,
  registerPluginStepImage,
  setPluginStepState,
  unregisterPluginAssembly,
  unregisterPluginServiceEndpoint,
  unregisterPluginStep,
  unregisterPluginStepImage,
  unregisterPluginType,
  updatePluginAssembly,
} from "@/core/desktop/bridge"
import { formatErrorMessage } from "@/core/errors"
import {
  choosePluginAssemblyFile,
  choosePluginRegistrationExportFile,
} from "@/core/desktop/file-dialog"
import {
  getEnvironmentById,
  type DataverseEnvironment,
  type PluginAssemblyInspection,
  type PluginAssemblySummary,
  type PluginDependencyReport,
  type PluginEditableState,
  type PluginMessageFilterSummary,
  type PluginPackageSummary,
  type PluginRegistrationSnapshot,
  type PluginServiceEndpointSummary,
  type PluginStepImageSummary,
  type PluginStepSummary,
  type PluginTypeSummary,
  type ToolWindow,
} from "@/core/dataverse/schemas"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"

type RegistryKind = "package" | "assembly" | "type" | "step" | "image" | "endpoint"

type RegistryItem =
  | {
      kind: "package"
      id: string
      title: string
      subtitle: string
      managed: boolean
      editable: PluginEditableState
      data: PluginPackageSummary
    }
  | {
      kind: "assembly"
      id: string
      title: string
      subtitle: string
      managed: boolean
      editable: PluginEditableState
      data: PluginAssemblySummary
    }
  | {
      kind: "type"
      id: string
      title: string
      subtitle: string
      managed: boolean
      editable: PluginEditableState
      data: PluginTypeSummary
    }
  | {
      kind: "step"
      id: string
      title: string
      subtitle: string
      managed: boolean
      enabled: boolean
      editable: PluginEditableState
      data: PluginStepSummary
    }
  | {
      kind: "image"
      id: string
      title: string
      subtitle: string
      managed: boolean
      editable: PluginEditableState
      data: PluginStepImageSummary
    }
  | {
      kind: "endpoint"
      id: string
      title: string
      subtitle: string
      managed: boolean
      editable: PluginEditableState
      data: PluginServiceEndpointSummary
    }

type RegistryTreeRow = {
  key: string
  item: RegistryItem
  depth: number
  expandable: boolean
  expanded: boolean
  loading: boolean
  childCount?: number
}

type PluginTreeChildren = {
  typesByAssembly: Record<string, PluginTypeSummary[]>
  stepsByType: Record<string, PluginStepSummary[]>
  stepsByEndpoint: Record<string, PluginStepSummary[]>
  imagesByStep: Record<string, PluginStepImageSummary[]>
}

type AssemblyForm = {
  localPath: string
  name: string
  version: string
  culture: string
  publicKeyToken: string
  isolationMode: number
  sourceType: number
  description: string
  solutionUniqueName: string
}

type StepForm = {
  stepId?: string
  handlerType: "plugintype" | "serviceendpoint"
  pluginTypeId: string
  serviceEndpointId: string
  messageId: string
  messageFilterId: string
  name: string
  stage: number
  mode: number
  rank: number
  supportedDeployment: number
  asyncAutoDelete: boolean
  filteringAttributes: string
  configuration: string
  secureConfiguration: string
  impersonatingUserId: string
  description: string
  enabled: boolean
  solutionUniqueName: string
}

type ImageForm = {
  imageId?: string
  stepId: string
  name: string
  entityAlias: string
  imageType: number
  messagePropertyName: string
  attributes: string
  description: string
  solutionUniqueName: string
}

type EndpointForm = {
  endpointId?: string
  name: string
  contract: number
  authType: number
  url: string
  path: string
  namespaceAddress: string
  messageFormat: number
  authValue: string
  description: string
  solutionUniqueName: string
}

const emptySnapshot: PluginRegistrationSnapshot = {
  assemblies: [],
  packages: [],
  types: [],
  steps: [],
  images: [],
  messages: [],
  endpoints: [],
  users: [],
  stageOptions: [],
  modeOptions: [],
  deploymentOptions: [],
  isolationModeOptions: [],
  sourceTypeOptions: [],
  imageTypeOptions: [],
  endpointContractOptions: [],
  endpointAuthTypeOptions: [],
  warnings: [],
}

function includesSearch(value: string | undefined, search: string) {
  return value?.toLowerCase().includes(search.toLowerCase()) ?? false
}

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

function formatBytes(value?: number) {
  if (!value) {
    return "Unknown"
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function componentTypeForItem(item: RegistryItem) {
  switch (item.kind) {
    case "assembly":
      return 91
    case "type":
      return 90
    case "step":
      return 92
    case "image":
      return 93
    case "endpoint":
      return 95
    case "package":
      return 10029
  }
}

function registryItemKey(item: Pick<RegistryItem, "kind" | "id">) {
  return `${item.kind}:${item.id}`
}

function packageItem(item: PluginPackageSummary): RegistryItem {
  return {
    kind: "package",
    id: item.id,
    title: item.name,
    subtitle: item.version ?? item.fileName ?? "Package",
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function assemblyItem(item: PluginAssemblySummary): RegistryItem {
  return {
    kind: "assembly",
    id: item.id,
    title: item.name,
    subtitle: `${item.version} · ${item.isolationModeLabel}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function typeItem(item: PluginTypeSummary): RegistryItem {
  return {
    kind: "type",
    id: item.id,
    title: item.friendlyName || item.typeName,
    subtitle: item.typeName,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function stepItem(item: PluginStepSummary): RegistryItem {
  return {
    kind: "step",
    id: item.id,
    title: item.name,
    subtitle: `${item.messageName} · ${item.primaryEntity ?? "global"} · ${item.stageLabel}`,
    managed: item.isManaged,
    enabled: item.stateCode === 0,
    editable: item.editable,
    data: item,
  }
}

function imageItem(item: PluginStepImageSummary): RegistryItem {
  return {
    kind: "image",
    id: item.id,
    title: item.name,
    subtitle: `${item.imageTypeLabel} · ${item.stepName}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function endpointItem(item: PluginServiceEndpointSummary): RegistryItem {
  return {
    kind: "endpoint",
    id: item.id,
    title: item.name,
    subtitle: `${item.contractLabel} · ${item.authTypeLabel}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function registryItems(
  snapshot: PluginRegistrationSnapshot,
  children: PluginTreeChildren,
) {
  return [
    ...snapshot.packages.map(packageItem),
    ...snapshot.assemblies.map(assemblyItem),
    ...Object.values(children.typesByAssembly).flat().map(typeItem),
    ...Object.values(children.stepsByType).flat().map(stepItem),
    ...Object.values(children.stepsByEndpoint).flat().map(stepItem),
    ...Object.values(children.imagesByStep).flat().map(imageItem),
    ...snapshot.endpoints.map(endpointItem),
  ]
}

function buildTreeRows(
  snapshot: PluginRegistrationSnapshot,
  children: PluginTreeChildren,
  expandedKeys: Set<string>,
  loadingKeys: Set<string>,
) {
  const rows: RegistryTreeRow[] = []
  const assembliesByPackage = new Map<string, PluginAssemblySummary[]>()
  const packagedAssemblyIds = new Set<string>()

  for (const assembly of snapshot.assemblies) {
    if (assembly.packageId) {
      packagedAssemblyIds.add(assembly.id)
      assembliesByPackage.set(assembly.packageId, [
        ...(assembliesByPackage.get(assembly.packageId) ?? []),
        assembly,
      ])
    }
  }

  function pushRow(
    item: RegistryItem,
    depth: number,
    expandable: boolean,
    childCount?: number,
  ) {
    const key = registryItemKey(item)
    rows.push({
      key,
      item,
      depth,
      expandable,
      expanded: expandedKeys.has(key),
      loading: loadingKeys.has(key),
      childCount,
    })
  }

  function pushStep(step: PluginStepSummary, depth: number) {
    const item = stepItem(step)
    const images = children.imagesByStep[step.id]
    pushRow(item, depth, true, images?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const image of images ?? []) {
        pushRow(imageItem(image), depth + 1, false)
      }
    }
  }

  function pushType(pluginType: PluginTypeSummary, depth: number) {
    const item = typeItem(pluginType)
    const steps = children.stepsByType[pluginType.id]
    pushRow(item, depth, true, steps?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const step of steps ?? []) {
        pushStep(step, depth + 1)
      }
    }
  }

  function pushAssembly(assembly: PluginAssemblySummary, depth: number) {
    const item = assemblyItem(assembly)
    const pluginTypes = children.typesByAssembly[assembly.id]
    pushRow(item, depth, true, pluginTypes?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const pluginType of pluginTypes ?? []) {
        pushType(pluginType, depth + 1)
      }
    }
  }

  for (const pluginPackage of snapshot.packages) {
    const item = packageItem(pluginPackage)
    const assemblies = assembliesByPackage.get(pluginPackage.id) ?? []
    pushRow(item, 0, assemblies.length > 0, assemblies.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const assembly of assemblies) {
        pushAssembly(assembly, 1)
      }
    }
  }

  for (const assembly of snapshot.assemblies) {
    if (!packagedAssemblyIds.has(assembly.id)) {
      pushAssembly(assembly, 0)
    }
  }

  for (const endpoint of snapshot.endpoints) {
    const item = endpointItem(endpoint)
    const steps = children.stepsByEndpoint[endpoint.id]
    pushRow(item, 0, true, steps?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const step of steps ?? []) {
        pushStep(step, 1)
      }
    }
  }

  return rows
}

const kindConfig: Record<
  RegistryKind,
  { label: string; icon: React.ElementType }
> = {
  package: { label: "Package", icon: Boxes },
  assembly: { label: "Assembly", icon: Archive },
  type: { label: "Type", icon: FileCode2 },
  step: { label: "Step", icon: PlugZap },
  image: { label: "Image", icon: ImagePlus },
  endpoint: { label: "Endpoint", icon: Server },
}

function kindLabel(kind: RegistryKind) {
  return kindConfig[kind].label
}

function KindIcon({
  kind,
  className,
}: {
  kind: RegistryKind
  className?: string
}) {
  const Icon = kindConfig[kind].icon
  return <Icon className={cn("size-4", className)} />
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value?: string | number | boolean
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b py-2.5 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[11px] text-foreground">
        {value === undefined || value === "" ? "Unknown" : String(value)}
      </dd>
    </div>
  )
}

function StateBadge({ item }: { item: RegistryItem }) {
  if (item.managed) {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2 text-[11px] font-medium text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Managed
      </span>
    )
  }

  if ("enabled" in item) {
    return item.enabled ? (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-emerald-300/70 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-200">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Enabled
      </span>
    ) : (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-slate-300/70 bg-slate-50 px-2 text-[11px] font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/40 dark:text-slate-300">
        <span className="size-1.5 rounded-full bg-slate-400" />
        Disabled
      </span>
    )
  }

  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-primary" />
      Unmanaged
    </span>
  )
}

function makeAssemblyForm(
  inspection?: PluginAssemblyInspection,
  assembly?: PluginAssemblySummary,
): AssemblyForm {
  return {
    localPath: inspection?.localPath ?? "",
    name: inspection?.assemblyName ?? assembly?.name ?? "",
    version: inspection?.version ?? assembly?.version ?? "1.0.0.0",
    culture: inspection?.culture ?? assembly?.culture ?? "neutral",
    publicKeyToken:
      inspection?.publicKeyToken ?? assembly?.publicKeyToken ?? "null",
    isolationMode: assembly?.isolationMode ?? 2,
    sourceType: assembly?.sourceType ?? 0,
    description: assembly?.description ?? "",
    solutionUniqueName: "",
  }
}

function makeStepForm(snapshot: PluginRegistrationSnapshot, step?: PluginStepSummary): StepForm {
  return {
    stepId: step?.id,
    handlerType: step?.handlerType ?? "plugintype",
    pluginTypeId: step?.pluginTypeId ?? snapshot.types[0]?.id ?? "",
    serviceEndpointId: step?.serviceEndpointId ?? snapshot.endpoints[0]?.id ?? "",
    messageId: step?.messageId ?? snapshot.messages[0]?.id ?? "",
    messageFilterId: step?.messageFilterId ?? "__none__",
    name: step?.name ?? "",
    stage: step?.stage ?? 20,
    mode: step?.mode ?? 0,
    rank: step?.rank ?? 1,
    supportedDeployment: step?.supportedDeployment ?? 0,
    asyncAutoDelete: step?.asyncAutoDelete ?? false,
    filteringAttributes: step?.filteringAttributes ?? "",
    configuration: step?.configuration ?? "",
    secureConfiguration: "",
    impersonatingUserId: step?.impersonatingUserId ?? "__calling-user__",
    description: step?.description ?? "",
    enabled: step?.stateCode !== 1,
    solutionUniqueName: "",
  }
}

function makeImageForm(snapshot: PluginRegistrationSnapshot, image?: PluginStepImageSummary): ImageForm {
  return {
    imageId: image?.id,
    stepId: image?.stepId ?? snapshot.steps[0]?.id ?? "",
    name: image?.name ?? "",
    entityAlias: image?.entityAlias ?? "Image",
    imageType: image?.imageType ?? 0,
    messagePropertyName: image?.messagePropertyName ?? "Target",
    attributes: image?.attributes ?? "",
    description: image?.description ?? "",
    solutionUniqueName: "",
  }
}

function makeEndpointForm(
  snapshot: PluginRegistrationSnapshot,
  endpoint?: PluginServiceEndpointSummary,
): EndpointForm {
  return {
    endpointId: endpoint?.id,
    name: endpoint?.name ?? "",
    contract: endpoint?.contract ?? snapshot.endpointContractOptions[0]?.value ?? 8,
    authType: endpoint?.authType ?? snapshot.endpointAuthTypeOptions[0]?.value ?? 4,
    url: endpoint?.url ?? "",
    path: endpoint?.path ?? "",
    namespaceAddress: endpoint?.namespaceAddress ?? "",
    messageFormat: endpoint?.messageFormat ?? 2,
    authValue: "",
    description: endpoint?.description ?? "",
    solutionUniqueName: "",
  }
}

function DependenciesPanel({ report }: { report?: PluginDependencyReport }) {
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-4 py-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
          <Layers className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium">No dependency query loaded</p>
        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
          Click Dependencies on a selected component to see what blocks or
          requires it.
        </p>
      </div>
    )
  }

  const rows = [
    ...report.deleteBlockers.map((item) => ({ ...item, group: "Delete blocker" })),
    ...report.dependents.map((item) => ({ ...item, group: "Dependent" })),
    ...report.required.map((item) => ({ ...item, group: "Required" })),
  ]

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-4 py-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
          <Check className="size-5 text-emerald-500" />
        </div>
        <p className="mt-3 text-sm font-medium">No dependencies</p>
        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
          Nothing is blocking or depending on this component.
        </p>
      </div>
    )
  }

  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Component</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={`${item.group}-${item.id}`}>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium",
                    item.group === "Delete blocker"
                      ? "bg-destructive/10 text-destructive"
                      : item.group === "Dependent"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.group}
                </span>
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  {item.dependentComponentTypeLabel}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {item.dependentComponentObjectId}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function PluginRegistrationModule({ window }: { window: ToolWindow }) {
  const queryClient = useQueryClient()
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const environment = getEnvironmentById(
    config,
    window.environmentId ?? config.currentEnvironmentId,
  )
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<RegistryKind | "all">("all")
  const [selected, setSelected] = useState<{ kind: RegistryKind; id: string }>()
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())
  const [loadingChildKeys, setLoadingChildKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [typesByAssembly, setTypesByAssembly] = useState<
    Record<string, PluginTypeSummary[]>
  >({})
  const [stepsByType, setStepsByType] = useState<
    Record<string, PluginStepSummary[]>
  >({})
  const [stepsByEndpoint, setStepsByEndpoint] = useState<
    Record<string, PluginStepSummary[]>
  >({})
  const [imagesByStep, setImagesByStep] = useState<
    Record<string, PluginStepImageSummary[]>
  >({})
  const [assemblyOpen, setAssemblyOpen] = useState(false)
  const [assemblyTarget, setAssemblyTarget] = useState<PluginAssemblySummary>()
  const [inspection, setInspection] = useState<PluginAssemblyInspection>()
  const [assemblyForm, setAssemblyForm] = useState<AssemblyForm>(() =>
    makeAssemblyForm(),
  )
  const [selectedTypeNames, setSelectedTypeNames] = useState<string[]>([])
  const [stepOpen, setStepOpen] = useState(false)
  const [stepForm, setStepForm] = useState<StepForm>(() =>
    makeStepForm(emptySnapshot),
  )
  const [imageOpen, setImageOpen] = useState(false)
  const [imageForm, setImageForm] = useState<ImageForm>(() =>
    makeImageForm(emptySnapshot),
  )
  const [endpointOpen, setEndpointOpen] = useState(false)
  const [endpointForm, setEndpointForm] = useState<EndpointForm>(() =>
    makeEndpointForm(emptySnapshot),
  )
  const [dependencyReport, setDependencyReport] =
    useState<PluginDependencyReport>()
  const [errorDialog, setErrorDialog] = useState<{
    title: string
    message: string
  }>()

  const snapshotQuery = useQuery({
    queryKey: ["plugin-registration-snapshot", environment?.id],
    enabled: Boolean(environment),
    queryFn: () => getPluginRegistrationSnapshot(environment as DataverseEnvironment),
    retry: false,
  })
  const snapshot = snapshotQuery.data ?? emptySnapshot
  const treeChildren = useMemo(
    () => ({
      typesByAssembly,
      stepsByType,
      stepsByEndpoint,
      imagesByStep,
    }),
    [imagesByStep, stepsByEndpoint, stepsByType, typesByAssembly],
  )
  const formSnapshot = useMemo(
    () => ({
      ...snapshot,
      types: Object.values(typesByAssembly).flat(),
      steps: [
        ...Object.values(stepsByType).flat(),
        ...Object.values(stepsByEndpoint).flat(),
      ],
      images: Object.values(imagesByStep).flat(),
    }),
    [imagesByStep, snapshot, stepsByEndpoint, stepsByType, typesByAssembly],
  )
  const items = useMemo(
    () => registryItems(snapshot, treeChildren),
    [snapshot, treeChildren],
  )
  const treeRows = useMemo(
    () =>
      buildTreeRows(snapshot, treeChildren, expandedKeys, loadingChildKeys),
    [expandedKeys, loadingChildKeys, snapshot, treeChildren],
  )
  const visibleTreeRows = useMemo(
    () =>
      treeRows.filter((row) => {
        const matchesKind = kindFilter === "all" || row.item.kind === kindFilter
        const matchesSearch =
          !search.trim() ||
          includesSearch(row.item.title, search) ||
          includesSearch(row.item.subtitle, search) ||
          includesSearch(row.item.id, search)

        return matchesKind && matchesSearch
      }),
    [kindFilter, search, treeRows],
  )
  const selectedItem = useMemo(() => {
    if (!selected) {
      return visibleTreeRows[0]?.item ?? items[0]
    }

    return (
      items.find((item) => item.kind === selected.kind && item.id === selected.id) ??
      visibleTreeRows[0]?.item ??
      items[0]
    )
  }, [items, selected, visibleTreeRows])

  const filtersQuery = useQuery({
    queryKey: ["plugin-message-filters", environment?.id, stepForm.messageId],
    enabled: Boolean(environment && stepOpen && stepForm.messageId),
    queryFn: () =>
      listPluginMessageFilters(
        environment as DataverseEnvironment,
        stepForm.messageId,
      ),
  })
  const messageFilters = filtersQuery.data ?? []

  function clearTreeChildren() {
    setExpandedKeys(new Set())
    setLoadingChildKeys(new Set())
    setTypesByAssembly({})
    setStepsByType({})
    setStepsByEndpoint({})
    setImagesByStep({})
  }

  function showError(title: string, error: unknown, fallback: string) {
    const message = formatErrorMessage(error, fallback)
    setErrorDialog({ title, message })
    setLastMessage(message)
  }

  const invalidateSnapshot = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["plugin-registration-snapshot", environment?.id],
    })
  }

  const writeMutation = useMutation({
    mutationFn: async (operation: () => Promise<{ message: string }>) =>
      operation(),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      clearTreeChildren()
      await invalidateSnapshot()
    },
    onError: (error) => {
      showError("Operation failed", error, "Operation failed")
    },
  })

  const inspectMutation = useMutation({
    mutationFn: inspectPluginAssembly,
    onSuccess: (result) => {
      setInspection(result)
      setAssemblyForm(makeAssemblyForm(result, assemblyTarget))
      setSelectedTypeNames(
        result.discoveredTypes
          .filter((type) => type.kind !== "unknown" && !type.isAbstract)
          .map((type) => type.fullName),
      )
      setLastMessage(`Inspected ${result.fileName}`)
    },
    onError: (error) => {
      showError("Inspection failed", error, "Inspection failed")
    },
  })

  const dependenciesMutation = useMutation({
    mutationFn: (item: RegistryItem) =>
      getPluginComponentDependencies(
        environment as DataverseEnvironment,
        item.id,
        componentTypeForItem(item),
      ),
    onSuccess: (report) => {
      setDependencyReport(report)
      setLastMessage("Dependencies loaded")
    },
    onError: (error) => {
      showError("Dependency query failed", error, "Dependency query failed")
    },
  })

  async function loadTreeChildren(item: RegistryItem) {
    if (!environment) {
      return
    }

    const key = registryItemKey(item)
    setLoadingChildKeys((current) => new Set(current).add(key))

    try {
      switch (item.kind) {
        case "assembly": {
          const pluginTypes = await listPluginTypes(environment, item.id)
          setTypesByAssembly((current) => ({
            ...current,
            [item.id]: pluginTypes,
          }))
          break
        }
        case "type": {
          const steps = await listPluginSteps(environment, {
            pluginTypeId: item.id,
          })
          setStepsByType((current) => ({
            ...current,
            [item.id]: steps,
          }))
          break
        }
        case "endpoint": {
          const steps = await listPluginSteps(environment, {
            serviceEndpointId: item.id,
          })
          setStepsByEndpoint((current) => ({
            ...current,
            [item.id]: steps,
          }))
          break
        }
        case "step": {
          const images = await listPluginStepImages(environment, item.id)
          setImagesByStep((current) => ({
            ...current,
            [item.id]: images,
          }))
          break
        }
      }
    } catch (error) {
      showError(
        "Could not load child registrations",
        error,
        "Could not load child registrations",
      )
    } finally {
      setLoadingChildKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  function toggleTreeNode(row: RegistryTreeRow) {
    if (!row.expandable) {
      return
    }

    const nextExpanded = !row.expanded
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (nextExpanded) {
        next.add(row.key)
      } else {
        next.delete(row.key)
      }
      return next
    })

    if (!nextExpanded || row.childCount !== undefined || row.loading) {
      return
    }

    void loadTreeChildren(row.item)
  }

  function openAssemblyDialog(assembly?: PluginAssemblySummary) {
    setAssemblyTarget(assembly)
    setInspection(undefined)
    setSelectedTypeNames(
      assembly
        ? (typesByAssembly[assembly.id] ?? []).map((type) => type.typeName)
        : [],
    )
    setAssemblyForm(makeAssemblyForm(undefined, assembly))
    setAssemblyOpen(true)
  }

  async function chooseAssemblyFile() {
    const localPath = await choosePluginAssemblyFile()
    if (!localPath) {
      return
    }

    setAssemblyForm((current) => ({ ...current, localPath }))
    inspectMutation.mutate(localPath)
  }

  function toggleDiscoveredType(typeName: string) {
    setSelectedTypeNames((current) =>
      current.includes(typeName)
        ? current.filter((item) => item !== typeName)
        : [...current, typeName],
    )
  }

  function submitAssembly(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) {
      return
    }

    const input = {
      ...assemblyForm,
      typeNames: selectedTypeNames,
      description: assemblyForm.description || undefined,
      solutionUniqueName: assemblyForm.solutionUniqueName || undefined,
    }

    writeMutation.mutate(async () => {
      if (assemblyTarget) {
        return updatePluginAssembly(environment, {
          ...input,
          assemblyId: assemblyTarget.id,
        })
      }

      return registerPluginAssembly(environment, input)
    })
    setAssemblyOpen(false)
  }

  function openStepDialog(step?: PluginStepSummary) {
    const nextForm = makeStepForm(formSnapshot, step)
    if (!step && selectedItem?.kind === "type") {
      nextForm.handlerType = "plugintype"
      nextForm.pluginTypeId = selectedItem.id
    }
    if (!step && selectedItem?.kind === "endpoint") {
      nextForm.handlerType = "serviceendpoint"
      nextForm.serviceEndpointId = selectedItem.id
    }
    setStepForm(nextForm)
    setStepOpen(true)
  }

  function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) {
      return
    }

    writeMutation.mutate(() =>
      registerPluginStep(environment, {
        ...stepForm,
        pluginTypeId:
          stepForm.handlerType === "plugintype"
            ? stepForm.pluginTypeId
            : undefined,
        serviceEndpointId:
          stepForm.handlerType === "serviceendpoint"
            ? stepForm.serviceEndpointId
            : undefined,
        messageFilterId:
          stepForm.messageFilterId === "__none__"
            ? undefined
            : stepForm.messageFilterId,
        impersonatingUserId:
          stepForm.impersonatingUserId === "__calling-user__"
            ? undefined
            : stepForm.impersonatingUserId,
        filteringAttributes: stepForm.filteringAttributes || undefined,
        configuration: stepForm.configuration || undefined,
        secureConfiguration: stepForm.secureConfiguration || undefined,
        description: stepForm.description || undefined,
        solutionUniqueName: stepForm.solutionUniqueName || undefined,
      }),
    )
    setStepOpen(false)
  }

  function openImageDialog(image?: PluginStepImageSummary) {
    const nextForm = makeImageForm(formSnapshot, image)
    if (!image && selectedItem?.kind === "step") {
      nextForm.stepId = selectedItem.id
    }
    setImageForm(nextForm)
    setImageOpen(true)
  }

  function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) {
      return
    }

    writeMutation.mutate(() =>
      registerPluginStepImage(environment, {
        ...imageForm,
        attributes: imageForm.attributes || undefined,
        description: imageForm.description || undefined,
        solutionUniqueName: imageForm.solutionUniqueName || undefined,
      }),
    )
    setImageOpen(false)
  }

  function openEndpointDialog(endpoint?: PluginServiceEndpointSummary) {
    setEndpointForm(makeEndpointForm(snapshot, endpoint))
    setEndpointOpen(true)
  }

  function submitEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) {
      return
    }

    writeMutation.mutate(() =>
      registerPluginServiceEndpoint(environment, {
        ...endpointForm,
        url: endpointForm.url || undefined,
        path: endpointForm.path || undefined,
        namespaceAddress: endpointForm.namespaceAddress || undefined,
        authValue: endpointForm.authValue || undefined,
        description: endpointForm.description || undefined,
        solutionUniqueName: endpointForm.solutionUniqueName || undefined,
      }),
    )
    setEndpointOpen(false)
  }

  function guardedAction(item: RegistryItem, action: string) {
    if (!item.editable.canEdit && action !== "dependencies") {
      showError(
        "Component is read-only",
        new Error(item.editable.reasons.join(", ") || "Component is read-only"),
        "Component is read-only",
      )
      return false
    }

    return true
  }

  function toggleSelectedState(item: RegistryItem) {
    if (!environment || !("enabled" in item) || !guardedAction(item, "state")) {
      return
    }

    writeMutation.mutate(() =>
      setPluginStepState(environment, item.id, !item.enabled),
    )
  }

  function deleteSelected(item: RegistryItem) {
    if (!environment) {
      return
    }

    if (!item.editable.canDelete) {
      showError(
        "Component cannot be deleted",
        new Error(
          item.editable.reasons.join(", ") || "Component cannot be deleted",
        ),
        "Component cannot be deleted",
      )
      return
    }

    const confirmed = globalThis.confirm(`Unregister ${item.title}?`)
    if (!confirmed) {
      return
    }

    writeMutation.mutate(() => {
      switch (item.kind) {
        case "assembly":
          return unregisterPluginAssembly(environment, item.id)
        case "type":
          return unregisterPluginType(environment, item.id)
        case "step":
          return unregisterPluginStep(environment, item.id)
        case "image":
          return unregisterPluginStepImage(environment, item.id)
        case "endpoint":
          return unregisterPluginServiceEndpoint(environment, item.id)
        case "package":
          return Promise.reject(
            new Error("Package unregister is not enabled in this build."),
          )
      }
    })
  }

  async function exportSnapshot() {
    if (!environment) {
      return
    }

    const localPath = await choosePluginRegistrationExportFile()
    if (!localPath) {
      return
    }

    writeMutation.mutate(() =>
      exportPluginRegistration(environment, {
        localPath,
        includeManaged: false,
        componentIds: selectedItem ? [selectedItem.id] : [],
      }),
    )
  }

  if (!environment) {
    return (
      <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center">
        <div className="flex flex-col items-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/60">
            <PlugZap className="size-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-medium">Plugin Registration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an environment to manage plug-in assemblies, steps, images,
            and service endpoints.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-l bg-background">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/60">
            <PlugZap className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">Plugin Registration</h2>
            <p className="truncate text-xs text-muted-foreground">
              {environment.name} · assemblies, steps, images, endpoints
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearTreeChildren()
              void snapshotQuery.refetch()
            }}
            disabled={snapshotQuery.isFetching}
          >
            {snapshotQuery.isFetching ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => openAssemblyDialog()}>
            <FileSearch />
            Assembly
          </Button>
          <Button variant="outline" size="sm" onClick={() => openStepDialog()}>
            <PlugZap />
            Step
          </Button>
          <Button variant="outline" size="sm" onClick={() => openImageDialog()}>
            <ImagePlus />
            Image
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEndpointDialog()}>
            <Server />
            Endpoint
          </Button>
          <Button variant="outline" size="icon-sm" onClick={exportSnapshot}>
            <Download />
          </Button>
        </div>
      </header>

      {(snapshotQuery.isLoading || snapshotQuery.isError || snapshot.warnings.length > 0) && (
        <div className="space-y-2 border-b px-4 py-3">
          {snapshotQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading plugin registrations
            </div>
          )}
          {snapshotQuery.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {formatErrorMessage(
                  snapshotQuery.error,
                  "Plugin registrations could not be loaded.",
                )}
              </span>
            </div>
          )}
          {snapshot.warnings.length > 0 && (
            <div className="grid gap-1 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
              {snapshot.warnings.map((warning) => (
                <div key={warning} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-b lg:border-r lg:border-b-0">
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Search loaded nodes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={kindFilter}
              onValueChange={(value) =>
                setKindFilter(value as RegistryKind | "all")
              }
            >
              <SelectTrigger className="h-8 w-full bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All components</SelectItem>
                <SelectItem value="package">Packages</SelectItem>
                <SelectItem value="assembly">Assemblies</SelectItem>
                <SelectItem value="type">Types</SelectItem>
                <SelectItem value="step">Steps</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="endpoint">Endpoints</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{visibleTreeRows.length} visible nodes</span>
              {writeMutation.isPending && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Saving
                </span>
              )}
            </div>
          </div>

          <ScrollArea className="min-h-0">
            <div className="grid gap-1 p-2" role="tree">
              {visibleTreeRows.map((row) => (
                <div
                  key={row.key}
                  className={cn(
                    "flex min-w-0 items-stretch rounded-md border border-transparent transition-colors",
                    selectedItem?.id === row.item.id &&
                      selectedItem.kind === row.item.kind &&
                      "border-border bg-primary/5",
                  )}
                  role="treeitem"
                  aria-expanded={row.expandable ? row.expanded : undefined}
                  aria-level={row.depth + 1}
                  style={{ paddingLeft: `${row.depth * 18}px` }}
                >
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    onClick={() => toggleTreeNode(row)}
                    disabled={!row.expandable}
                    aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.item.title}`}
                    title={row.expandable ? "Expand or collapse" : undefined}
                  >
                    {row.loading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : row.expandable ? (
                      row.expanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )
                    ) : (
                      <span className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                    onClick={() => {
                      setSelected({ kind: row.item.kind, id: row.item.id })
                      setDependencyReport(undefined)
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <KindIcon kind={row.item.kind} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.item.title}
                      </span>
                      <StateBadge item={row.item} />
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 pl-6 text-xs text-muted-foreground">
                      <span className="shrink-0">{kindLabel(row.item.kind)}</span>
                      <span className="min-w-0 truncate">{row.item.subtitle}</span>
                      {row.childCount !== undefined && row.expandable && (
                        <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground">
                          {row.childCount}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              ))}
              {visibleTreeRows.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-4 py-8 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                    <Search className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium">No matches</p>
                  <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                    No loaded registrations match the current filter.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <div className="border-b p-4">
            {selectedItem ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/60">
                      <KindIcon kind={selectedItem.kind} className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {selectedItem.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {selectedItem.subtitle}
                      </div>
                    </div>
                  </div>
                  <StateBadge item={selectedItem} />
                </div>
                {selectedItem.editable.reasons.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{selectedItem.editable.reasons.join(", ")}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedItem.kind === "assembly" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openAssemblyDialog(
                          selectedItem.data as PluginAssemblySummary,
                        )
                      }
                    >
                      <Archive />
                      Update
                    </Button>
                  )}
                  {selectedItem.kind === "step" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openStepDialog(selectedItem.data as PluginStepSummary)
                      }
                    >
                      <PlugZap />
                      Edit
                    </Button>
                  )}
                  {selectedItem.kind === "image" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openImageDialog(
                          selectedItem.data as PluginStepImageSummary,
                        )
                      }
                    >
                      <ImagePlus />
                      Edit
                    </Button>
                  )}
                  {selectedItem.kind === "endpoint" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openEndpointDialog(
                          selectedItem.data as PluginServiceEndpointSummary,
                        )
                      }
                    >
                      <Server />
                      Edit
                    </Button>
                  )}
                  {"enabled" in selectedItem && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSelectedState(selectedItem)}
                    >
                      <ShieldCheck />
                      {selectedItem.enabled ? "Disable" : "Enable"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dependenciesMutation.mutate(selectedItem)}
                    disabled={dependenciesMutation.isPending}
                  >
                    {dependenciesMutation.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Layers />
                    )}
                    Dependencies
                  </Button>
                  {selectedItem.kind !== "package" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteSelected(selectedItem)}
                    >
                      <Trash2 />
                      Unregister
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                  <PlugZap className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">No registration selected</p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                  Select a component from the list to view details, edit, or unregister it.
                </p>
              </div>
            )}
          </div>
          <ScrollArea className="min-h-0">
            <div className="p-4">
              {selectedItem && (
                <Tabs defaultValue="details">
                  <TabsList variant="line" className="w-full justify-start">
                    <TabsTrigger value="details" className="flex-none px-2">
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="dependencies" className="flex-none px-2">
                      Dependencies
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="pt-3">
                    <dl className="rounded-lg border px-3 text-xs">
                      <DetailRow label="Id" value={selectedItem.id} />
                      <DetailRow label="Kind" value={selectedItem.kind} />
                      <DetailRow label="Managed" value={selectedItem.managed} />
                      {"version" in selectedItem.data && (
                        <DetailRow
                          label="Version"
                          value={selectedItem.data.version}
                        />
                      )}
                      {"description" in selectedItem.data && (
                        <DetailRow
                          label="Description"
                          value={selectedItem.data.description}
                        />
                      )}
                      {"createdOn" in selectedItem.data && (
                        <DetailRow
                          label="Created"
                          value={formatDate(selectedItem.data.createdOn)}
                        />
                      )}
                      {"modifiedOn" in selectedItem.data && (
                        <DetailRow
                          label="Modified"
                          value={formatDate(selectedItem.data.modifiedOn)}
                        />
                      )}
                      {selectedItem.kind === "assembly" && (
                        <>
                          <DetailRow
                            label="Isolation"
                            value={
                              (selectedItem.data as PluginAssemblySummary)
                                .isolationModeLabel
                            }
                          />
                          <DetailRow
                            label="Source"
                            value={
                              (selectedItem.data as PluginAssemblySummary)
                                .sourceTypeLabel
                            }
                          />
                          <DetailRow
                            label="Public key"
                            value={
                              (selectedItem.data as PluginAssemblySummary)
                                .publicKeyToken
                            }
                          />
                          <DetailRow
                            label="Size"
                            value={formatBytes(
                              (selectedItem.data as PluginAssemblySummary)
                                .sizeBytes,
                            )}
                          />
                        </>
                      )}
                      {selectedItem.kind === "step" && (
                        <>
                          <DetailRow
                            label="Message"
                            value={(selectedItem.data as PluginStepSummary).messageName}
                          />
                          <DetailRow
                            label="Entity"
                            value={
                              (selectedItem.data as PluginStepSummary)
                                .primaryEntity
                            }
                          />
                          <DetailRow
                            label="Stage"
                            value={(selectedItem.data as PluginStepSummary).stageLabel}
                          />
                          <DetailRow
                            label="Mode"
                            value={(selectedItem.data as PluginStepSummary).modeLabel}
                          />
                          <DetailRow
                            label="Rank"
                            value={(selectedItem.data as PluginStepSummary).rank}
                          />
                          <DetailRow
                            label="Secure config"
                            value={
                              (selectedItem.data as PluginStepSummary)
                                .hasSecureConfig
                            }
                          />
                        </>
                      )}
                      {selectedItem.kind === "image" && (
                        <>
                          <DetailRow
                            label="Type"
                            value={
                              (selectedItem.data as PluginStepImageSummary)
                                .imageTypeLabel
                            }
                          />
                          <DetailRow
                            label="Alias"
                            value={
                              (selectedItem.data as PluginStepImageSummary)
                                .entityAlias
                            }
                          />
                          <DetailRow
                            label="Attributes"
                            value={
                              (selectedItem.data as PluginStepImageSummary)
                                .attributes
                            }
                          />
                        </>
                      )}
                      {selectedItem.kind === "endpoint" && (
                        <>
                          <DetailRow
                            label="Contract"
                            value={
                              (selectedItem.data as PluginServiceEndpointSummary)
                                .contractLabel
                            }
                          />
                          <DetailRow
                            label="Auth"
                            value={
                              (selectedItem.data as PluginServiceEndpointSummary)
                                .authTypeLabel
                            }
                          />
                          <DetailRow
                            label="Url"
                            value={
                              (selectedItem.data as PluginServiceEndpointSummary)
                                .url
                            }
                          />
                        </>
                      )}
                    </dl>
                  </TabsContent>
                  <TabsContent value="dependencies" className="pt-3">
                    <DependenciesPanel report={dependencyReport} />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>

      <Dialog
        open={Boolean(errorDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setErrorDialog(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              {errorDialog?.title ?? "Plugin Registration error"}
            </DialogTitle>
            <DialogDescription>
              The operation did not complete. Review the details below before
              retrying.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-[11px] break-words whitespace-pre-wrap text-destructive">
            {errorDialog?.message}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog open={assemblyOpen} onOpenChange={setAssemblyOpen}>
        <DialogContent className="sm:max-w-3xl">
          <form onSubmit={submitAssembly} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {assemblyTarget ? "Update Assembly" : "Register Assembly"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Register or update a Dataverse plug-in assembly.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input value={assemblyForm.localPath} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={chooseAssemblyFile}
                disabled={inspectMutation.isPending}
              >
                {inspectMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FileSearch />
                )}
                Inspect
              </Button>
            </div>

            {inspection?.warnings.length ? (
              <div className="grid gap-1 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
                {inspection.warnings.map((warning) => (
                  <div key={warning} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="plugin-assembly-name">Name</Label>
                <Input
                  id="plugin-assembly-name"
                  value={assemblyForm.name}
                  onChange={(event) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-assembly-version">Version</Label>
                <Input
                  id="plugin-assembly-version"
                  value={assemblyForm.version}
                  onChange={(event) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      version: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Isolation</Label>
                <Select
                  value={String(assemblyForm.isolationMode)}
                  onValueChange={(value) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      isolationMode: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.isolationModeOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filtersQuery.isError && (
                  <p className="text-xs text-destructive">
                    {formatErrorMessage(
                      filtersQuery.error,
                      "Message filters could not be loaded.",
                    )}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Source</Label>
                <Select
                  value={String(assemblyForm.sourceType)}
                  onValueChange={(value) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      sourceType: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.sourceTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-assembly-culture">Culture</Label>
                <Input
                  id="plugin-assembly-culture"
                  value={assemblyForm.culture}
                  onChange={(event) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      culture: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-assembly-token">Public Key Token</Label>
                <Input
                  id="plugin-assembly-token"
                  value={assemblyForm.publicKeyToken}
                  onChange={(event) =>
                    setAssemblyForm((current) => ({
                      ...current,
                      publicKeyToken: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-assembly-description">Description</Label>
              <Input
                id="plugin-assembly-description"
                value={assemblyForm.description}
                onChange={(event) =>
                  setAssemblyForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Types</Label>
              <div className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-2">
                {(inspection?.discoveredTypes ?? []).length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Inspect an assembly to select registerable types.
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {inspection?.discoveredTypes.map((type) => (
                      <button
                        key={type.fullName}
                        type="button"
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                          selectedTypeNames.includes(type.fullName)
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-muted/60",
                        )}
                        onClick={() => toggleDiscoveredType(type.fullName)}
                      >
                        <span className="flex size-4 items-center justify-center rounded border border-border bg-background">
                          {selectedTypeNames.includes(type.fullName) && (
                            <Check className="size-3 text-primary" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {type.fullName}
                        </span>
                        <Badge variant="outline">{type.kind}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={writeMutation.isPending}>
                {assemblyTarget ? "Update" : "Register"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stepOpen} onOpenChange={setStepOpen}>
        <DialogContent className="sm:max-w-3xl">
          <form onSubmit={submitStep} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{stepForm.stepId ? "Edit Step" : "Register Step"}</DialogTitle>
              <DialogDescription className="sr-only">
                Register or edit a Dataverse processing step.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="plugin-step-name">Name</Label>
                <Input
                  id="plugin-step-name"
                  value={stepForm.name}
                  onChange={(event) =>
                    setStepForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Handler</Label>
                <Select
                  value={stepForm.handlerType}
                  onValueChange={(value) =>
                    setStepForm((current) => ({
                      ...current,
                      handlerType: value as StepForm["handlerType"],
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plugintype">Plug-in Type</SelectItem>
                    <SelectItem value="serviceendpoint">Service Endpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {stepForm.handlerType === "plugintype" ? (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Plug-in Type</Label>
                  <Select
                    value={stepForm.pluginTypeId}
                    onValueChange={(value) =>
                      setStepForm((current) => ({ ...current, pluginTypeId: value }))
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {formSnapshot.types.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.friendlyName || type.typeName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Service Endpoint</Label>
                  <Select
                    value={stepForm.serviceEndpointId}
                    onValueChange={(value) =>
                      setStepForm((current) => ({
                        ...current,
                        serviceEndpointId: value,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select endpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshot.endpoints.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Message</Label>
                <Select
                  value={stepForm.messageId}
                  onValueChange={(value) =>
                    setStepForm((current) => ({
                      ...current,
                      messageId: value,
                      messageFilterId: "__none__",
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select message" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.messages.map((message) => (
                      <SelectItem key={message.id} value={message.id}>
                        {message.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Entity</Label>
                <Select
                  value={stepForm.messageFilterId}
                  onValueChange={(value) =>
                    setStepForm((current) => ({
                      ...current,
                      messageFilterId: value,
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Global" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Global</SelectItem>
                    {messageFilters.map((filter: PluginMessageFilterSummary) => (
                      <SelectItem key={filter.id} value={filter.id}>
                        {filter.primaryEntity ?? "global"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select
                  value={String(stepForm.stage)}
                  onValueChange={(value) =>
                    setStepForm((current) => ({ ...current, stage: Number(value) }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.stageOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Mode</Label>
                <Select
                  value={String(stepForm.mode)}
                  onValueChange={(value) =>
                    setStepForm((current) => ({ ...current, mode: Number(value) }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.modeOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-step-rank">Rank</Label>
                <Input
                  id="plugin-step-rank"
                  type="number"
                  min={1}
                  value={stepForm.rank}
                  onChange={(event) =>
                    setStepForm((current) => ({
                      ...current,
                      rank: Number(event.target.value),
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Run As</Label>
                <Select
                  value={stepForm.impersonatingUserId}
                  onValueChange={(value) =>
                    setStepForm((current) => ({
                      ...current,
                      impersonatingUserId: value,
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__calling-user__">Calling User</SelectItem>
                    {snapshot.users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="plugin-step-filtering">Filtering Attributes</Label>
                <Input
                  id="plugin-step-filtering"
                  value={stepForm.filteringAttributes}
                  onChange={(event) =>
                    setStepForm((current) => ({
                      ...current,
                      filteringAttributes: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-step-config">Unsecure Configuration</Label>
                <textarea
                  id="plugin-step-config"
                  className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={stepForm.configuration}
                  onChange={(event) =>
                    setStepForm((current) => ({
                      ...current,
                      configuration: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-step-secure-config">Secure Configuration</Label>
                <textarea
                  id="plugin-step-secure-config"
                  className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={stepForm.secureConfiguration}
                  onChange={(event) =>
                    setStepForm((current) => ({
                      ...current,
                      secureConfiguration: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={writeMutation.isPending}>
                Save Step
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submitImage} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{imageForm.imageId ? "Edit Image" : "Register Image"}</DialogTitle>
              <DialogDescription className="sr-only">
                Register or edit a processing step image.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Step</Label>
                <Select
                  value={imageForm.stepId}
                  onValueChange={(value) =>
                    setImageForm((current) => ({ ...current, stepId: value }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {formSnapshot.steps.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-image-name">Name</Label>
                <Input
                  id="plugin-image-name"
                  value={imageForm.name}
                  onChange={(event) =>
                    setImageForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-image-alias">Alias</Label>
                <Input
                  id="plugin-image-alias"
                  value={imageForm.entityAlias}
                  onChange={(event) =>
                    setImageForm((current) => ({
                      ...current,
                      entityAlias: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={String(imageForm.imageType)}
                  onValueChange={(value) =>
                    setImageForm((current) => ({
                      ...current,
                      imageType: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.imageTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-image-property">Message Property</Label>
                <Input
                  id="plugin-image-property"
                  value={imageForm.messagePropertyName}
                  onChange={(event) =>
                    setImageForm((current) => ({
                      ...current,
                      messagePropertyName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="plugin-image-attributes">Attributes</Label>
                <Input
                  id="plugin-image-attributes"
                  value={imageForm.attributes}
                  onChange={(event) =>
                    setImageForm((current) => ({
                      ...current,
                      attributes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={writeMutation.isPending}>
                Save Image
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={endpointOpen} onOpenChange={setEndpointOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submitEndpoint} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {endpointForm.endpointId ? "Edit Endpoint" : "Register Endpoint"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Register or edit a service endpoint or webhook.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="plugin-endpoint-name">Name</Label>
                <Input
                  id="plugin-endpoint-name"
                  value={endpointForm.name}
                  onChange={(event) =>
                    setEndpointForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Contract</Label>
                <Select
                  value={String(endpointForm.contract)}
                  onValueChange={(value) =>
                    setEndpointForm((current) => ({
                      ...current,
                      contract: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.endpointContractOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Auth</Label>
                <Select
                  value={String(endpointForm.authType)}
                  onValueChange={(value) =>
                    setEndpointForm((current) => ({
                      ...current,
                      authType: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.endpointAuthTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="plugin-endpoint-url">Url</Label>
                <Input
                  id="plugin-endpoint-url"
                  value={endpointForm.url}
                  onChange={(event) =>
                    setEndpointForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-endpoint-path">Path</Label>
                <Input
                  id="plugin-endpoint-path"
                  value={endpointForm.path}
                  onChange={(event) =>
                    setEndpointForm((current) => ({
                      ...current,
                      path: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plugin-endpoint-auth-value">Auth Value</Label>
                <Input
                  id="plugin-endpoint-auth-value"
                  type="password"
                  value={endpointForm.authValue}
                  onChange={(event) =>
                    setEndpointForm((current) => ({
                      ...current,
                      authValue: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={writeMutation.isPending}>
                Save Endpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
