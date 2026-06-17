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

export type AiChatThread = {
  id: string
  environmentId?: string
  provider: AiChatProvider
  providerThreadId?: string
  codexThreadId?: string
  model?: AiChatModel
  reasoningEffort?: AiReasoningEffort
  title: string
  createdAt: string
  updatedAt: string
  messages: AiChatMessage[]
}

export type AiChatProvider = "codex" | "claude"

export type AiChatModel =
  | "gpt-5.5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex-spark"
  | "claude-sonnet-4-6"
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "claude-opus-4-6"

export type AiReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max"

export type AiChatWindowState = {
  thread?: AiChatThread
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  composerValue: string
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
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  providerThreadId?: string
  codexThreadId?: string
}

export type AiChatMessageInput = {
  threadId: string
  environmentId?: string
  message: string
  provider: AiChatProvider
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  providerThreadId?: string
  codexThreadId?: string
}
