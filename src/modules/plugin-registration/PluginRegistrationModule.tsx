import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileSearch,
  ImagePlus,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  Server,
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
} from "@/modules/plugin-registration/gateway"
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
  type PluginRegistrationSnapshot,
  type PluginServiceEndpointSummary,
  type PluginStepImageSummary,
  type PluginStepSummary,
  type PluginTypeSummary,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"
import {
  buildTreeRows,
  componentTypeForItem,
  editabilityReasonLabel,
  filterRegistryRows,
  kindLabel,
  registryItemKey,
  registryItems,
  type RegistryItem,
  type RegistryKind,
  type RegistryTreeRow,
} from "./registry-model"
import {
  makeAssemblyForm,
  makeEndpointForm,
  makeImageForm,
  makeStepForm,
  type AssemblyForm,
  type EndpointForm,
  type ImageForm,
  type StepForm,
} from "./registration-forms"
import { AssemblyRegistrationDialog } from "./AssemblyRegistrationDialog"
import { EndpointRegistrationDialog } from "./EndpointRegistrationDialog"
import { ImageRegistrationDialog } from "./ImageRegistrationDialog"
import { PluginRegistrationDetails } from "./PluginRegistrationDetails"
import {
  PluginRegistrationErrorDialog,
  type PluginRegistrationError,
} from "./PluginRegistrationErrorDialog"
import {
  RegistryKindIcon,
  RegistryStateBadge,
} from "./RegistryItemPresentation"
import { StepRegistrationDialog } from "./StepRegistrationDialog"

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
  const [errorDialog, setErrorDialog] = useState<PluginRegistrationError>()

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
    () => filterRegistryRows(treeRows, kindFilter, search),
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
        new Error(
          editabilityReasonLabel(item.editable) || "Component is read-only",
        ),
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
          editabilityReasonLabel(item.editable) ||
            "Component cannot be deleted",
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
                      <RegistryKindIcon
                        kind={row.item.kind}
                        className="text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.item.title}
                      </span>
                      <RegistryStateBadge item={row.item} />
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

        <PluginRegistrationDetails
          item={selectedItem}
          dependencyReport={dependencyReport}
          dependenciesPending={dependenciesMutation.isPending}
          onEditAssembly={openAssemblyDialog}
          onEditStep={openStepDialog}
          onEditImage={openImageDialog}
          onEditEndpoint={openEndpointDialog}
          onToggleState={toggleSelectedState}
          onLoadDependencies={(item) => dependenciesMutation.mutate(item)}
          onUnregister={deleteSelected}
        />
      </div>

      <PluginRegistrationErrorDialog
        error={errorDialog}
        onClose={() => setErrorDialog(undefined)}
      />

      <AssemblyRegistrationDialog
        open={assemblyOpen}
        target={assemblyTarget}
        form={assemblyForm}
        setForm={setAssemblyForm}
        inspection={inspection}
        selectedTypeNames={selectedTypeNames}
        snapshot={snapshot}
        messageFilterError={filtersQuery.isError ? filtersQuery.error : null}
        inspecting={inspectMutation.isPending}
        saving={writeMutation.isPending}
        onOpenChange={setAssemblyOpen}
        onChooseFile={() => void chooseAssemblyFile()}
        onToggleType={toggleDiscoveredType}
        onSubmit={submitAssembly}
      />

      <StepRegistrationDialog
        open={stepOpen}
        environment={environment as DataverseEnvironment}
        form={stepForm}
        setForm={setStepForm}
        snapshot={formSnapshot}
        messageFilters={messageFilters}
        saving={writeMutation.isPending}
        onOpenChange={setStepOpen}
        onSubmit={submitStep}
      />

      <ImageRegistrationDialog
        open={imageOpen}
        form={imageForm}
        setForm={setImageForm}
        snapshot={formSnapshot}
        saving={writeMutation.isPending}
        onOpenChange={setImageOpen}
        onSubmit={submitImage}
      />

      <EndpointRegistrationDialog
        open={endpointOpen}
        form={endpointForm}
        setForm={setEndpointForm}
        snapshot={snapshot}
        saving={writeMutation.isPending}
        onOpenChange={setEndpointOpen}
        onSubmit={submitEndpoint}
      />
    </section>
  )
}
