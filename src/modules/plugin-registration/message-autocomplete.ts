import type { PluginMessageSummary } from "@/core/dataverse/schemas"

const messageCollator = new Intl.Collator("en", {
  sensitivity: "base",
  ignorePunctuation: true,
  numeric: true,
})

export function filterPluginMessages(
  messages: readonly PluginMessageSummary[],
  value: string,
): PluginMessageSummary[] {
  const normalizedValue = value.trim().toLowerCase()

  const matches = normalizedValue
    ? messages.filter((message) =>
        message.name.toLowerCase().includes(normalizedValue),
      )
    : [...messages]

  return matches.sort((left, right) => {
    if (normalizedValue) {
      const rank = (name: string) => {
        const lowerName = name.toLowerCase()
        if (lowerName === normalizedValue) return 0
        if (lowerName.startsWith(normalizedValue)) return 1
        return 2
      }
      const rankDifference = rank(left.name) - rank(right.name)
      if (rankDifference !== 0) return rankDifference
    }

    return messageCollator.compare(left.name, right.name)
      || left.name.localeCompare(right.name, "en")
  })
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
