import type { ToolWindow } from "@/core/dataverse/schemas"
import {
  isAiChatAttachmentBundle,
  isAiChatContextUsage,
  isAiChatMessage,
} from "@/modules/ai-chat/chat-domain"
import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  isAiChatModel,
  isAiChatProvider,
  isAiReasoningEffort,
} from "@/modules/ai-chat/options"
import type {
  AiChatMode,
  AiChatModel,
  AiChatProvider,
  AiChatThread,
  AiChatWindowState,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"

type AiChatThreadRecord = Record<string, unknown> & {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: unknown[]
}

export const defaultAiChatState: AiChatWindowState = {
  provider: "codex",
  model: defaultModelByProvider.codex,
  reasoningEffort: defaultReasoningByProvider.codex,
  composerValue: "",
  pendingAttachments: undefined,
  running: false,
  settingsVersion: 6,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAiChatMode(value: unknown): value is AiChatMode {
  return value === "chat" || value === "experimental-agent"
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function isAiChatThreadRecord(
  value: unknown,
): value is AiChatThreadRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages)
  )
}

function parseAiChatThread(
  value: unknown,
  provider: AiChatProvider,
  model: AiChatModel,
  reasoningEffort: AiReasoningEffort,
): AiChatThread | undefined {
  if (!isAiChatThreadRecord(value)) {
    return undefined
  }

  const messages = value.messages.filter(isAiChatMessage)
  const providerThreadId =
    optionalString(value.providerThreadId) ?? optionalString(value.codexThreadId)

  return {
    id: value.id,
    environmentId: optionalString(value.environmentId),
    mode: isAiChatMode(value.mode) ? value.mode : undefined,
    provider,
    providerThreadId,
    codexThreadId: optionalString(value.codexThreadId),
    model,
    reasoningEffort,
    contextUsage: isAiChatContextUsage(value.contextUsage)
      ? value.contextUsage
      : undefined,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages,
  }
}

export function getAiChatWindowState(
  window: Pick<ToolWindow, "state">,
): AiChatWindowState {
  const candidate = window.state?.aiChat
  if (!isRecord(candidate)) {
    return defaultAiChatState
  }

  const threadCandidate = isAiChatThreadRecord(candidate.thread)
    ? candidate.thread
    : undefined
  const threadProvider = isAiChatProvider(threadCandidate?.provider)
    ? threadCandidate.provider
    : undefined
  const threadHasMessages =
    Array.isArray(threadCandidate?.messages) &&
    threadCandidate.messages.length > 0
  const provider =
    threadHasMessages && threadProvider !== undefined
      ? threadProvider
      : isAiChatProvider(candidate.provider)
        ? candidate.provider
        : (threadProvider ?? defaultAiChatState.provider)
  const settingsVersion =
    typeof candidate.settingsVersion === "number" &&
    Number.isFinite(candidate.settingsVersion)
      ? candidate.settingsVersion
      : undefined
  const legacyDefaultModel =
    (settingsVersion === undefined && candidate.model === "gpt-5.5") ||
    (provider === "codex" &&
      !threadHasMessages &&
      (settingsVersion ?? 0) < 6 &&
      candidate.model === "gpt-5.4-mini")
  const model =
    isAiChatModel(provider, candidate.model) && !legacyDefaultModel
      ? candidate.model
      : isAiChatModel(provider, threadCandidate?.model)
        ? threadCandidate.model
        : defaultModelByProvider[provider]
  const legacyDefaultReasoning =
    (settingsVersion === undefined &&
      (candidate.reasoningEffort === "xhigh" ||
        candidate.reasoningEffort === "low")) ||
    (provider === "codex" &&
      !threadHasMessages &&
      (settingsVersion ?? 0) < 6 &&
      candidate.model === "gpt-5.4-mini" &&
      candidate.reasoningEffort === "medium")
  const reasoningEffort =
    isAiReasoningEffort(provider, candidate.reasoningEffort) &&
    !legacyDefaultReasoning
      ? candidate.reasoningEffort
      : isAiReasoningEffort(provider, threadCandidate?.reasoningEffort)
        ? threadCandidate.reasoningEffort
        : defaultReasoningByProvider[provider]
  const thread = parseAiChatThread(
    threadCandidate,
    isAiChatProvider(threadCandidate?.provider)
      ? threadCandidate.provider
      : provider,
    model,
    reasoningEffort,
  )

  return {
    thread,
    provider,
    model,
    reasoningEffort,
    composerValue:
      typeof candidate.composerValue === "string"
        ? candidate.composerValue
        : defaultAiChatState.composerValue,
    pendingAttachments: isAiChatAttachmentBundle(candidate.pendingAttachments)
      ? candidate.pendingAttachments
      : undefined,
    running:
      typeof candidate.running === "boolean"
        ? candidate.running
        : defaultAiChatState.running,
    error: optionalString(candidate.error),
    settingsVersion: defaultAiChatState.settingsVersion,
  }
}
