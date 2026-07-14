import { describe, expect, it } from "vitest"

import {
  attachmentTitle,
  contextUsageTitle,
  contextUsageTone,
  createChatTitle,
  createUserMessage,
  formatAttachmentSize,
  formatChatTimestamp,
  formatTokenCount,
  getContextUsageFromMessages,
  getMessageAttachments,
  getProviderThreadIdFromMessages,
  isAiChatAttachment,
  isAiChatContextUsage,
  isAiChatMessage,
  pastedFileLooksLikeImage,
  pastedImageMimeType,
  upsertMessage,
} from "@/modules/ai-chat/chat-domain"
import type {
  AiChatAttachment,
  AiChatAttachmentBundle,
  AiChatContextUsage,
  AiChatMessage,
} from "@/modules/ai-chat/types"

const attachment: AiChatAttachment = {
  id: "attachment-1",
  kind: "image",
  path: "C:\\temp\\diagram.png",
  name: "diagram.png",
  status: "included",
  contextIncluded: false,
  imageIncluded: true,
  sizeBytes: 2048,
  mimeType: "image/png",
}

const contextUsage: AiChatContextUsage = {
  provider: "codex",
  model: "gpt-5.5",
  usedTokens: 42_000,
  inputTokens: 40_000,
  cachedInputTokens: 1_000,
  outputTokens: 900,
  reasoningOutputTokens: 100,
  updatedAt: "2026-07-10T08:00:00.000Z",
  contextWindowTokens: 100_000,
  percentFull: 42,
  autoCompactionEnabled: true,
  manualCompactionAvailable: false,
}

const firstMessage: AiChatMessage = {
  id: "message-1",
  role: "user",
  content: "First",
  createdAt: "2026-07-10T08:00:00.000Z",
  status: "complete",
}

describe("AI chat runtime values", () => {
  it("narrows complete messages, attachments, and context usage", () => {
    expect(isAiChatMessage(firstMessage)).toBe(true)
    expect(isAiChatAttachment(attachment)).toBe(true)
    expect(isAiChatContextUsage(contextUsage)).toBe(true)
  })

  it("rejects values that omit or mistype required runtime fields", () => {
    expect(isAiChatMessage({ ...firstMessage, role: "operator" })).toBe(false)
    expect(
      isAiChatAttachment({ ...attachment, contextIncluded: "yes" }),
    ).toBe(false)
    expect(
      isAiChatAttachment({
        id: attachment.id,
        kind: attachment.kind,
        path: attachment.path,
        name: attachment.name,
      }),
    ).toBe(false)
    expect(
      isAiChatContextUsage({
        ...contextUsage,
        manualCompactionAvailable: "yes",
      }),
    ).toBe(false)
    expect(
      isAiChatContextUsage({ ...contextUsage, usedTokens: Number.NaN }),
    ).toBe(false)
  })
})

describe("AI chat context usage", () => {
  it("returns the newest valid usage while ignoring malformed metadata", () => {
    const olderUsage = { ...contextUsage, usedTokens: 20_000, percentFull: 20 }
    const messages: AiChatMessage[] = [
      {
        ...firstMessage,
        metadata: { contextUsage: olderUsage },
      },
      {
        ...firstMessage,
        id: "message-2",
        role: "assistant",
        metadata: {
          contextUsage: { ...contextUsage, usedTokens: Number.POSITIVE_INFINITY },
        },
      },
    ]

    expect(getContextUsageFromMessages(messages)).toEqual(olderUsage)

    messages.push({
      ...firstMessage,
      id: "message-3",
      role: "assistant",
      metadata: { contextUsage },
    })

    expect(getContextUsageFromMessages(messages)).toBe(contextUsage)
  })

  it("returns undefined when no message has valid usage", () => {
    expect(getContextUsageFromMessages([firstMessage])).toBeUndefined()
  })

  it("formats context usage consistently at each warning threshold", () => {
    expect(contextUsageTone()).toBe("neutral")
    expect(contextUsageTone({ ...contextUsage, percentFull: 84.9 })).toBe("ok")
    expect(contextUsageTone({ ...contextUsage, percentFull: 85 })).toBe(
      "warning",
    )
    expect(contextUsageTone({ ...contextUsage, percentFull: 95 })).toBe(
      "critical",
    )
    expect(contextUsageTitle(contextUsage)).toContain(
      "Provider-managed auto compaction can run when needed.",
    )
  })
})

describe("AI chat attachments", () => {
  it("extracts only complete attachments from message metadata", () => {
    const message: AiChatMessage = {
      ...firstMessage,
      metadata: {
        attachments: [
          attachment,
          { ...attachment, id: "invalid", status: "queued" },
          "not-an-attachment",
        ],
      },
    }

    expect(getMessageAttachments(message)).toEqual([attachment])
    expect(getMessageAttachments(firstMessage)).toEqual([])
  })

  it("preserves attachment details on a constructed user message", () => {
    const bundle: AiChatAttachmentBundle = {
      attachments: [attachment],
      context: "attached context",
      imagePaths: [attachment.path],
      warnings: [],
    }
    const message = createUserMessage(
      "message-2",
      "Use this",
      "2026-07-10T08:01:00.000Z",
      bundle,
    )

    expect(getMessageAttachments(message)).toEqual([attachment])
    expect(message.metadata).toMatchObject({
      attachmentContextChars: bundle.context.length,
      imagePathCount: 1,
    })
    expect(
      createUserMessage(
        "message-3",
        "No files",
        "2026-07-10T08:02:00.000Z",
      ).metadata,
    ).toBeUndefined()
  })

  it("recognizes pasted image names and derives their MIME types", () => {
    expect(
      pastedFileLooksLikeImage({ name: "diagram.PNG", type: "" }),
    ).toBe(true)
    expect(
      pastedFileLooksLikeImage({ name: "diagram.txt", type: "text/plain" }),
    ).toBe(false)
    expect(pastedImageMimeType({ name: "photo.jpg", type: "" })).toBe(
      "image/jpeg",
    )
    expect(
      pastedImageMimeType({ name: "clipboard", type: "image/avif" }),
    ).toBe("image/avif")
  })

  it("formats attachment sizes and tooltip details", () => {
    expect(formatAttachmentSize()).toBeUndefined()
    expect(formatAttachmentSize(512)).toBe("512 B")
    expect(formatAttachmentSize(2048)).toBe("2 KB")
    expect(formatAttachmentSize(1_572_864)).toBe("1.5 MB")
    expect(attachmentTitle(attachment)).toBe(
      "C:\\temp\\diagram.png\nimage/png\n2 KB",
    )
  })
})

describe("AI chat messages", () => {
  it("appends new messages and replaces matching messages without mutation", () => {
    const replacement: AiChatMessage = {
      ...firstMessage,
      content: "Updated",
      status: "streaming",
    }
    const appended: AiChatMessage = {
      ...firstMessage,
      id: "message-2",
      content: "Second",
    }
    const source = [firstMessage]

    expect(upsertMessage(source, replacement)).toEqual([replacement])
    expect(upsertMessage(source, appended)).toEqual([firstMessage, appended])
    expect(source).toEqual([firstMessage])
  })

  it("normalizes, defaults, and truncates generated titles", () => {
    expect(createChatTitle("  Inspect\n account   metadata ")).toBe(
      "Inspect account metadata",
    )
    expect(createChatTitle("  \n ")).toBe("Dataverse Chat")
    expect(createChatTitle("x".repeat(81))).toBe(`${"x".repeat(80)}...`)
  })

  it("uses the newest tool provider thread identifier", () => {
    const messages: AiChatMessage[] = [
      {
        ...firstMessage,
        role: "tool",
        metadata: { providerThreadId: "thread-old" },
      },
      {
        ...firstMessage,
        id: "message-2",
        role: "tool",
        metadata: { codexThreadId: "thread-new" },
      },
    ]

    expect(getProviderThreadIdFromMessages(messages)).toBe("thread-new")
  })

  it("keeps compact token and invalid timestamp formatting stable", () => {
    expect(formatTokenCount(999.5)).toBe("1000")
    expect(formatTokenCount(1_499)).toBe("1k")
    expect(formatTokenCount(1_500_000)).toBe("1.5M")
    expect(formatChatTimestamp("not-a-date")).toBe("not-a-date")
  })
})
