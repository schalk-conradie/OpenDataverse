import { describe, expect, it } from "vitest"

import {
  defaultAiChatState,
  getAiChatWindowState,
} from "@/modules/ai-chat/chat-state"
import type {
  AiChatAttachmentBundle,
  AiChatThread,
} from "@/modules/ai-chat/types"

const attachmentBundle: AiChatAttachmentBundle = {
  attachments: [
    {
      id: "attachment-1",
      kind: "file",
      path: "C:\\temp\\context.txt",
      name: "context.txt",
      status: "included",
      contextIncluded: true,
      imageIncluded: false,
      sizeBytes: 128,
      mimeType: "text/plain",
    },
  ],
  context: "context",
  imagePaths: [],
  warnings: [],
}

const thread: AiChatThread = {
  id: "thread-1",
  environmentId: "environment-1",
  mode: "chat",
  provider: "claude",
  providerThreadId: "provider-thread-1",
  model: "claude-sonnet-4-6",
  reasoningEffort: "high",
  title: "Stored chat",
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-10T08:01:00.000Z",
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "Hello",
      createdAt: "2026-07-10T08:00:00.000Z",
      status: "complete",
    },
  ],
}

describe("AI chat window state parsing", () => {
  it("returns defaults for absent and non-object state", () => {
    expect(getAiChatWindowState({})).toBe(defaultAiChatState)
    expect(
      getAiChatWindowState({ state: { aiChat: "not-an-object" } }),
    ).toBe(defaultAiChatState)
  })

  it("restores a valid thread and attachment bundle", () => {
    const state = getAiChatWindowState({
      state: {
        aiChat: {
          thread,
          provider: "codex",
          model: "gpt-5.5",
          reasoningEffort: "low",
          composerValue: "Draft",
          pendingAttachments: attachmentBundle,
          running: true,
          settingsVersion: 5,
        },
      },
    })

    expect(state).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-4-6",
      reasoningEffort: "low",
      composerValue: "Draft",
      pendingAttachments: attachmentBundle,
      running: true,
      settingsVersion: 5,
    })
    expect(state.thread).toMatchObject({
      id: thread.id,
      provider: "claude",
      providerThreadId: "provider-thread-1",
      messages: thread.messages,
    })
  })

  it("discards malformed runtime fields instead of trusting stored values", () => {
    const state = getAiChatWindowState({
      state: {
        aiChat: {
          thread: { ...thread, messages: "not-an-array" },
          provider: "not-a-provider",
          model: 42,
          reasoningEffort: "impossible",
          composerValue: 42,
          pendingAttachments: {
            ...attachmentBundle,
            attachments: [
              { ...attachmentBundle.attachments[0], status: "queued" },
            ],
          },
          running: "false",
          error: { message: "broken" },
          settingsVersion: "5",
        },
      },
    })

    expect(state).toMatchObject(defaultAiChatState)
    expect(state.thread).toBeUndefined()
    expect(state.error).toBeUndefined()
  })

  it("migrates obsolete provider defaults while preserving current choices", () => {
    const migrated = getAiChatWindowState({
      state: {
        aiChat: {
          provider: "codex",
          model: "gpt-5.5",
          reasoningEffort: "xhigh",
          composerValue: "",
          running: false,
        },
      },
    })
    const current = getAiChatWindowState({
      state: {
        aiChat: {
          provider: "codex",
          model: "gpt-5.5",
          reasoningEffort: "xhigh",
          composerValue: "",
          running: false,
          settingsVersion: 5,
        },
      },
    })

    expect(migrated.model).toBe(defaultAiChatState.model)
    expect(migrated.reasoningEffort).toBe(defaultAiChatState.reasoningEffort)
    expect(current.model).toBe("gpt-5.5")
    expect(current.reasoningEffort).toBe("xhigh")
  })
})
