import modelCatalog from "@/core/ai/model-catalog.json"
import type {
  AiChatModel,
  AiChatProvider,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"

type CatalogOption<TValue extends string> = {
  value: TValue
  label: string
}

type AiProviderCatalog = {
  id: AiChatProvider
  label: string
  defaultModel: AiChatModel
  defaultReasoningEffort: AiReasoningEffort
  models: Array<CatalogOption<AiChatModel>>
  reasoningEfforts: Array<CatalogOption<AiReasoningEffort>>
}

const aiModelCatalog = modelCatalog as {
  defaultProvider: AiChatProvider
  providers: AiProviderCatalog[]
}

const providers = aiModelCatalog.providers

export const providerOptions: Array<{ value: AiChatProvider; label: string }> =
  providers.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }))

export const defaultModelByProvider = Object.fromEntries(
  providers.map((provider) => [provider.id, provider.defaultModel]),
) as Record<AiChatProvider, AiChatModel>

export const defaultReasoningByProvider = Object.fromEntries(
  providers.map((provider) => [
    provider.id,
    provider.defaultReasoningEffort,
  ]),
) as Record<AiChatProvider, AiReasoningEffort>

export const modelOptionsByProvider = Object.fromEntries(
  providers.map((provider) => [provider.id, provider.models]),
) as Record<AiChatProvider, Array<{ value: AiChatModel; label: string }>>

export const reasoningOptionsByProvider = Object.fromEntries(
  providers.map((provider) => [provider.id, provider.reasoningEfforts]),
) as Record<
  AiChatProvider,
  Array<{ value: AiReasoningEffort; label: string }>
>

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
