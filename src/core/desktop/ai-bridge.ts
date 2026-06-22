import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/bridge"
import { createId } from "@/core/dataverse/schemas"
import type {
  AiChatAttachment,
  AiChatAttachmentBundle,
  AiChatMessage,
  AiChatMessageInput,
  AiChatStreamEvent,
  AiChatThread,
  AiChatThreadInput,
  AiChatThreadSummary,
  PastedAiChatImage,
  PastedAiChatImageInput,
} from "@/modules/ai-chat/types"
import { defaultModelByProvider } from "@/modules/ai-chat/options"

const browserThreads = new Map<string, AiChatThread>()
export const AI_CHAT_STREAM_EVENT = "ai-chat-event"

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function createBrowserThread(input: AiChatThreadInput): AiChatThread {
  const now = new Date().toISOString()

  return {
    id: createId("ai-thread"),
    environmentId: input.environmentId,
    mode: input.mode ?? "chat",
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
  const isExperimental = input.mode === "experimental-agent"

  if (
    isExperimental &&
    ["create", "update", "delete", "publish", "patch", "post"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return "Browser preview cannot mutate Dataverse. In the desktop app AI Agent (Experimental) can issue Dataverse Web API mutation requests against the connected environment."
  }

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

function summarizeThread(
  thread: AiChatThread,
): AiChatThreadSummary | undefined {
  if (!thread.environmentId) {
    return undefined
  }

  return {
    id: thread.id,
    environmentId: thread.environmentId,
    mode: thread.mode ?? "chat",
    provider: thread.provider,
    model: thread.model ?? defaultModelByProvider[thread.provider],
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

export async function renameAiChatThread(input: {
  environmentId: string
  threadId: string
  title: string
}) {
  if (isTauriRuntime()) {
    return invoke<AiChatThreadSummary>("rename_ai_chat_thread", {
      environmentId: input.environmentId,
      threadId: input.threadId,
      title: input.title,
    })
  }

  const title = input.title.trim()
  if (!title) {
    throw new Error("Chat title is required.")
  }

  const thread = browserThreads.get(input.threadId)
  if (!thread || thread.environmentId !== input.environmentId) {
    throw new Error("Saved AI chat was not found.")
  }

  const updated = {
    ...thread,
    title,
  }
  browserThreads.set(updated.id, updated)
  const summary = summarizeThread(updated)
  if (!summary) {
    throw new Error("Saved AI chat was not found.")
  }

  return summary
}

export async function deleteAiChatThread(input: {
  environmentId: string
  threadId: string
}) {
  if (isTauriRuntime()) {
    return invoke<void>("delete_ai_chat_thread", {
      environmentId: input.environmentId,
      threadId: input.threadId,
    })
  }

  const thread = browserThreads.get(input.threadId)
  if (!thread || thread.environmentId !== input.environmentId) {
    throw new Error("Saved AI chat was not found.")
  }

  browserThreads.delete(input.threadId)
}

export async function startAiChatThread(input: AiChatThreadInput) {
  if (isTauriRuntime()) {
    return invoke<AiChatThread>("start_ai_chat_thread", {
      environmentId: input.environmentId,
      mode: input.mode,
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

export async function prepareAiChatAttachments(paths: string[]) {
  const selectedPaths = Array.from(
    new Set(paths.map((path) => path.trim())),
  ).filter(Boolean)

  if (isTauriRuntime()) {
    return invoke<AiChatAttachmentBundle>("prepare_ai_chat_attachments", {
      paths: selectedPaths,
    })
  }

  const attachments: AiChatAttachment[] = selectedPaths.map((path) => {
    const lower = path.toLowerCase()
    const imageIncluded = /\.(png|jpe?g|gif|webp)$/.test(lower)

    return {
      id: createId("ai-attachment"),
      kind: imageIncluded ? "image" : "file",
      path,
      name: fileNameFromPath(path),
      status: "summarized",
      contextIncluded: true,
      imageIncluded,
      reason: "Browser preview uses selected paths as mock AI context.",
    }
  })

  return {
    attachments,
    context:
      attachments.length > 0
        ? `Browser preview attachment paths:\n${attachments
            .map((attachment) => `- ${attachment.path}`)
            .join("\n")}`
        : "",
    imagePaths: attachments
      .filter((attachment) => attachment.imageIncluded)
      .map((attachment) => attachment.path),
    warnings: [],
  } satisfies AiChatAttachmentBundle
}

function pastedImageExtension(input: PastedAiChatImageInput) {
  const mimeType = input.mimeType.toLowerCase()
  const name = input.name?.toLowerCase() ?? ""

  if (mimeType === "image/jpeg" || /\.(jpe?g)$/.test(name)) {
    return "jpg"
  }

  if (mimeType === "image/gif" || name.endsWith(".gif")) {
    return "gif"
  }

  if (mimeType === "image/webp" || name.endsWith(".webp")) {
    return "webp"
  }

  return "png"
}

export async function savePastedAiChatImage(
  input: PastedAiChatImageInput,
): Promise<PastedAiChatImage> {
  if (isTauriRuntime()) {
    return invoke<PastedAiChatImage>("save_pasted_ai_chat_image", {
      input,
    })
  }

  return {
    path: `/workspace/pasted-images/pasted-${createId("image")}.${pastedImageExtension(input)}`,
  }
}

export async function sendAiChatMessage(input: AiChatMessageInput) {
  if (isTauriRuntime()) {
    return invoke<AiChatMessage[]>("send_ai_chat_message", input)
  }

  const thread =
    browserThreads.get(input.threadId) ?? createBrowserThread(input)
  const userMessage = createMessage("user", input.message, {
    metadata:
      input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments,
            attachmentContextChars: input.context?.length ?? 0,
            imagePathCount: input.imagePaths?.length ?? 0,
          }
        : undefined,
  })
  const toolMessage = createMessage("tool", "browser-preview", {
    toolName: "browser_preview",
    metadata: {
      environmentId: input.environmentId,
    },
  })
  const assistantMessage = createMessage(
    "assistant",
    browserPreviewResponse(input),
  )
  const updated = {
    ...thread,
    environmentId: input.environmentId,
    mode: input.mode ?? thread.mode ?? "chat",
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
