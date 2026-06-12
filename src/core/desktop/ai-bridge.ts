import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/bridge"
import { createId } from "@/core/dataverse/schemas"
import type {
  AiChatMessage,
  AiChatMessageInput,
  AiChatStreamEvent,
  AiChatThread,
  AiChatThreadInput,
} from "@/modules/ai-chat/types"

const browserThreads = new Map<string, AiChatThread>()
export const AI_CHAT_STREAM_EVENT = "ai-chat-event"

function createBrowserThread(input: AiChatThreadInput): AiChatThread {
  const now = new Date().toISOString()

  return {
    id: createId("ai-thread"),
    environmentId: input.environmentId,
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

export async function startAiChatThread(input: AiChatThreadInput) {
  if (isTauriRuntime()) {
    return invoke<AiChatThread>("start_ai_chat_thread", {
      environmentId: input.environmentId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
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
    model: input.model,
    reasoningEffort: input.reasoningEffort,
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
