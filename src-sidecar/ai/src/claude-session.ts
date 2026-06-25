import process from "node:process"
import { randomUUID } from "node:crypto"

import {
  query,
  type EffortLevel,
  type PermissionResult,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk"

import {
  basePromptForMode,
  buildDataverseTurnPrompt,
  outputSchemaForMode,
  parseAiStructuredTurn,
  type AiChatMode,
  type DataverseToolRequest,
  type DataverseToolResult,
} from "./dataverse-tools.js"

type ClaudeSession = {
  providerThreadId?: string
  model?: string
  reasoningEffort?: ClaudeReasoningEffort
  mode?: AiChatMode
  started: boolean
}

export type ClaudeReasoningEffort = Extract<
  EffortLevel,
  "low" | "medium" | "high" | "xhigh" | "max"
>

export type RunClaudeTurnInput = {
  threadId: string
  providerThreadId?: string
  environmentId?: string
  mode?: AiChatMode
  message: string
  model?: string
  reasoningEffort?: ClaudeReasoningEffort
  toolResults?: DataverseToolResult[]
  imagePaths?: string[]
}

export type RunClaudeTurnResult = {
  threadId: string
  providerThreadId?: string
  response: string
  toolRequests: DataverseToolRequest[]
  items: Array<{ id: string; type: string }>
  contextUsage?: ProviderContextUsage
}

type ProviderContextUsage = {
  usedTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  contextWindowTokens?: number
  percentFull?: number
  autoCompactionEnabled: boolean
  manualCompactionAvailable: boolean
}

const defaultClaudeModel = "claude-sonnet-4-6"
const defaultClaudeReasoningEffort: ClaudeReasoningEffort = "medium"

function denyClaudeToolUse(): PermissionResult {
  return {
    behavior: "deny",
    message:
      "OpenDataverse AI Chat does not expose Claude tools. Request one of the listed Dataverse read tools in structured output instead.",
    decisionClassification: "user_reject",
  }
}

function extractAssistantText(message: unknown) {
  const content = (message as { content?: unknown })?.content
  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return ""
      }

      const candidate = block as { type?: unknown; text?: unknown }
      return candidate.type === "text" && typeof candidate.text === "string"
        ? candidate.text
        : ""
    })
    .filter(Boolean)
    .join("\n")
}

function resultErrorMessage(result: SDKResultMessage) {
  if (result.subtype === "success") {
    return undefined
  }

  if ("errors" in result && result.errors.length > 0) {
    return result.errors.join(" ")
  }

  return result.stop_reason ?? "Claude request failed."
}

function safeTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
}

function contextWindowFromClaudeResult(
  result: SDKResultMessage,
  model?: string,
) {
  const preferred = model ? result.modelUsage[model]?.contextWindow : undefined
  if (typeof preferred === "number" && preferred > 0) {
    return preferred
  }

  return Object.values(result.modelUsage).find(
    (usage) => usage.contextWindow > 0,
  )?.contextWindow
}

function contextUsageFromClaudeResult(
  result: SDKResultMessage,
  model?: string,
): ProviderContextUsage {
  const inputTokens = safeTokenCount(result.usage.input_tokens)
  const cacheReadInputTokens = safeTokenCount(
    result.usage.cache_read_input_tokens,
  )
  const cacheCreationInputTokens = safeTokenCount(
    result.usage.cache_creation_input_tokens,
  )
  const outputTokens = safeTokenCount(result.usage.output_tokens)
  const contextWindowTokens = contextWindowFromClaudeResult(result, model)
  const percentFull =
    contextWindowTokens && contextWindowTokens > 0
      ? (inputTokens / contextWindowTokens) * 100
      : undefined

  return {
    usedTokens: inputTokens,
    inputTokens,
    cachedInputTokens: cacheReadInputTokens + cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    contextWindowTokens,
    percentFull,
    autoCompactionEnabled: false,
    manualCompactionAvailable: false,
  }
}

function createSession(input: {
  providerThreadId?: string
  model?: string
  reasoningEffort?: ClaudeReasoningEffort
  mode?: AiChatMode
}): ClaudeSession {
  return {
    providerThreadId: input.providerThreadId,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    mode: input.mode ?? "chat",
    started: Boolean(input.providerThreadId),
  }
}

export class ClaudeSessionManager {
  private readonly sessions = new Map<string, ClaudeSession>()

  startThread(input: {
    threadId: string
    providerThreadId?: string
    model?: string
    reasoningEffort?: ClaudeReasoningEffort
    mode?: AiChatMode
  }) {
    const session = createSession({
      providerThreadId: input.providerThreadId ?? randomUUID(),
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      mode: input.mode,
    })
    session.started = Boolean(input.providerThreadId)
    this.sessions.set(input.threadId, session)

    return {
      threadId: input.threadId,
      providerThreadId: session.providerThreadId,
    }
  }

  async runTurn(input: RunClaudeTurnInput): Promise<RunClaudeTurnResult> {
    const session = this.ensureSession(input)
    const prompt = buildDataverseTurnPrompt({
      environmentId: input.environmentId,
      mode: input.mode,
      userMessage: input.message,
      toolResults: input.toolResults,
    })
    const result = await this.runClaudeQuery(prompt, session, input.mode)
    session.providerThreadId = result.session_id ?? session.providerThreadId
    session.started = true

    const structured =
      result.subtype === "success" && result.structured_output !== undefined
        ? parseAiStructuredTurn(result.structured_output)
        : parseAiStructuredTurn(result.result)

    return {
      threadId: input.threadId,
      providerThreadId: session.providerThreadId,
      response: structured.response,
      toolRequests: structured.toolRequests,
      items: [
        {
          id: result.uuid,
          type: result.type,
        },
      ],
      contextUsage: contextUsageFromClaudeResult(result, session.model),
    }
  }

  async runTurnStreamed(
    input: RunClaudeTurnInput,
  ): Promise<RunClaudeTurnResult> {
    return this.runTurn(input)
  }

  private ensureSession(input: RunClaudeTurnInput) {
    const existing = this.sessions.get(input.threadId)
    if (
      existing &&
      existing.model === input.model &&
      existing.reasoningEffort === input.reasoningEffort &&
      existing.mode === (input.mode ?? "chat")
    ) {
      return existing
    }

    const session = createSession({
      providerThreadId: input.providerThreadId ?? existing?.providerThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      mode: input.mode,
    })
    this.sessions.set(input.threadId, session)
    return session
  }

  private async runClaudeQuery(
    prompt: string,
    session: ClaudeSession,
    mode?: AiChatMode,
  ) {
    const outputFormatSchema = outputSchemaForMode(mode) as unknown as Record<
      string,
      unknown
    >
    const messages = query({
      prompt,
      options: {
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "opendataverse-ai/0.1.0",
        },
        model: session.model ?? defaultClaudeModel,
        effort: session.reasoningEffort ?? defaultClaudeReasoningEffort,
        outputFormat: {
          type: "json_schema",
          schema: outputFormatSchema,
        },
        systemPrompt: basePromptForMode(mode),
        settingSources: [],
        tools: [],
        allowedTools: [],
        mcpServers: {},
        strictMcpConfig: true,
        skills: [],
        permissionMode: "dontAsk",
        canUseTool: async () => denyClaudeToolUse(),
        ...(session.providerThreadId && session.started
          ? { resume: session.providerThreadId }
          : {}),
        ...(session.providerThreadId && !session.started
          ? { sessionId: session.providerThreadId }
          : {}),
      },
    })
    let result: SDKResultMessage | undefined
    let assistantText = ""

    for await (const message of messages) {
      this.captureSessionId(session, message)

      if (message.type === "assistant") {
        assistantText = extractAssistantText(message.message) || assistantText
      }

      if (message.type === "result") {
        result = message
      }
    }

    if (!result) {
      throw new Error(
        assistantText || "Claude finished without returning a result message.",
      )
    }

    if (result.subtype !== "success") {
      throw new Error(resultErrorMessage(result) ?? "Claude request failed.")
    }

    return result
  }

  private captureSessionId(session: ClaudeSession, message: SDKMessage) {
    if ("session_id" in message && typeof message.session_id === "string") {
      session.providerThreadId = message.session_id
    }
  }
}
