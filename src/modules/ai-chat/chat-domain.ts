import type {
  AiChatAttachment,
  AiChatAttachmentBundle,
  AiChatContextUsage,
  AiChatMessage,
  AiChatMode,
} from "@/modules/ai-chat/types"
import { isAiChatProvider } from "@/modules/ai-chat/options"

type ContextUsageTone = "neutral" | "ok" | "warning" | "critical"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return value === undefined || isFiniteNumber(value)
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean"
}

function isAiChatRole(value: unknown): value is AiChatMessage["role"] {
  return (
    value === "user" ||
    value === "assistant" ||
    value === "tool" ||
    value === "system"
  )
}

function isAiChatMessageStatus(
  value: unknown,
): value is AiChatMessage["status"] {
  return (
    value === undefined ||
    value === "pending" ||
    value === "streaming" ||
    value === "complete" ||
    value === "error"
  )
}

export function pastedFileLooksLikeImage(
  file: Pick<File, "name" | "type">,
): boolean {
  return (
    file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name)
  )
}

export function pastedImageMimeType(
  file: Pick<File, "name" | "type">,
): string {
  if (file.type.startsWith("image/")) {
    return file.type
  }

  if (/\.jpe?g$/i.test(file.name)) {
    return "image/jpeg"
  }

  if (/\.gif$/i.test(file.name)) {
    return "image/gif"
  }

  if (/\.webp$/i.test(file.name)) {
    return "image/webp"
  }

  return "image/png"
}

export function isAiChatMessage(value: unknown): value is AiChatMessage {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    isAiChatRole(value.role) &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    isAiChatMessageStatus(value.status) &&
    isOptionalString(value.toolName) &&
    (value.metadata === undefined || isRecord(value.metadata))
  )
}

export function upsertMessage(
  messages: readonly AiChatMessage[],
  message: AiChatMessage,
): AiChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id)

  if (index === -1) {
    return [...messages, message]
  }

  return messages.map((item, itemIndex) =>
    itemIndex === index ? message : item,
  )
}

export function getLastTool(
  messages: readonly AiChatMessage[],
): AiChatMessage | undefined {
  return messages.findLast((message) => message.role === "tool")
}

export function getProviderThreadIdFromMessages(
  messages: readonly AiChatMessage[],
): string | undefined {
  const message = messages.findLast((item) => {
    const metadata = item.metadata
    return (
      item.role === "tool" &&
      metadata !== undefined &&
      (typeof metadata.providerThreadId === "string" ||
        typeof metadata.codexThreadId === "string")
    )
  })

  const metadata = message?.metadata
  return typeof metadata?.providerThreadId === "string"
    ? metadata.providerThreadId
    : typeof metadata?.codexThreadId === "string"
      ? metadata.codexThreadId
      : undefined
}

export function createChatTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ")
  if (normalized.length === 0) {
    return "Dataverse Chat"
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
}

export function createUserMessage(
  id: string,
  content: string,
  createdAt: string,
  pendingAttachments?: AiChatAttachmentBundle,
): AiChatMessage {
  const attachments = pendingAttachments?.attachments ?? []

  return {
    id,
    role: "user",
    content,
    createdAt,
    status: "complete",
    metadata:
      attachments.length > 0
        ? {
            attachments,
            attachmentContextChars: pendingAttachments?.context.length ?? 0,
            imagePathCount: pendingAttachments?.imagePaths.length ?? 0,
          }
        : undefined,
  }
}

export function isAiChatContextUsage(
  value: unknown,
): value is AiChatContextUsage {
  if (!isRecord(value)) {
    return false
  }

  return (
    isAiChatProvider(value.provider) &&
    typeof value.model === "string" &&
    isFiniteNumber(value.usedTokens) &&
    isFiniteNumber(value.inputTokens) &&
    isFiniteNumber(value.cachedInputTokens) &&
    isFiniteNumber(value.outputTokens) &&
    isFiniteNumber(value.reasoningOutputTokens) &&
    typeof value.updatedAt === "string" &&
    isOptionalFiniteNumber(value.contextWindowTokens) &&
    isOptionalFiniteNumber(value.percentFull) &&
    isOptionalBoolean(value.autoCompactionEnabled) &&
    isOptionalBoolean(value.manualCompactionAvailable)
  )
}

export function getMessageContextUsage(
  message: AiChatMessage,
): AiChatContextUsage | undefined {
  const usage = message.metadata?.contextUsage
  return isAiChatContextUsage(usage) ? usage : undefined
}

export function getContextUsageFromMessages(
  messages: readonly AiChatMessage[],
): AiChatContextUsage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined) {
      continue
    }

    const usage = getMessageContextUsage(message)
    if (usage !== undefined) {
      return usage
    }
  }

  return undefined
}

export function isAiChatAttachment(
  value: unknown,
): value is AiChatAttachment {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    (value.kind === "image" ||
      value.kind === "file" ||
      value.kind === "folder") &&
    typeof value.path === "string" &&
    typeof value.name === "string" &&
    (value.status === "included" ||
      value.status === "summarized" ||
      value.status === "skipped") &&
    typeof value.contextIncluded === "boolean" &&
    typeof value.imageIncluded === "boolean" &&
    isOptionalFiniteNumber(value.sizeBytes) &&
    isOptionalString(value.mimeType) &&
    isOptionalFiniteNumber(value.itemCount) &&
    isOptionalString(value.reason)
  )
}

export function isAiChatAttachmentBundle(
  value: unknown,
): value is AiChatAttachmentBundle {
  if (!isRecord(value)) {
    return false
  }

  return (
    Array.isArray(value.attachments) &&
    value.attachments.every(isAiChatAttachment) &&
    typeof value.context === "string" &&
    Array.isArray(value.imagePaths) &&
    value.imagePaths.every((path) => typeof path === "string") &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  )
}

export function getMessageAttachments(
  message: AiChatMessage,
): AiChatAttachment[] {
  const attachments = message.metadata?.attachments
  return Array.isArray(attachments)
    ? attachments.filter(isAiChatAttachment)
    : []
}

export function formatAttachmentSize(value?: number): string | undefined {
  if (typeof value !== "number") {
    return undefined
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function attachmentTitle(attachment: AiChatAttachment): string {
  const details = [
    attachment.path,
    attachment.mimeType,
    formatAttachmentSize(attachment.sizeBytes),
    attachment.reason,
  ]

  return details
    .filter((detail): detail is string => detail !== undefined && detail !== "")
    .join("\n")
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`
  }

  return String(Math.round(value))
}

export function contextUsageTone(
  usage?: AiChatContextUsage,
): ContextUsageTone {
  if (usage?.percentFull === undefined) {
    return "neutral"
  }

  if (usage.percentFull >= 95) {
    return "critical"
  }

  if (usage.percentFull >= 85) {
    return "warning"
  }

  return "ok"
}

export function contextUsageTitle(usage?: AiChatContextUsage): string {
  if (usage === undefined) {
    return "Context usage appears after the first provider response."
  }

  const used = `${usage.usedTokens.toLocaleString()} tokens used`
  const window = usage.contextWindowTokens
    ? ` of ${usage.contextWindowTokens.toLocaleString()}`
    : ""
  const percent = usage.percentFull
    ? ` (${Math.round(usage.percentFull)}% full)`
    : ""
  const compact = usage.manualCompactionAvailable
    ? "Manual compaction is available."
    : usage.autoCompactionEnabled
      ? "Provider-managed auto compaction can run when needed."
      : "Manual compaction is not available in this provider path."

  return `Context window: ${used}${window}${percent}.\nInput: ${usage.inputTokens.toLocaleString()}, cached: ${usage.cachedInputTokens.toLocaleString()}, output: ${usage.outputTokens.toLocaleString()}, reasoning: ${usage.reasoningOutputTokens.toLocaleString()}.\n${compact}`
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatChatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function chatModeLabel(mode: AiChatMode): string {
  return mode === "experimental-agent" ? "AI Agent (Experimental)" : "AI Chat"
}
