import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Editor from "@monaco-editor/react"
import {
  Code2,
  Copy,
  Download,
  Loader2,
  Play,
  Plus,
  Search,
  Table2,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  executeFetchXml,
  getFetchXmlEntityMetadata,
  listFetchXmlEntities,
} from "@/modules/fetchxml-builder/gateway"
import { formatErrorMessage } from "@/core/errors"
import {
  getEnvironmentById,
  type DataverseEnvironment,
  type FetchXmlAttributeSummary,
  type FetchXmlEntityMetadata,
  type FetchXmlEntitySummary,
  type FetchXmlQueryResult,
  type FetchXmlRelationshipSummary,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import {
  addNodeToGroup,
  createCondition,
  createGroup,
  createRelatedBlock,
  operatorByValue,
  operatorsForAttribute,
  removeNode,
  updateConditionNode,
  updateGroupNode,
  updateRelatedNode,
  type FilterCondition,
  type FilterConditionChanges,
  type FilterConjunction,
  type FilterGroupNode,
  type FilterNode,
  type RelatedFilterChanges,
  type RelatedFilterNode,
} from "@/modules/fetchxml-builder/designer-domain"
import { buildDesignerFetchXml } from "@/modules/fetchxml-builder/designer-xml"
import { buildFetchXmlCsv } from "@/modules/fetchxml-builder/result-export"
import { valueControlForAttribute } from "@/modules/fetchxml-builder/value-input"
import { useWorkspaceStore } from "@/store/workspace-store"

type FetchXmlBuilderModuleProps = {
  window: ToolWindow
}

type BuilderTab = "designer" | "fetchxml" | "results"
type QuerySourceTab = Exclude<BuilderTab, "results">

const selectClassName =
  "h-8 min-w-0 border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"

function displayEntityName(entity?: FetchXmlEntitySummary) {
  if (!entity) {
    return "Select table"
  }

  return entity.displayName === entity.logicalName
    ? entity.logicalName
    : `${entity.displayName} (${entity.logicalName})`
}

function attributeLabel(attribute?: FetchXmlAttributeSummary) {
  if (!attribute) {
    return ""
  }

  return attribute.displayName === attribute.logicalName
    ? attribute.logicalName
    : `${attribute.displayName} (${attribute.logicalName})`
}

function relationshipGroupLabel(
  relationshipType: FetchXmlRelationshipSummary["relationshipType"],
) {
  if (relationshipType === "many-to-one") {
    return "Many to one"
  }

  if (relationshipType === "one-to-many") {
    return "One to many"
  }

  return "Many to many"
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

function ColumnSelector({
  metadata,
  selectedColumns,
  onSelectedColumnsChange,
}: {
  metadata?: FetchXmlEntityMetadata
  selectedColumns: string[]
  onSelectedColumnsChange: (columns: string[]) => void
}) {
  const [search, setSearch] = useState("")
  const attributes = useMemo(() => {
    const normalized = search.trim().toLowerCase()

    return (metadata?.attributes ?? [])
      .filter((attribute) => {
        if (!normalized) {
          return true
        }

        return `${attribute.displayName} ${attribute.logicalName}`
          .toLowerCase()
          .includes(normalized)
      })
      .slice(0, 120)
  }, [metadata?.attributes, search])

  function toggleColumn(column: string) {
    if (selectedColumns.includes(column)) {
      onSelectedColumnsChange(
        selectedColumns.filter((item) => item !== column),
      )
      return
    }

    onSelectedColumnsChange([...selectedColumns, column])
  }

  return (
    <section className="flex min-h-0 flex-col border bg-background">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-medium">Columns</Label>
          <Badge variant="secondary">{selectedColumns.length}</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find columns"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-2">
          {attributes.map((attribute) => (
            <label
              key={attribute.logicalName}
              className="flex min-h-8 items-center gap-2 border border-transparent px-2 text-xs hover:border-border hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={selectedColumns.includes(attribute.logicalName)}
                onChange={() => toggleColumn(attribute.logicalName)}
              />
              <span className="min-w-0">
                <span className="block truncate">{attribute.displayName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {attribute.logicalName}
                </span>
              </span>
            </label>
          ))}
          {attributes.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No columns
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}

function ConditionRow({
  condition,
  attributes,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  attributes: FetchXmlAttributeSummary[]
  onChange: (changes: FilterConditionChanges) => void
  onRemove: () => void
}) {
  const attribute = attributes.find(
    (item) => item.logicalName === condition.attribute,
  )
  const operators = operatorsForAttribute(attribute)
  const operator = operatorByValue(condition.operator, attribute)
  const valueControl = valueControlForAttribute(attribute, operator)

  return (
    <div className="grid w-full min-w-0 grid-cols-[28px_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_32px] items-center gap-2 bg-background p-2">
      <div className="flex size-7 items-center justify-center">
        <input type="checkbox" aria-label="Select condition" />
      </div>
      <select
        className={selectClassName}
        aria-label="Field"
        value={condition.attribute ?? ""}
        onChange={(event) => {
          const nextAttribute = attributes.find(
            (item) => item.logicalName === event.target.value,
          )
          const nextOperator = operatorsForAttribute(nextAttribute)[0]?.value ?? "eq"
          onChange({
            attribute: event.target.value,
            operator: nextOperator,
            value: "",
          })
        }}
      >
        <option value="">Select a field</option>
        {attributes.map((item) => (
          <option key={item.logicalName} value={item.logicalName}>
            {attributeLabel(item)}
          </option>
        ))}
      </select>
      <select
        className={selectClassName}
        aria-label="Operator"
        value={operator.value}
        onChange={(event) =>
          onChange({ operator: event.target.value, value: "" })
        }
      >
        {operators.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {operator.requiresValue ? (
        valueControl.kind === "select" ? (
          <select
            className={selectClassName}
            aria-label="Value"
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
          >
            <option value="">Value</option>
            {valueControl.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            className="h-8 text-xs"
            aria-label="Value"
            type={valueControl.type}
            step={valueControl.step}
            min={valueControl.min}
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder={valueControl.placeholder}
          />
        )
      ) : (
        <div className="h-8 border bg-muted/30 px-2 py-2 text-xs text-muted-foreground">
          No value
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove condition"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function FilterGroupEditor({
  group,
  entityName,
  metadataByEntity,
  depth,
  onConjunctionChange,
  onConditionChange,
  onRelatedChange,
  onAddNode,
  onRemoveNode,
  onLoadMetadata,
}: {
  group: FilterGroupNode
  entityName: string
  metadataByEntity: Map<string, FetchXmlEntityMetadata>
  depth: number
  onConjunctionChange: (groupId: string, conjunction: FilterConjunction) => void
  onConditionChange: (
    conditionId: string,
    changes: FilterConditionChanges,
  ) => void
  onRelatedChange: (
    relatedId: string,
    changes: RelatedFilterChanges,
  ) => void
  onAddNode: (groupId: string, node: FilterNode) => void
  onRemoveNode: (nodeId: string) => void
  onLoadMetadata: (logicalName: string) => void
}) {
  const metadata = metadataByEntity.get(entityName)
  const relationships = metadata?.relationships ?? []

  return (
    <section
      className={cn(
        "w-full min-w-0 rounded-lg border border-border p-4",
        depth > 0 && "bg-muted/40",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <select
          className={cn(selectClassName, "w-24 font-medium uppercase")}
          value={group.conjunction}
          onChange={(event) =>
            onConjunctionChange(
              group.id,
              event.target.value as FilterConjunction,
            )
          }
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-2 px-2 text-xs font-medium text-muted-foreground">
          <span>Field</span>
          <span>Operator</span>
          <span>Value</span>
        </div>
      </div>
      <div className="grid gap-2">
        {group.children.map((child) => {
          if (child.type === "condition") {
            return (
              <ConditionRow
                key={child.id}
                condition={child}
                attributes={metadata?.attributes ?? []}
                onChange={(changes) => onConditionChange(child.id, changes)}
                onRemove={() => onRemoveNode(child.id)}
              />
            )
          }

          if (child.type === "group") {
            return (
              <div key={child.id} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-2 top-2 z-10"
                  aria-label="Remove group"
                  onClick={() => onRemoveNode(child.id)}
                >
                  <Trash2 />
                </Button>
                <FilterGroupEditor
                  group={child}
                  entityName={entityName}
                  metadataByEntity={metadataByEntity}
                  depth={depth + 1}
                  onConjunctionChange={onConjunctionChange}
                  onConditionChange={onConditionChange}
                  onRelatedChange={onRelatedChange}
                  onAddNode={onAddNode}
                  onRemoveNode={onRemoveNode}
                  onLoadMetadata={onLoadMetadata}
                />
              </div>
            )
          }

          return (
            <RelatedBlockEditor
              key={child.id}
              related={child}
              relationships={relationships}
              metadataByEntity={metadataByEntity}
              depth={depth + 1}
              onRelatedChange={onRelatedChange}
              onConjunctionChange={onConjunctionChange}
              onConditionChange={onConditionChange}
              onAddNode={onAddNode}
              onRemoveNode={onRemoveNode}
              onLoadMetadata={onLoadMetadata}
            />
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddNode(group.id, createCondition())}
        >
          <Plus />
          Add row
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddNode(group.id, createGroup([createCondition()]))}
        >
          <Plus />
          Add group
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddNode(group.id, createRelatedBlock())}
        >
          <Plus />
          Add related table
        </Button>
      </div>
    </section>
  )
}

function RelatedBlockEditor({
  related,
  relationships,
  metadataByEntity,
  depth,
  onRelatedChange,
  onConjunctionChange,
  onConditionChange,
  onAddNode,
  onRemoveNode,
  onLoadMetadata,
}: {
  related: RelatedFilterNode
  relationships: FetchXmlRelationshipSummary[]
  metadataByEntity: Map<string, FetchXmlEntityMetadata>
  depth: number
  onRelatedChange: (
    relatedId: string,
    changes: RelatedFilterChanges,
  ) => void
  onConjunctionChange: (groupId: string, conjunction: FilterConjunction) => void
  onConditionChange: (
    conditionId: string,
    changes: FilterConditionChanges,
  ) => void
  onAddNode: (groupId: string, node: FilterNode) => void
  onRemoveNode: (nodeId: string) => void
  onLoadMetadata: (logicalName: string) => void
}) {
  const entityName = related.relatedEntity ?? ""
  const groupedRelationships = useMemo(
    () =>
      (["many-to-one", "one-to-many", "many-to-many"] as const).map(
        (relationshipType) => ({
          relationshipType,
          label: relationshipGroupLabel(relationshipType),
          relationships: relationships.filter(
            (relationship) =>
              relationship.relationshipType === relationshipType,
          ),
        }),
      ),
    [relationships],
  )

  return (
    <section className="w-full min-w-0 bg-muted/50 p-3">
      <div className="mb-3 grid grid-cols-[28px_minmax(0,1fr)_minmax(0,0.6fr)_32px] items-end gap-2">
        <div className="flex size-7 items-center justify-center">
          <input type="checkbox" aria-label="Select related table" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs font-medium">Related table</Label>
          <select
            className={selectClassName}
            value={related.relationshipId ?? ""}
            onChange={(event) => {
              const relationship = relationships.find(
                (item) => item.id === event.target.value,
              )

              if (!relationship) {
                onRelatedChange(related.id, {
                  relationshipId: undefined,
                  relatedEntity: undefined,
                  relatedLabel: undefined,
                  fromAttribute: undefined,
                  toAttribute: undefined,
                  relationshipType: undefined,
                })
                return
              }

              onRelatedChange(related.id, {
                relationshipId: relationship.id,
                relatedEntity: relationship.fromEntity,
                relatedLabel: relationship.displayName,
                fromAttribute: relationship.fromAttribute,
                toAttribute: relationship.toAttribute,
                relationshipType: relationship.relationshipType,
              })
              onLoadMetadata(relationship.fromEntity)
            }}
          >
            <option value="">Choose a related table</option>
            {groupedRelationships.map((group) =>
              group.relationships.length > 0 ? (
                <optgroup key={group.relationshipType} label={group.label}>
                  {group.relationships.map((relationship) => (
                    <option key={relationship.id} value={relationship.id}>
                      {relationship.displayName}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs font-medium">Operator</Label>
          <div className="h-8 border bg-background px-2 py-2 text-xs text-muted-foreground">
            Contains data
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove related table"
          onClick={() => onRemoveNode(related.id)}
        >
          <Trash2 />
        </Button>
      </div>
      {entityName ? (
        <FilterGroupEditor
          group={related.group}
          entityName={entityName}
          metadataByEntity={metadataByEntity}
          depth={depth}
          onConjunctionChange={onConjunctionChange}
          onConditionChange={onConditionChange}
          onRelatedChange={onRelatedChange}
          onAddNode={onAddNode}
          onRemoveNode={onRemoveNode}
          onLoadMetadata={onLoadMetadata}
        />
      ) : (
        <div className="border bg-background px-3 py-5 text-xs text-muted-foreground">
          Choose a related table to add filter rows.
        </div>
      )}
    </section>
  )
}

function ResultTable({
  result,
  columnLabel,
}: {
  result?: FetchXmlQueryResult
  columnLabel: (column: string) => string
}) {
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-6 text-center">
        <div>
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
            <Table2 className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold">No results yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Execute a query to view and export its rows.
          </p>
        </div>
      </div>
    )
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-6 text-center">
        <div>
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
            <Table2 className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold">No rows returned</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Adjust the query filters or row limit, then execute it again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            {result.columns.map((column) => (
              <TableHead key={column}>{columnLabel(column)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row, index) => (
            <TableRow key={index}>
              {result.columns.map((column) => (
                <TableCell key={column}>
                  {formatCellValue(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function FetchXmlBuilderModule({
  window: toolWindow,
}: FetchXmlBuilderModuleProps) {
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const environment = getEnvironmentById(
    config,
    toolWindow.environmentId ?? config.currentEnvironmentId,
  )
  const [activeTab, setActiveTab] = useState<BuilderTab>("designer")
  const [selectedBaseEntityName, setSelectedBaseEntityName] = useState("")
  const [relatedMetadataByEntity, setRelatedMetadataByEntity] = useState(
    () => new Map<string, FetchXmlEntityMetadata>(),
  )
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [rootGroup, setRootGroup] = useState(() =>
    createGroup([createCondition()]),
  )
  const [rowCount, setRowCount] = useState(100)
  const [fetchXml, setFetchXml] = useState("")
  const [manualXmlEdited, setManualXmlEdited] = useState(false)
  const [result, setResult] = useState<FetchXmlQueryResult>()
  const [executionError, setExecutionError] = useState<string>()
  const [executing, setExecuting] = useState(false)

  const entitiesQuery = useQuery({
    queryKey: ["fetchxml-entities", environment?.id],
    enabled: Boolean(environment),
    queryFn: () => listFetchXmlEntities(environment as DataverseEnvironment),
  })

  const defaultBaseEntityName = useMemo(() => {
    if (!entitiesQuery.data?.length) {
      return ""
    }

    return (
      entitiesQuery.data.find((entity) => entity.logicalName === "account") ??
      entitiesQuery.data[0]
    ).logicalName
  }, [entitiesQuery.data])

  const baseEntityName = selectedBaseEntityName || defaultBaseEntityName

  const baseMetadataQuery = useQuery({
    queryKey: ["fetchxml-entity-metadata", environment?.id, baseEntityName],
    enabled: Boolean(environment && baseEntityName),
    queryFn: () =>
      getFetchXmlEntityMetadata(
        environment as DataverseEnvironment,
        baseEntityName,
      ),
  })

  const baseMetadata = baseMetadataQuery.data

  const metadataByEntity = useMemo(() => {
    const next = new Map(relatedMetadataByEntity)

    if (baseMetadata) {
      next.set(baseMetadata.logicalName, baseMetadata)
    }

    return next
  }, [baseMetadata, relatedMetadataByEntity])

  const generatedFetchXml = useMemo(() => {
    if (!baseMetadata) {
      return ""
    }

    return buildDesignerFetchXml({
      metadata: baseMetadata,
      metadataByEntity,
      selectedColumns,
      rootGroup,
      rowCount,
    })
  }, [baseMetadata, metadataByEntity, rootGroup, rowCount, selectedColumns])

  const visibleFetchXml = manualXmlEdited ? fetchXml : generatedFetchXml

  const selectedEntity = entitiesQuery.data?.find(
    (entity) => entity.logicalName === baseEntityName,
  )

  const columnLabel = useCallback(
    (column: string) => {
      const attribute = baseMetadata?.attributes.find(
        (item) => item.logicalName === column,
      )

      return attribute?.displayName ?? column
    },
    [baseMetadata?.attributes],
  )

  const loadMetadata = useCallback(
    (logicalName: string) => {
      if (!environment || metadataByEntity.has(logicalName)) {
        return
      }

      void getFetchXmlEntityMetadata(environment, logicalName)
        .then((metadata) => {
          setRelatedMetadataByEntity((current) => {
            const next = new Map(current)
            next.set(metadata.logicalName, metadata)
            return next
          })
        })
        .catch((error: unknown) => {
          setLastMessage(
            formatErrorMessage(error, `Could not load metadata for ${logicalName}`),
          )
        })
    },
    [environment, metadataByEntity, setLastMessage],
  )

  function handleBaseEntityChange(logicalName: string) {
    setSelectedBaseEntityName(logicalName)
    setSelectedColumns([])
    setRootGroup(createGroup([createCondition()]))
    setManualXmlEdited(false)
    setFetchXml("")
    setResult(undefined)
    setExecutionError(undefined)
  }

  function handleConditionChange(
    conditionId: string,
    changes: FilterConditionChanges,
  ) {
    setManualXmlEdited(false)
    setRootGroup((current) =>
      updateConditionNode(current, conditionId, changes),
    )
  }

  function handleRelatedChange(
    relatedId: string,
    changes: RelatedFilterChanges,
  ) {
    setManualXmlEdited(false)
    setRootGroup((current) => updateRelatedNode(current, relatedId, changes))
  }

  function handleConjunctionChange(
    groupId: string,
    conjunction: FilterConjunction,
  ) {
    setManualXmlEdited(false)
    setRootGroup((current) =>
      updateGroupNode(current, groupId, (group) => ({
        ...group,
        conjunction,
      })),
    )
  }

  function handleAddNode(groupId: string, node: FilterNode) {
    setManualXmlEdited(false)
    setRootGroup((current) => addNodeToGroup(current, groupId, node))
  }

  function handleRemoveNode(nodeId: string) {
    setManualXmlEdited(false)
    setRootGroup((current) => removeNode(current, nodeId))
  }

  async function runQuery(
    mode: QuerySourceTab = activeTab === "fetchxml" ? "fetchxml" : "designer",
  ) {
    if (!environment) {
      setExecutionError("Select an environment before executing FetchXML.")
      return
    }

    const xml = mode === "designer" ? generatedFetchXml : visibleFetchXml
    if (!xml.trim()) {
      setExecutionError("FetchXML is empty.")
      return
    }

    setExecuting(true)
    setExecutionError(undefined)
    setLastMessage("Executing FetchXML")

    try {
      const nextResult = await executeFetchXml(environment, xml)
      setResult(nextResult)
      setFetchXml(xml)
      setActiveTab("results")
      setLastMessage(`Returned ${nextResult.rows.length} row(s)`)
    } catch (error) {
      const message = formatErrorMessage(error, "FetchXML execution failed")
      setExecutionError(message)
      setActiveTab("results")
      setLastMessage(message)
    } finally {
      setExecuting(false)
    }
  }

  async function copyText(text?: string) {
    if (!text) {
      return
    }

    await navigator.clipboard.writeText(text)
    setLastMessage("Copied to clipboard")
  }

  function exportCsv() {
    if (!result) {
      return
    }

    const csv = buildFetchXmlCsv(result, columnLabel)
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `${baseEntityName || "fetchxml-results"}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setLastMessage(`Exported ${result.rows.length} row(s) as CSV`)
  }

  if (!environment) {
    return (
      <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center">
        <div>
          <Code2 className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">FetchXML Builder</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an environment before opening this tool.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">FetchXML Builder</h2>
          <p className="truncate text-xs text-muted-foreground">
            {environment.name} · {environment.url}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Table</Label>
            <select
              className={cn(selectClassName, "w-72")}
              value={baseEntityName}
              onChange={(event) => handleBaseEntityChange(event.target.value)}
              disabled={entitiesQuery.isLoading}
            >
              <option value="">Select table</option>
              {entitiesQuery.data?.map((entity) => (
                <option key={entity.logicalName} value={entity.logicalName}>
                  {displayEntityName(entity)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Rows</Label>
            <Input
              className="h-8 w-20 text-xs"
              type="number"
              min={1}
              value={rowCount}
              onChange={(event) => {
                setManualXmlEdited(false)
                setRowCount(Number(event.target.value) || 1)
              }}
            />
          </div>
          <Button type="button" onClick={() => void runQuery()} disabled={executing}>
            {executing ? <Loader2 className="animate-spin" /> : <Play />}
            Execute
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as BuilderTab)}
        className="min-h-0 gap-0"
      >
        <div className="flex h-10 items-center justify-between border-b px-4">
          <TabsList variant="line">
            <TabsTrigger value="designer">Designer</TabsTrigger>
            <TabsTrigger value="fetchxml">FetchXML</TabsTrigger>
            <TabsTrigger value="results">
              Results{result ? ` (${result.rows.length})` : ""}
            </TabsTrigger>
          </TabsList>
          {manualXmlEdited && (
            <Badge variant="outline" className="text-[11px]">
              XML edited
            </Badge>
          )}
        </div>

        <TabsContent value="designer" className="min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
            <ColumnSelector
              metadata={baseMetadata}
              selectedColumns={selectedColumns}
              onSelectedColumnsChange={(columns) => {
                setManualXmlEdited(false)
                setSelectedColumns(columns)
              }}
            />
            <ScrollArea className="min-h-0">
              <div className="w-full min-w-0 p-4">
                {baseMetadataQuery.isLoading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading metadata
                  </div>
                ) : entitiesQuery.isError ? (
                  <div className="flex h-40 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
                    {formatErrorMessage(
                      entitiesQuery.error,
                      "Could not load tables.",
                    )}
                  </div>
                ) : baseMetadataQuery.isError ? (
                  <div className="flex h-40 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
                    {formatErrorMessage(
                      baseMetadataQuery.error,
                      "Could not load table metadata.",
                    )}
                  </div>
                ) : baseMetadata ? (
                  <FilterGroupEditor
                    group={rootGroup}
                    entityName={baseMetadata.logicalName}
                    metadataByEntity={metadataByEntity}
                    depth={0}
                    onConjunctionChange={handleConjunctionChange}
                    onConditionChange={handleConditionChange}
                    onRelatedChange={handleRelatedChange}
                    onAddNode={handleAddNode}
                    onRemoveNode={handleRemoveNode}
                    onLoadMetadata={loadMetadata}
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                    Select a table to build filters.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="fetchxml" className="min-h-0">
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-xs text-muted-foreground">
                Manual FetchXML executes exactly as written.
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(visibleFetchXml)}
                >
                  <Copy />
                  Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void runQuery("fetchxml")}
                  disabled={executing}
                >
                  {executing ? <Loader2 className="animate-spin" /> : <Play />}
                  Execute XML
                </Button>
              </div>
            </div>
            <Editor
              language="xml"
              value={visibleFetchXml}
              onChange={(value) => {
                setManualXmlEdited(true)
                setFetchXml(value ?? "")
              }}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="results" className="min-h-0">
          <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
              <div className="min-w-0">
                <h3 className="text-xs font-medium">
                  {result
                    ? `${result.rows.length} row${result.rows.length === 1 ? "" : "s"} returned`
                    : "Query results"}
                </h3>
                {selectedEntity && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {displayEntityName(selectedEntity)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={!result}
                >
                  <Download />
                  CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(visibleFetchXml)}
                >
                  <Copy />
                  FetchXML
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(result?.webApiUrl)}
                  disabled={!result?.webApiUrl}
                >
                  <Copy />
                  Web API
                </Button>
              </div>
            </div>
            {executionError && (
              <div className="m-3 mb-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {executionError}
              </div>
            )}
            <div className="min-h-0 p-3">
              <ResultTable result={result} columnLabel={columnLabel} />
            </div>
            <section className="border-t bg-muted/30 px-4 py-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">
                  Web API URL
                </Label>
                <textarea
                  className="mt-1 h-12 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] outline-none"
                  readOnly
                  value={result?.webApiUrl ?? ""}
                  placeholder="Execute a query to generate the Web API fetchXml URL."
                />
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
