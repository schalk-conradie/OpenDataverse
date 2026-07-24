import { createId } from "@/core/dataverse/schemas"
import type {
  FetchXmlAttributeSummary,
  FetchXmlRelationshipSummary,
} from "@/core/dataverse/schemas"

export type FilterConjunction = "and" | "or"

export type FilterCondition = {
  type: "condition"
  id: string
  attribute?: string
  operator: string
  value: string
}

export type FilterGroupNode = {
  type: "group"
  id: string
  conjunction: FilterConjunction
  children: FilterNode[]
}

export type RelatedFilterNode = {
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

export type FilterNode = FilterCondition | FilterGroupNode | RelatedFilterNode

export type FilterConditionChanges = {
  attribute?: string
  operator?: string
  value?: string
}

export type RelatedFilterChanges = {
  relationshipId?: string
  relatedEntity?: string
  relatedLabel?: string
  fromAttribute?: string
  toAttribute?: string
  relationshipType?: FetchXmlRelationshipSummary["relationshipType"]
}

export type FilterOperator = {
  value: string
  label: string
  requiresValue: boolean
}

const textOperators: readonly FilterOperator[] = [
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

const numericOperators: readonly FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  { value: "ne", label: "Does not equal", requiresValue: true },
  { value: "gt", label: "Greater than", requiresValue: true },
  { value: "ge", label: "Greater than or equal", requiresValue: true },
  { value: "lt", label: "Less than", requiresValue: true },
  { value: "le", label: "Less than or equal", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const optionOperators: readonly FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  {
    value: "ne",
    label: "Does not equal",
    requiresValue: true,
  },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

const dateOperators: readonly FilterOperator[] = [
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

const lookupOperators: readonly FilterOperator[] = [
  { value: "eq", label: "Equals", requiresValue: true },
  { value: "ne", label: "Does not equal", requiresValue: true },
  { value: "not-null", label: "Contains data", requiresValue: false },
  { value: "null", label: "Does not contain data", requiresValue: false },
]

export function createCondition(): FilterCondition {
  return {
    type: "condition",
    id: createId("condition"),
    operator: "eq",
    value: "",
  }
}

export function createGroup(
  children: readonly FilterNode[] = [],
): FilterGroupNode {
  return {
    type: "group",
    id: createId("group"),
    conjunction: "and",
    children: [...children],
  }
}

export function createRelatedBlock(): RelatedFilterNode {
  return {
    type: "related",
    id: createId("related"),
    group: createGroup([createCondition()]),
  }
}

export function operatorsForAttribute(
  attribute?: FetchXmlAttributeSummary,
): readonly FilterOperator[] {
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

export function operatorByValue(
  value: string,
  attribute?: FetchXmlAttributeSummary,
): FilterOperator {
  return (
    operatorsForAttribute(attribute).find((operator) => operator.value === value) ??
    operatorsForAttribute(attribute)[0] ??
    textOperators[0]
  )
}

export function updateGroupNode(
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

export function updateConditionNode(
  group: FilterGroupNode,
  conditionId: string,
  changes: FilterConditionChanges,
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

export function updateRelatedNode(
  group: FilterGroupNode,
  relatedId: string,
  changes: RelatedFilterChanges,
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

export function removeNode(
  group: FilterGroupNode,
  nodeId: string,
): FilterGroupNode {
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

export function addNodeToGroup(
  group: FilterGroupNode,
  groupId: string,
  node: FilterNode,
): FilterGroupNode {
  return updateGroupNode(group, groupId, (target) => ({
    ...target,
    children: [...target.children, node],
  }))
}
