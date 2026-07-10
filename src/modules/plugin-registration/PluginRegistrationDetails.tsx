import type { ReactElement } from "react"
import {
  AlertTriangle,
  Archive,
  Check,
  ImagePlus,
  Layers,
  Loader2,
  PlugZap,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import type {
  PluginAssemblySummary,
  PluginDependencyReport,
  PluginServiceEndpointSummary,
  PluginStepImageSummary,
  PluginStepSummary,
} from "@/core/dataverse/schemas"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import {
  editabilityReasonLabel,
  formatBytes,
  formatDate,
  stepStateActionLabel,
  type RegistryItem,
} from "./registry-model"
import {
  RegistryKindIcon,
  RegistryStateBadge,
} from "./RegistryItemPresentation"

type PluginRegistrationDetailsProps = {
  item?: RegistryItem
  dependencyReport?: PluginDependencyReport
  dependenciesPending: boolean
  onEditAssembly: (assembly: PluginAssemblySummary) => void
  onEditStep: (step: PluginStepSummary) => void
  onEditImage: (image: PluginStepImageSummary) => void
  onEditEndpoint: (endpoint: PluginServiceEndpointSummary) => void
  onToggleState: (item: RegistryItem) => void
  onLoadDependencies: (item: RegistryItem) => void
  onUnregister: (item: RegistryItem) => void
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value?: string | number | boolean
}): ReactElement {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b py-2.5 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[11px] text-foreground">
        {value === undefined || value === "" ? "Unknown" : String(value)}
      </dd>
    </div>
  )
}

function DependenciesPanel({
  report,
}: {
  report?: PluginDependencyReport
}): ReactElement {
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

function RegistrationDetails({ item }: { item: RegistryItem }): ReactElement {
  return (
    <dl className="rounded-lg border px-3 text-xs">
      <DetailRow label="Id" value={item.id} />
      <DetailRow label="Kind" value={item.kind} />
      <DetailRow label="Managed" value={item.managed} />
      {"version" in item.data && (
        <DetailRow label="Version" value={item.data.version} />
      )}
      {"description" in item.data && (
        <DetailRow label="Description" value={item.data.description} />
      )}
      {"createdOn" in item.data && (
        <DetailRow label="Created" value={formatDate(item.data.createdOn)} />
      )}
      {"modifiedOn" in item.data && (
        <DetailRow label="Modified" value={formatDate(item.data.modifiedOn)} />
      )}
      {item.kind === "assembly" && (
        <>
          <DetailRow label="Isolation" value={item.data.isolationModeLabel} />
          <DetailRow label="Source" value={item.data.sourceTypeLabel} />
          <DetailRow label="Public key" value={item.data.publicKeyToken} />
          <DetailRow label="Size" value={formatBytes(item.data.sizeBytes)} />
        </>
      )}
      {item.kind === "step" && (
        <>
          <DetailRow label="Message" value={item.data.messageName} />
          <DetailRow label="Entity" value={item.data.primaryEntity} />
          <DetailRow label="Stage" value={item.data.stageLabel} />
          <DetailRow label="Mode" value={item.data.modeLabel} />
          <DetailRow label="Rank" value={item.data.rank} />
          <DetailRow label="Secure config" value={item.data.hasSecureConfig} />
        </>
      )}
      {item.kind === "image" && (
        <>
          <DetailRow label="Type" value={item.data.imageTypeLabel} />
          <DetailRow label="Alias" value={item.data.entityAlias} />
          <DetailRow label="Attributes" value={item.data.attributes} />
        </>
      )}
      {item.kind === "endpoint" && (
        <>
          <DetailRow label="Contract" value={item.data.contractLabel} />
          <DetailRow label="Auth" value={item.data.authTypeLabel} />
          <DetailRow label="Url" value={item.data.url} />
        </>
      )}
    </dl>
  )
}

export function PluginRegistrationDetails({
  item,
  dependencyReport,
  dependenciesPending,
  onEditAssembly,
  onEditStep,
  onEditImage,
  onEditEndpoint,
  onToggleState,
  onLoadDependencies,
  onUnregister,
}: PluginRegistrationDetailsProps): ReactElement {
  return (
    <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="border-b p-4">
        {item ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/60">
                  <RegistryKindIcon kind={item.kind} className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </div>
                </div>
              </div>
              <RegistryStateBadge item={item} />
            </div>
            {item.editable.reasons.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{editabilityReasonLabel(item.editable)}</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.kind === "assembly" && (
                <Button variant="outline" size="sm" onClick={() => onEditAssembly(item.data)}>
                  <Archive />
                  Update
                </Button>
              )}
              {item.kind === "step" && (
                <Button variant="outline" size="sm" onClick={() => onEditStep(item.data)}>
                  <PlugZap />
                  Edit
                </Button>
              )}
              {item.kind === "image" && (
                <Button variant="outline" size="sm" onClick={() => onEditImage(item.data)}>
                  <ImagePlus />
                  Edit
                </Button>
              )}
              {item.kind === "endpoint" && (
                <Button variant="outline" size="sm" onClick={() => onEditEndpoint(item.data)}>
                  <Server />
                  Edit
                </Button>
              )}
              {item.kind === "step" && (
                <Button variant="outline" size="sm" onClick={() => onToggleState(item)}>
                  <ShieldCheck />
                  {stepStateActionLabel(item.enabled)}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadDependencies(item)}
                disabled={dependenciesPending}
              >
                {dependenciesPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Layers />
                )}
                Dependencies
              </Button>
              {item.kind !== "package" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onUnregister(item)}
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
          {item && (
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
                <RegistrationDetails item={item} />
              </TabsContent>
              <TabsContent value="dependencies" className="pt-3">
                <DependenciesPanel report={dependencyReport} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>
    </main>
  )
}
