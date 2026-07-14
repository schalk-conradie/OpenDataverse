import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  FileCode2,
  FilePlus2,
  Layers,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react"

import { formatErrorMessage } from "@/core/errors"
import {
  getEnvironmentById,
  type DataverseEnvironment,
  type SolutionComponentSummary,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { useWorkspaceStore } from "@/store/workspace-store"
import { cn } from "@/lib/utils"
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
import {
  getSolutionComponentDependencies,
  getSolutionComponentLayers,
  listSolutionComponents,
  listSolutions,
  removeSolutionComponentFromSolution,
  type SolutionManagedFilter,
} from "@/modules/solution-explorer/gateway"
import {
  filterSolutionComponents,
  filterSolutions,
  formatSolutionDate,
  groupSolutionComponents,
} from "@/modules/solution-explorer/solution-model"
import { AddExistingWebResourceDialog } from "./AddExistingWebResourceDialog"
import { CreateWebResourceDialog } from "./CreateWebResourceDialog"
import { ImportWebResourcesDialog } from "./ImportWebResourcesDialog"
import { SolutionInspectorPanel } from "./SolutionInspectorPanel"

type ManagedFilter = SolutionManagedFilter

export function SolutionExplorerModule({ window }: { window: ToolWindow }) {
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const queryClient = useQueryClient()
  const [solutionSearch, setSolutionSearch] = useState("")
  const [managedFilter, setManagedFilter] = useState<ManagedFilter>("unmanaged")
  const [componentSearch, setComponentSearch] = useState("")
  const [selectedSolutionId, setSelectedSolutionId] = useState("")
  const [selectedComponentId, setSelectedComponentId] = useState("")
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<SolutionComponentSummary>()

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
    () => filterSolutions(solutions, solutionSearch, managedFilter),
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
    () => filterSolutionComponents(components, componentSearch),
    [components, componentSearch],
  )
  const componentGroups = useMemo(
    () => groupSolutionComponents(filteredComponents),
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

  const removeComponentMutation = useMutation({
    mutationFn: (component: SolutionComponentSummary) =>
      removeSolutionComponentFromSolution(
        environment as DataverseEnvironment,
        selectedSolution?.uniqueName ?? "",
        component,
      ),
    onSuccess: async (result, component) => {
      setLastMessage(result.message)
      if (selectedComponentId === component.id) {
        setSelectedComponentId("")
      }
      setRemoveTarget(undefined)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment?.id, selectedSolution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment?.id],
        }),
      ])
    },
    onError: (error) => {
      showError("Remove from Solution failed", error, "Remove failed")
    },
  })

  if (!environment) {
    return (
      <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center text-sm text-muted-foreground">
        Select an environment before opening this tool.
      </section>
    )
  }

  const canWriteWebResources = Boolean(selectedSolution && !selectedSolution.isManaged)
  const canRemoveComponents = canWriteWebResources
  const dependencies = dependenciesQuery.data
  const layers = layersQuery.data ?? []

  function renderInspectorPanel() {
    return (
      <SolutionInspectorPanel
        selectedComponent={selectedComponent}
        dependencies={dependencies}
        dependenciesLoading={dependenciesQuery.isLoading}
        dependenciesError={dependenciesQuery.error}
        layers={layers}
        layersLoading={layersQuery.isLoading}
        layersError={layersQuery.error}
        onOpenRecord={() => setLastMessage("Opening Dataverse record")}
      />
    )
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-cols-[15rem_minmax(0,1fr)] overflow-hidden border-l bg-background min-[1450px]:grid-cols-[17rem_minmax(0,1fr)] min-[1780px]:grid-cols-[17rem_minmax(0,1fr)_23rem]">
      <aside className="min-h-0 min-w-0 border-r bg-muted/20">
        <div className="space-y-3 border-b bg-background p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <FileCode2 className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-medium">Solutions</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {environment.name}
              </p>
            </div>
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
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading solutions
            </div>
          ) : solutionsQuery.isError ? (
            <div className="flex h-40 items-center justify-center gap-2 p-4 text-center text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {formatErrorMessage(
                solutionsQuery.error,
                "Could not load solutions.",
              )}
            </div>
          ) : filteredSolutions.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
              <FileCode2 className="size-5 text-muted-foreground/50" />
              No solutions found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredSolutions.map((solution) => (
                <button
                  key={solution.id}
                  type="button"
                  className={cn(
                    "w-full px-3 py-3 text-left transition-colors hover:bg-muted/60",
                    solution.id === effectiveSelectedSolutionId && "bg-background",
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
                    <Badge
                      variant={solution.isManaged ? "secondary" : "outline"}
                      className="text-[11px] font-normal"
                    >
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

      <main className="min-h-0 min-w-0 overflow-hidden border-r bg-background">
        <div className="space-y-3 border-b p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-medium">
                  {selectedSolution?.friendlyName ?? "No solution"}
                </h2>
                {selectedSolution && (
                  <Badge
                    variant={selectedSolution.isManaged ? "secondary" : "outline"}
                    className="text-[11px] font-normal"
                  >
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

            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-[1780px]:hidden"
                disabled={!selectedComponent}
                onClick={() => setInspectorOpen(true)}
              >
                <Network className="size-4" />
                Inspector
              </Button>
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

        <div className="h-[calc(100%-8.75rem)] min-w-0 overflow-auto">
          {componentsQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading components
            </div>
          ) : componentsQuery.isError ? (
            <div className="flex h-64 items-center justify-center gap-2 p-4 text-center text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {formatErrorMessage(
                componentsQuery.error,
                "Could not load solution components.",
              )}
            </div>
          ) : !selectedSolution ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Layers className="size-5 text-muted-foreground/50" />
              Select a solution to view its components.
            </div>
          ) : componentGroups.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Search className="size-5 text-muted-foreground/50" />
              No components found.
            </div>
          ) : (
            <div className="min-w-[42rem] p-3">
              <Table className="min-w-[42rem] table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[48%]">Name</TableHead>
                    <TableHead className="w-[22%]">Type</TableHead>
                    <TableHead className="w-[12%]">Managed</TableHead>
                    <TableHead className="w-[18%]">Modified</TableHead>
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
                      <ContextMenu key={component.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow
                            data-state={
                              component.id === effectiveSelectedComponentId
                                ? "selected"
                                : undefined
                            }
                            className="cursor-pointer"
                            onClick={() => setSelectedComponentId(component.id)}
                          >
                            <TableCell className="min-w-0 whitespace-normal align-top">
                              <div className="break-all font-medium">
                                {component.displayName}
                              </div>
                              <div className="break-all font-mono text-[11px] text-muted-foreground">
                                {component.logicalName ??
                                  component.schemaName ??
                                  component.objectId}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-normal break-words align-top">
                              {component.componentTypeLabel}
                            </TableCell>
                            <TableCell className="whitespace-normal align-top">
                              {component.isManaged === undefined ? (
                                <span className="text-muted-foreground">Unknown</span>
                              ) : component.isManaged ? (
                                "Yes"
                              ) : (
                                "No"
                              )}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words align-top">
                              {formatSolutionDate(component.modifiedOn)}
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            disabled={!canRemoveComponents}
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              setSelectedComponentId(component.id)
                              setRemoveTarget(component)
                            }}
                          >
                            <Trash2 className="size-4" />
                            Remove from Solution
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )),
                  ])}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      <aside className="hidden min-h-0 min-w-0 overflow-hidden min-[1780px]:block">
        {renderInspectorPanel()}
      </aside>

      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent className="top-0 right-0 bottom-0 left-auto h-full w-[min(28rem,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-none min-[1780px]:hidden">
          {renderInspectorPanel()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(undefined)
            removeComponentMutation.reset()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from Solution</DialogTitle>
            <DialogDescription>
              {selectedSolution?.friendlyName ?? "Selected solution"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              Remove{" "}
              <span className="font-medium">
                {removeTarget?.displayName ?? "this component"}
              </span>{" "}
              from {selectedSolution?.uniqueName ?? "the solution"}?
            </p>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              This removes the component from the unmanaged solution. It does
              not delete the underlying component from Dataverse.
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRemoveTarget(undefined)
                removeComponentMutation.reset()
              }}
              disabled={removeComponentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              disabled={!removeTarget || removeComponentMutation.isPending}
              onClick={() => {
                if (removeTarget) {
                  removeComponentMutation.mutate(removeTarget)
                }
              }}
            >
              {removeComponentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
