import type {
  PluginMessageFilterSummary,
  PluginMessageSummary,
} from "@/core/dataverse/schemas"

const filteringAttributeMessages = new Set([
  "onexternalupdated",
  "update",
  "updatemultiple",
])

export type FilteringAttributeSupport =
  | {
      supported: true
      entityLogicalName: string
    }
  | {
      supported: false
      message: string
    }

export function getFilteringAttributeSupport(
  messages: readonly PluginMessageSummary[],
  messageId: string,
  messageFilters: readonly PluginMessageFilterSummary[],
  messageFilterId: string,
): FilteringAttributeSupport {
  const message = messages.find((candidate) => candidate.id === messageId)
  if (!message) {
    return {
      supported: false,
      message: "Select a message to configure filtering attributes.",
    }
  }

  if (!filteringAttributeMessages.has(message.name.toLowerCase())) {
    return {
      supported: false,
      message: `${message.name} does not support filtering attributes.`,
    }
  }

  if (messageFilterId === "__none__") {
    return {
      supported: false,
      message: `Select a specific entity for ${message.name} to configure filtering attributes.`,
    }
  }

  const messageFilter = messageFilters.find(
    (candidate) => candidate.id === messageFilterId,
  )
  if (!messageFilter?.primaryEntity) {
    return {
      supported: false,
      message:
        "This Message/Entity combination does not support filtering attributes.",
    }
  }

  return {
    supported: true,
    entityLogicalName: messageFilter.primaryEntity,
  }
}

export function parseFilteringAttributes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((attribute) => attribute.trim())
        .filter(Boolean),
    ),
  ]
}

export function serializeFilteringAttributes(
  attributes: Iterable<string>,
): string {
  return [...new Set(attributes)].sort().join(",")
}
