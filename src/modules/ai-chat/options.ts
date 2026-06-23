import type {
  AiChatModel,
  AiChatProvider,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"

export const providerOptions: Array<{ value: AiChatProvider; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
]

export const defaultModelByProvider: Record<AiChatProvider, AiChatModel> = {
  codex: "gpt-5.4-mini",
  claude: "claude-sonnet-4-6",
}

export const defaultReasoningByProvider: Record<
  AiChatProvider,
  AiReasoningEffort
> = {
  codex: "medium",
  claude: "medium",
}

export const modelOptionsByProvider: Record<
  AiChatProvider,
  Array<{ value: AiChatModel; label: string }>
> = {
  codex: [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { value: "gpt-5.3-codex-spark", label: "ChatGPT 5.3 Spark" },
  ],
  claude: [
    { value: "claude-fable-5", label: "Claude Fable 5" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
}

export const reasoningOptionsByProvider: Record<
  AiChatProvider,
  Array<{ value: AiReasoningEffort; label: string }>
> = {
  codex: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
  ],
  claude: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
}

export function isAiChatProvider(value: unknown): value is AiChatProvider {
  return providerOptions.some((option) => option.value === value)
}

export function isAiChatModel(
  provider: AiChatProvider,
  value: unknown,
): value is AiChatModel {
  return modelOptionsByProvider[provider].some((option) => option.value === value)
}

export function isAiReasoningEffort(
  provider: AiChatProvider,
  value: unknown,
): value is AiReasoningEffort {
  return reasoningOptionsByProvider[provider].some(
    (option) => option.value === value,
  )
}

export function modelForProvider(
  provider: AiChatProvider,
  value: unknown,
): AiChatModel {
  return isAiChatModel(provider, value) ? value : defaultModelByProvider[provider]
}
