import { describe, expect, it } from "vitest"

import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  isAiChatModel,
  isAiChatProvider,
  isAiReasoningEffort,
  providerOptions,
} from "@/modules/ai-chat/options"

describe("AI chat model catalog", () => {
  it("keeps each provider default in its selectable options", () => {
    for (const provider of providerOptions) {
      expect(isAiChatProvider(provider.value)).toBe(true)
      expect(
        isAiChatModel(provider.value, defaultModelByProvider[provider.value]),
      ).toBe(true)
      expect(
        isAiReasoningEffort(
          provider.value,
          defaultReasoningByProvider[provider.value],
        ),
      ).toBe(true)
    }
  })
})
