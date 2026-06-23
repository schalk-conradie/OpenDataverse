import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Editor from "@monaco-editor/react"
import {
  Code2,
  Copy,
  Loader2,
  Play,
  Plus,
  Search,
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
} from "@/core/desktop/fetchxml-bridge"
import {
  createId,
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
import { useWorkspaceStore } from "@/store/workspace-store"

type FetchXmlBuilderModuleProps = {
  window: ToolWindow
}

type DesignerTab = "designer" | "fetchxml"

type FilterConjunction = "and" | "or"

type FilterCondition = {
  type: "condition"
  id: string
  attribute?: string
  operator: string
  value: string
}

type FilterGroupNode = {
  type: "group"
  id: string
  conjunction: FilterConjunction
  children: FilterNode[]
}

type RelatedFilterNode = {
  type: "related"
  id: string
  relationshipId?: string
  relatedEntity?: string
  relatedLabel?: string
  fromAttribute?: string
  toAttribute?: string
  relationshipType?: FetchXmlRelationshipSummary["relationshipType"]
  group: FilterGroupNode
}

type FilterNode = FilterCondition | FilterGroupNode | RelatedFilterNode

type FilterOperator = {
  value: string
  label: string
  requiresValue: boolean
  valueMode?: "text" | "option"
}

const selectClassName =
  "h-8 min-w-0 border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"

const textOperators: FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  { value: "ne", label: "Does not equal", requiresValue: true },
  { value: "like", label: "Contains", requiresValue: true },
  { value: "not-like", label: "Does not contain", requiresValue: true },
  { value: "begins-with", label: "Begins with", requiresValue: true },
  { value: "not-begin-with", label: "Does not begin with", requiresValue: true },
  { value: "ends-with", label: "Ends with", requiresValue: true },
  { value: "not-end-with", label: "Does not end with", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const numericOperators: FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  { value: "ne", label: "Does not equal", requiresValue: true },
  { value: "gt", label: "Greater than", requiresValue: true },
  { value: "ge", label: "Greater than or equal", requiresValue: true },
  { value: "lt", label: "Less than", requiresValue: true },
  { value: "le", label: "Less than or equal", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const optionOperators: FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true, valueMode: "option" },
  {
    value: "ne",
    label: "Does not equal",
    requiresValue: true,
    valueMode: "option",
  },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const dateOperators: FilterOperator[] = [
  { value: "on", label: "Equals", requiresValue: true },
  { value: "on-or-after", label: "On or after", requiresValue: true },
  { value: "on-or-before", label: "On or before", requiresValue: true },
  { value: "today", label: "Today", requiresValue: false },
  { value: "yesterday", label: "Yesterday", requiresValue: false },
  { value: "tomorrow", label: "Tomorrow", requiresValue: false },
  { value: "last-x-days", label: "Last X days", requiresValue: true },
  { value: "next-x-days", label: "Next X days", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const lookupOperators: FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  { value: "ne", label: "Does not equal", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

function createCondition(): FilterCondition {
  return {
    type: "condition",
    id: createId("condition"),
    operator: "eq",
    value: "",
  }
}

function createGroup(children: FilterNode[] = []): FilterGroupNode {
  return {
    type: "group",
    id: createId("group"),
    conjunction: "and",
    children,
  }
}

function createRelatedBlock(): RelatedFilterNode {
  return {
    type: "related",
    id: createId("related"),
    group: createGroup([createCondition()]),
  }
}

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

function operatorsForAttribute(attribute?: FetchXmlAttributeSummary) {
  const type = attribute?.attributeType.toLowerCase() ?? ""

  if (
    ["integer", "bigint", "decimal", "double", "money"].some((item) =>
      type.includes(item),
    )
  ) {
    return numericOperators
  }

  if (
    ["picklist", "state", "status", "boolean"].some((item) =>
      type.includes(item),
    )
  ) {
    return optionOperators
  }

  if (type.includes("datetime")) {
    return dateOperators
  }

  if (
    ["lookup", "customer", "owner", "uniqueidentifier"].some((item) =>
      type.includes(item),
    )
  ) {
    return lookupOperators
  }

  return textOperators
}

function operatorByValue(value: string, attribute?: FetchXmlAttributeSummary) {
  return (
    operatorsForAttribute(attribute).find((operator) => operator.value === value) ??
    operatorsForAttribute(attribute)[0] ??
    textOperators[0]
  )
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function fetchXmlValue(operator: string, value: string) {
  if (operator === "like" || operator === "not-like") {
    return `%${value}%`
  }

  return value
}

function updateGroupNode(
  group: FilterGroupNode,
  groupId: string,
  updater: (group: FilterGroupNode) => FilterGroupNode,
): FilterGroupNode {
  if (group.id === groupId) {
    return updater(group)
  }

  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === "group") {
        return updateGroupNode(child, groupId, updater)
      }

      if (child.type === "related") {
        return {
          ...child,
          group: updateGroupNode(child.group, groupId, updater),
        }
      }

      return child
    }),
  }
}

function updateConditionNode(
  group: FilterGroupNode,
  conditionId: string,
  changes: Partial<FilterCondition>,
): FilterGroupNode {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === "condition" && child.id === conditionId) {
        return { ...child, ...changes }
      }

      if (child.type === "group") {
        return updateConditionNode(child, conditionId, changes)
      }

      if (child.type === "related") {
        return {
          ...child,
          group: updateConditionNode(child.group, conditionId, changes),
        }
      }

      return child
    }),
  }
}

function updateRelatedNode(
  group: FilterGroupNode,
  relatedId: string,
  changes: Partial<RelatedFilterNode>,
): FilterGroupNode {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === "related" && child.id === relatedId) {
        return { ...child, ...changes }
      }

      if (child.type === "group") {
        return updateRelatedNode(child, relatedId, changes)
      }

      if (child.type === "related") {
        return {
          ...child,
          group: updateRelatedNode(child.group, relatedId, changes),
        }
      }

      return child
    }),
  }
}

function removeNode(group: FilterGroupNode, nodeId: string): FilterGroupNode {
  return {
    ...group,
    children: group.children
      .filter((child) => child.id !== nodeId)
      .map((child) => {
        if (child.type === "group") {
          return removeNode(child, nodeId)
        }

        if (child.type === "related") {
          return { ...child, group: removeNode(child.group, nodeId) }
        }

        return child
      }),
  }
}

function addNodeToGroup(
  group: FilterGroupNode,
  groupId: string,
  node: FilterNode,
): FilterGroupNode {
  return updateGroupNode(group, groupId, (target) => ({
    ...target,
    children: [...target.children, node],
  }))
}

function conditionToXml(
  condition: FilterCondition,
  attributes: FetchXmlAttributeSummary[],
  depth: number,
) {
  if (!condition.attribute) {
    return ""
  }

  const attribute = attributes.find(
    (item) => item.logicalName === condition.attribute,
  )
  const operator = operatorByValue(condition.operator, attribute)
  const indent = "  ".repeat(depth)

  if (!operator.requiresValue) {
    return `${indent}<condition attribute="${escapeXml(
      condition.attribute,
    )}" operator="${operator.value}" />`
  }

  if (!condition.value.trim()) {
    return ""
  }

  return `${indent}<condition attribute="${escapeXml(
    condition.attribute,
  )}" operator="${operator.value}" value="${escapeXml(
    fetchXmlValue(operator.value, condition.value.trim()),
  )}" />`
}

function groupToXml(
  group: FilterGroupNode,
  metadataByEntity: Map<string, FetchXmlEntityMetadata>,
  entityName: string,
  depth: number,
): string {
  const metadata = metadataByEntity.get(entityName)
  const lines = group.children
    .map((child) => {
      if (child.type === "condition") {
        return conditionToXml(child, metadata?.attributes ?? [], depth + 1)
      }

      if (child.type === "group") {
        return groupToXml(child, metadataByEntity, entityName, depth + 1)
      }

      return relatedToXml(child, metadataByEntity, depth + 1)
    })
    .filter(Boolean)

  if (lines.length === 0) {
    return ""
  }

  const indent = "  ".repeat(depth)
  return [
    `${indent}<filter type="${group.conjunction}">`,
    ...lines,
    `${indent}</filter>`,
  ].join("\n")
}

function relatedToXml(
  related: RelatedFilterNode,
  metadataByEntity: Map<string, FetchXmlEntityMetadata>,
  depth: number,
) {
  if (!related.relatedEntity) {
    return ""
  }

  const indent = "  ".repeat(depth)
  const attributes = [
    `name="${escapeXml(related.relatedEntity)}"`,
    related.fromAttribute ? `from="${escapeXml(related.fromAttribute)}"` : "",
    related.toAttribute ? `to="${escapeXml(related.toAttribute)}"` : "",
    `link-type="inner"`,
  ].filter(Boolean)
  const groupXml = groupToXml(
    related.group,
    metadataByEntity,
    related.relatedEntity,
    depth + 1,
  )

  return [
    `${indent}<link-entity ${attributes.join(" ")}>`,
    groupXml,
    `${indent}</link-entity>`,
  ]
    .filter(Boolean)
    .join("\n")
}

function buildDesignerFetchXml(input: {
  metadata: FetchXmlEntityMetadata
  metadataByEntity: Map<string, FetchXmlEntityMetadata>
  selectedColumns: string[]
  rootGroup: FilterGroupNode
  rowCount: number
}) {
  const columns =
    input.selectedColumns.length > 0
      ? input.selectedColumns
      : input.metadata.primaryNameAttribute
        ? [input.metadata.primaryNameAttribute]
        : []
  const lines = [
    `<fetch count="${Math.max(1, input.rowCount)}">`,
    `  <entity name="${escapeXml(input.metadata.logicalName)}">`,
    ...columns.map(
      (column) => `    <attribute name="${escapeXml(column)}" />`,
    ),
  ]
  const filterXml = groupToXml(
    input.rootGroup,
    input.metadataByEntity,
    input.metadata.logicalName,
    2,
  )

  if (filterXml) {
    lines.push(filterXml)
  }

  lines.push("  </entity>", "</fetch>")
  return lines.join("\n")
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
  onChange: (changes: Partial<FilterCondition>) => void
  onRemove: () => void
}) {
  const attribute = attributes.find(
    (item) => item.logicalName === condition.attribute,
  )
  const operators = operatorsForAttribute(attribute)
  const operator = operatorByValue(condition.operator, attribute)

  return (
    <div className="grid min-w-[780px] grid-cols-[28px_minmax(180px,1fr)_180px_minmax(180px,1fr)_32px] items-center gap-2 bg-background p-2">
      <div className="flex size-7 items-center justify-center">
        <input type="checkbox" aria-label="Select condition" />
      </div>
      <select
        className={selectClassName}
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
        operator.valueMode === "option" && attribute?.optionValues?.length ? (
          <select
            className={selectClassName}
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
          >
            <option value="">Value</option>
            {attribute.optionValues.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            className="h-8 text-xs"
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder="Value"
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
    changes: Partial<FilterCondition>,
  ) => void
  onRelatedChange: (
    relatedId: string,
    changes: Partial<RelatedFilterNode>,
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
        "min-w-[860px] rounded-lg border border-border pl-4",
        depth > 0 && "bg-muted/40 p-3",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
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
        <div className="grid grid-cols-[minmax(180px,1fr)_180px_minmax(180px,1fr)] gap-2 px-2 text-xs font-medium text-muted-foreground">
          <span>Field</span>
          <span>Operator</span>
          <span>Value</span>
        </div>
      </div>
      <div className="grid gap-3">
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
      <div className="mt-3 flex gap-2">
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
    changes: Partial<RelatedFilterNode>,
  ) => void
  onConjunctionChange: (groupId: string, conjunction: FilterConjunction) => void
  onConditionChange: (
    conditionId: string,
    changes: Partial<FilterCondition>,
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
    <section className="min-w-[860px] bg-muted/50 p-3">
      <div className="mb-3 grid grid-cols-[28px_minmax(220px,1fr)_180px_32px] items-end gap-2">
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
      <div className="flex h-full items-center justify-center border bg-background text-xs text-muted-foreground">
        Execute a query to view results.
      </div>
    )
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border bg-background text-xs text-muted-foreground">
        No rows returned.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto border bg-background">
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
  const [activeTab, setActiveTab] = useState<DesignerTab>("designer")
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
            error instanceof Error
              ? error.message
              : `Could not load metadata for ${logicalName}`,
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
    changes: Partial<FilterCondition>,
  ) {
    setManualXmlEdited(false)
    setRootGroup((current) =>
      updateConditionNode(current, conditionId, changes),
    )
  }

  function handleRelatedChange(
    relatedId: string,
    changes: Partial<RelatedFilterNode>,
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

  async function runQuery(mode: DesignerTab = activeTab) {
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
      setLastMessage(`Returned ${nextResult.rows.length} row(s)`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "FetchXML execution failed"
      setExecutionError(message)
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
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_260px] border-l bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
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
        onValueChange={(value) => setActiveTab(value as DesignerTab)}
        className="min-h-0 gap-0"
      >
        <div className="flex h-10 items-center justify-between border-b px-4">
          <TabsList variant="line">
            <TabsTrigger value="designer">Designer</TabsTrigger>
            <TabsTrigger value="fetchxml">FetchXML</TabsTrigger>
          </TabsList>
          {manualXmlEdited && (
            <Badge variant="outline" className="text-[11px]">
              XML edited
            </Badge>
          )}
        </div>

        <TabsContent value="designer" className="min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
            <ColumnSelector
              metadata={baseMetadata}
              selectedColumns={selectedColumns}
              onSelectedColumnsChange={(columns) => {
                setManualXmlEdited(false)
                setSelectedColumns(columns)
              }}
            />
            <ScrollArea className="min-h-0">
              <div className="min-w-[920px] p-4">
                {baseMetadataQuery.isLoading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading metadata
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
      </Tabs>

      <footer className="grid min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)] gap-3 border-t bg-muted/30 p-3">
        <ResultTable result={result} columnLabel={columnLabel} />
        <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-medium">Exports</h3>
              {selectedEntity && (
                <p className="text-[11px] text-muted-foreground">
                  {displayEntityName(selectedEntity)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
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
            <div className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {executionError}
            </div>
          )}
          <div className="min-h-0 border bg-background p-2">
            <Label className="text-[11px] text-muted-foreground">
              Web API URL
            </Label>
            <textarea
              className="mt-1 h-[calc(100%-1.25rem)] w-full resize-none bg-transparent font-mono text-[11px] outline-none"
              readOnly
              value={result?.webApiUrl ?? ""}
              placeholder="Execute a query to generate the Web API fetchXml URL."
            />
          </div>
        </section>
      </footer>
    </section>
  )
}
