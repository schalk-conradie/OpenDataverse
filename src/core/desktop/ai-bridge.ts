import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/bridge"
import { createId } from "@/core/dataverse/schemas"
import type {
  AiChatMessage,
  AiChatMessageInput,
  AiChatStreamEvent,
  AiChatThread,
  AiChatThreadInput,
  AiChatThreadSummary,
} from "@/modules/ai-chat/types"

const browserThreads = new Map<string, AiChatThread>()
export const AI_CHAT_STREAM_EVENT = "ai-chat-event"

function createBrowserThread(input: AiChatThreadInput): AiChatThread {
  const now = new Date().toISOString()

  return {
    id: createId("ai-thread"),
    environmentId: input.environmentId,
    provider: input.provider,
    providerThreadId: input.providerThreadId,
    codexThreadId: input.codexThreadId,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    title: "Dataverse Chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function createMessage(
  role: AiChatMessage["role"],
  content: string,
  extra?: Partial<AiChatMessage>,
): AiChatMessage {
  return {
    id: createId("ai-message"),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: "complete",
    ...extra,
  }
}

function browserPreviewResponse(input: AiChatMessageInput) {
  const normalized = input.message.toLowerCase()

  if (normalized.includes("who") && normalized.includes("connected")) {
    return "Browser preview cannot call Dataverse WhoAmI. Run the Tauri app with a connected environment to execute this read-only tool."
  }

  if (normalized.includes("entity") || normalized.includes("metadata")) {
    return "Browser preview cannot inspect Dataverse metadata. In the desktop app this turn uses the read-only Dataverse metadata tools."
  }

  if (normalized.includes("account") || normalized.includes("get")) {
    return "Browser preview cannot query records. In the desktop app bounded OData GET queries are guarded and capped before they run."
  }

  return "Ask for WhoAmI, entity sets, metadata, or a bounded OData GET query."
}

function summarizeThread(thread: AiChatThread): AiChatThreadSummary | undefined {
  if (!thread.environmentId) {
    return undefined
  }

  return {
    id: thread.id,
    environmentId: thread.environmentId,
    provider: thread.provider,
    model: thread.model ?? "gpt-5.4-mini",
    reasoningEffort: thread.reasoningEffort ?? "medium",
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  }
}

function titleFromMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "Dataverse Chat"
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
}

export async function listAiChatThreads(environmentId: string) {
  if (isTauriRuntime()) {
    return invoke<AiChatThreadSummary[]>("list_ai_chat_threads", {
      environmentId,
    })
  }

  return Array.from(browserThreads.values())
    .filter((thread) => thread.environmentId === environmentId)
    .map(summarizeThread)
    .filter((summary): summary is AiChatThreadSummary => Boolean(summary))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function loadAiChatThread(input: {
  environmentId: string
  threadId: string
}) {
  if (isTauriRuntime()) {
    return invoke<AiChatThread>("load_ai_chat_thread", {
      environmentId: input.environmentId,
      threadId: input.threadId,
    })
  }

  const thread = browserThreads.get(input.threadId)
  if (!thread || thread.environmentId !== input.environmentId) {
    throw new Error("Saved AI chat was not found.")
  }

  return thread
}

export async function startAiChatThread(input: AiChatThreadInput) {
  if (isTauriRuntime()) {
    return invoke<AiChatThread>("start_ai_chat_thread", {
      environmentId: input.environmentId,
      provider: input.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      providerThreadId: input.providerThreadId,
    })
  }

  const thread = createBrowserThread(input)
  browserThreads.set(thread.id, thread)
  return thread
}

export async function sendAiChatMessage(input: AiChatMessageInput) {
  if (isTauriRuntime()) {
    return invoke<AiChatMessage[]>("send_ai_chat_message", input)
  }

  const thread = browserThreads.get(input.threadId) ?? createBrowserThread(input)
  const userMessage = createMessage("user", input.message)
  const toolMessage = createMessage("tool", "browser-preview", {
    toolName: "browser_preview",
    metadata: {
      environmentId: input.environmentId,
    },
  })
  const assistantMessage = createMessage("assistant", browserPreviewResponse(input))
  const updated = {
    ...thread,
    environmentId: input.environmentId,
    provider: input.provider,
    providerThreadId: input.providerThreadId ?? thread.providerThreadId,
    codexThreadId: input.codexThreadId ?? thread.codexThreadId,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    title:
      thread.messages.length === 0
        ? titleFromMessage(input.message)
        : thread.title,
    updatedAt: new Date().toISOString(),
    messages: [...thread.messages, userMessage, toolMessage, assistantMessage],
  }

  browserThreads.set(updated.id, updated)
  return updated.messages
}

export async function listenToAiChatEvents(
  handler: (event: AiChatStreamEvent) => void,
) {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  const { listen } = await import("@tauri-apps/api/event")
  return listen<AiChatStreamEvent>(AI_CHAT_STREAM_EVENT, (event) => {
    handler(event.payload)
  })
}
