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
  codexThreadId?: string
  model?: AiChatModel
  reasoningEffort?: AiReasoningEffort
  title: string
  createdAt: string
  updatedAt: string
  messages: AiChatMessage[]
}

export type AiChatModel =
  | "gpt-5.5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex-spark"

export type AiReasoningEffort = "low" | "medium" | "high" | "xhigh"

export type AiChatWindowState = {
  thread?: AiChatThread
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
  composerValue: string
  running: boolean
  error?: string
}

export type AiChatStreamEvent = {
  threadId: string
  message: AiChatMessage
}

export type AiChatThreadInput = {
  environmentId?: string
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
}

export type AiChatMessageInput = {
  threadId: string
  environmentId?: string
  message: string
  model: AiChatModel
  reasoningEffort: AiReasoningEffort
}
