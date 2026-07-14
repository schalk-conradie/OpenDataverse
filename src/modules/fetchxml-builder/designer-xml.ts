import type {
  FetchXmlAttributeSummary,
  FetchXmlEntityMetadata,
} from "@/core/dataverse/schemas"
import {
  operatorByValue,
  type FilterCondition,
  type FilterGroupNode,
  type RelatedFilterNode,
} from "@/modules/fetchxml-builder/designer-domain"

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function fetchXmlValue(operator: string, value: string): string {
  if (operator === "like" || operator === "not-like") {
    return `%${value}%`
  }

  return value
}

function conditionToXml(
  condition: FilterCondition,
  attributes: readonly FetchXmlAttributeSummary[],
  depth: number,
): string {
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
  metadataByEntity: ReadonlyMap<string, FetchXmlEntityMetadata>,
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
  metadataByEntity: ReadonlyMap<string, FetchXmlEntityMetadata>,
  depth: number,
): string {
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

export function buildDesignerFetchXml(input: {
  metadata: FetchXmlEntityMetadata
  metadataByEntity: ReadonlyMap<string, FetchXmlEntityMetadata>
  selectedColumns: readonly string[]
  rootGroup: FilterGroupNode
  rowCount: number
}): string {
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
