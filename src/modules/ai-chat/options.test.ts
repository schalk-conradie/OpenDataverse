import { describe, expect, it } from "vitest"

import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  isAiChatModel,
  isAiChatProvider,
  isAiReasoningEffort,
  modelForProvider,
  modelOptionsByProvider,
  providerOptions,
  reasoningOptionsByProvider,
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

  it("keeps providers unique and non-empty", () => {
    const providerIds = providerOptions.map((provider) => provider.value)

    expect(new Set(providerIds).size).toBe(providerIds.length)
    expect(providerIds).toEqual(["codex", "claude"])
  })

  it("keeps every provider with model and reasoning options", () => {
    for (const provider of providerOptions) {
      expect(modelOptionsByProvider[provider.value].length).toBeGreaterThan(0)
      expect(reasoningOptionsByProvider[provider.value].length).toBeGreaterThan(
        0,
      )
    }
  })

  it("offers every GPT-5.6 Codex model", () => {
    expect(modelOptionsByProvider.codex.map((option) => option.value)).toEqual(
      expect.arrayContaining([
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
      ]),
    )
  })

  it("defaults Codex to GPT-5.6 Sol with Light reasoning", () => {
    expect(defaultModelByProvider.codex).toBe("gpt-5.6-sol")
    expect(defaultReasoningByProvider.codex).toBe("low")
    expect(
      reasoningOptionsByProvider.codex.find((option) => option.value === "low"),
    ).toEqual({ value: "low", label: "Light" })
  })

  it("falls back to the provider default for invalid models", () => {
    expect(modelForProvider("codex", "not-a-model")).toBe(
      defaultModelByProvider.codex,
    )
  })

  it("keeps valid provider models unchanged", () => {
    expect(modelForProvider("claude", "claude-sonnet-4-6")).toBe(
      "claude-sonnet-4-6",
    )
  })

  it("rejects invalid providers, models, and reasoning efforts", () => {
    expect(isAiChatProvider("not-a-provider")).toBe(false)
    expect(isAiChatModel("codex", "not-a-model")).toBe(false)
    expect(isAiReasoningEffort("claude", "xhigh")).toBe(false)
  })
})
