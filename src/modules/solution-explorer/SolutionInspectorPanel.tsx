import { Fragment } from "react"
import {
  AlertTriangle,
  ExternalLink,
  Layers,
  Loader2,
  Network,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import type {
  SolutionComponentSummary,
  SolutionDependencyReport,
  SolutionLayer,
} from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { cn } from "@/lib/utils"

import {
  buildDependencySections,
  buildSolutionLayerRows,
  formatSolutionDate,
  type SolutionDependencyRow,
  type SolutionLayerRow,
} from "./solution-model"

type SolutionInspectorPanelProps = {
  selectedComponent?: SolutionComponentSummary
  dependencies?: SolutionDependencyReport
  dependenciesLoading: boolean
  dependenciesError?: unknown
  layers: readonly SolutionLayer[]
  layersLoading: boolean
  layersError?: unknown
  onOpenRecord: () => void
  className?: string
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

function DependencyTable({
  title,
  rows,
  empty,
}: {
  title: string
  rows: readonly SolutionDependencyRow[]
  empty: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">{title}</h3>
        <Badge variant="outline" className="text-[11px] font-normal">
          {rows.length}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border py-5 text-xs text-muted-foreground">
          <Network className="size-4 text-muted-foreground/50" />
          {empty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dependent</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.dependentTypeLabel}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {row.dependentObjectId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.requiredTypeLabel}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {row.requiredObjectId}
                    </div>
                  </TableCell>
                  <TableCell>{row.dependencyTypeLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function LayersTable({ rows }: { rows: readonly SolutionLayerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border py-5 text-xs text-muted-foreground">
        <Layers className="size-4 text-muted-foreground/50" />
        No layers returned for this component.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
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
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.order}</TableCell>
              <TableCell>
                <div className="font-medium">{row.solutionName}</div>
                <div className="text-muted-foreground">{row.componentName}</div>
              </TableCell>
              <TableCell>{row.publisherName}</TableCell>
              <TableCell>{row.changed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SolutionInspectorPanel({
  selectedComponent,
  dependencies,
  dependenciesLoading,
  dependenciesError,
  layers,
  layersLoading,
  layersError,
  onOpenRecord,
  className,
}: SolutionInspectorPanelProps) {
  const dependencySections = buildDependencySections(dependencies)
  const layerRows = buildSolutionLayerRows(layers)

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-muted/20",
        className,
      )}
    >
      <div className="border-b bg-background p-3 pr-10">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
            <Network className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Inspector</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedComponent?.displayName ?? "No component selected"}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="details" className="min-h-0 gap-0 overflow-hidden">
        <TabsList variant="line" className="mx-3 mt-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="min-h-0 overflow-hidden p-3">
          {!selectedComponent ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Network className="size-5 text-muted-foreground/50" />
              Select a component to inspect its details.
            </div>
          ) : (
            <ScrollArea className="h-full">
              <dl className="overflow-hidden rounded-lg border bg-background">
                <DetailRow label="Name" value={selectedComponent.displayName} />
                <DetailRow
                  label="Type"
                  value={selectedComponent.componentTypeLabel}
                />
                <DetailRow label="Group" value={selectedComponent.group} />
                <DetailRow label="Component ID" value={selectedComponent.id} />
                <DetailRow label="Object ID" value={selectedComponent.objectId} />
                <DetailRow
                  label="Logical Name"
                  value={selectedComponent.logicalName}
                />
                <DetailRow
                  label="Schema Name"
                  value={selectedComponent.schemaName}
                />
                <DetailRow
                  label="Managed"
                  value={
                    selectedComponent.isManaged === undefined
                      ? undefined
                      : selectedComponent.isManaged
                  }
                />
                <DetailRow
                  label="Created"
                  value={formatSolutionDate(selectedComponent.createdOn)}
                />
                <DetailRow
                  label="Modified"
                  value={formatSolutionDate(selectedComponent.modifiedOn)}
                />
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
                  onClick={onOpenRecord}
                >
                  <ExternalLink className="size-3.5" />
                  Open record
                </a>
              )}
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent
          value="dependencies"
          className="min-h-0 overflow-hidden p-3"
        >
          <ScrollArea className="h-full">
            {!selectedComponent ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Network className="size-5 text-muted-foreground/50" />
                Select a component to view its dependencies.
              </div>
            ) : dependenciesLoading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading dependencies
              </div>
            ) : dependenciesError ? (
              <div className="flex h-64 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {formatErrorMessage(
                  dependenciesError,
                  "Could not load dependencies.",
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {dependencySections.map((section, index) => (
                  <Fragment key={section.key}>
                    <DependencyTable
                      title={section.title}
                      rows={section.rows}
                      empty={section.empty}
                    />
                    {index < dependencySections.length - 1 && <Separator />}
                  </Fragment>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="layers" className="min-h-0 overflow-hidden p-3">
          <ScrollArea className="h-full">
            {!selectedComponent ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Layers className="size-5 text-muted-foreground/50" />
                Select a component to view its layers.
              </div>
            ) : layersLoading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading layers
              </div>
            ) : layersError ? (
              <div className="flex h-64 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
                <Layers className="size-4 shrink-0" />
                {formatErrorMessage(layersError, "Could not load layers.")}
              </div>
            ) : (
              <LayersTable rows={layerRows} />
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
