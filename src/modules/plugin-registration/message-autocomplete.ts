import type { PluginMessageSummary } from "@/core/dataverse/schemas"

export function filterPluginMessages(
  messages: readonly PluginMessageSummary[],
  value: string,
): PluginMessageSummary[] {
  const normalizedValue = value.trim().toLowerCase()

  if (!normalizedValue) {
    return [...messages]
  }

  return messages.filter((message) =>
    message.name.toLowerCase().includes(normalizedValue),
  )
}

export function findPluginMessageByName(
  messages: readonly PluginMessageSummary[],
  value: string,
): PluginMessageSummary | undefined {
  const normalizedValue = value.trim().toLowerCase()

  return messages.find(
    (message) => message.name.toLowerCase() === normalizedValue,
  )
}
