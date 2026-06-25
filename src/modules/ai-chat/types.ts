export type AiChatRole = "user" | "assistant" | "tool" | "system"

export type AiChatMessageStatus = "pending" | "streaming" | "complete" | "error"

export type AiChatMessage = {
  id: string
  role: AiChatRole
  content: string
  createdAt: string
  status?: AiChatMessageStatus
  toolName?: string
  metadata?: Record<string, unknown>
}

export type AiChatMode = "chat" | "experimental-agent"

export type AiChatAttachmentKind = "image" | "file" | "folder"

export type AiChatAttachmentStatus = "included" | "summarized" | "skipped"

export type AiChatAttachment = {
  id: string
  kind: AiChatAttachmentKind
  path: string
  name: string
  status: AiChatAttachmentStatus
  contextIncluded: boolean
  imageIncluded: boolean
  sizeBytes?: number
  mimeType?: string
  itemCount?: number
  reason?: string
}

export type AiChatAttachmentBundle = {
  attachments: AiChatAttachment[]
  context: string
  imagePaths: string[]
  warnings: string[]
}

export type PastedAiChatImageInput = {
  name?: string
  mimeType: string
  dataBase64: string
}

export type PastedAiChatImage = {
  path: string
}

export type AiChatThread = {
  id: string
  environmentId?: string
  mode?: AiChatMode
  provider: AiChatProvider
  providerThreadId?: string
  codexThreadId?: string
  model?: AiChatModel
  reasoningEffort?: AiReasoningEffort
  contextUsage?: AiChatContextUsage
  title: string
  createdAt: string
  updatedAt: string
  messages: AiChatMessage[]
}

export type AiChatThreadSummary = {
  id: string
  environmentId: string
  mode?: AiChatMode
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type AiChatProvider = "codex" | "claude"

export type AiChatModel = string

export type AiReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max"

export type AiChatContextUsage = {
  provider: AiChatProvider
  model: AiChatModel
  usedTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  updatedAt: string
  contextWindowTokens?: number
  percentFull?: number
  autoCompactionEnabled?: boolean
  manualCompactionAvailable?: boolean
}

export type AiChatWindowState = {
  thread?: AiChatThread
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  composerValue: string
  pendingAttachments?: AiChatAttachmentBundle
  running: boolean
  error?: string
  settingsVersion?: number
}

export type AiChatStreamEvent = {
  threadId: string
  message: AiChatMessage
}

export type AiChatThreadInput = {
  environmentId?: string
  mode?: AiChatMode
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  providerThreadId?: string
  codexThreadId?: string
}

export type AiChatMessageInput = {
  threadId: string
  environmentId?: string
  mode?: AiChatMode
  message: string
  context?: string
  attachments?: AiChatAttachment[]
  imagePaths?: string[]
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  providerThreadId?: string
  codexThreadId?: string
}
