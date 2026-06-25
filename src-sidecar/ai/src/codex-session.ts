import {
  Codex,
  type Input as CodexInput,
  type ModelReasoningEffort,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
  type Usage,
} from "@openai/codex-sdk"

import {
  buildCodexPrompt,
  outputSchemaForMode,
  parseCodexStructuredTurn,
  type AiChatMode,
  type DataverseToolRequest,
  type DataverseToolResult,
} from "./dataverse-tools.js"

type LocalSession = {
  thread: Thread
  codexThreadId?: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
  mode?: AiChatMode
}

export type RunCodexTurnInput = {
  threadId: string
  providerThreadId?: string
  codexThreadId?: string
  environmentId?: string
  mode?: AiChatMode
  message: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
  toolResults?: DataverseToolResult[]
  imagePaths?: string[]
}

export type RunCodexTurnResult = {
  threadId: string
  providerThreadId?: string
  codexThreadId?: string
  response: string
  toolRequests: DataverseToolRequest[]
  items: Array<Pick<ThreadItem, "id" | "type">>
  contextUsage?: ProviderContextUsage
}

type ProviderContextUsage = {
  usedTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  autoCompactionEnabled: boolean
  manualCompactionAvailable: boolean
}

function buildCodexInput(prompt: string, imagePaths?: string[]): CodexInput {
  const selectedImagePaths = imagePaths?.filter(Boolean) ?? []

  if (selectedImagePaths.length === 0) {
    return prompt
  }

  return [
    { type: "text", text: prompt },
    ...selectedImagePaths.map((path) => ({
      type: "local_image" as const,
      path,
    })),
  ]
}

function contextUsageFromCodexUsage(
  usage: Usage | null | undefined,
): ProviderContextUsage | undefined {
  if (!usage) {
    return undefined
  }

  return {
    usedTokens: Math.max(0, usage.input_tokens),
    inputTokens: Math.max(0, usage.input_tokens),
    cachedInputTokens: Math.max(0, usage.cached_input_tokens),
    outputTokens: Math.max(0, usage.output_tokens),
    reasoningOutputTokens: Math.max(0, usage.reasoning_output_tokens),
    autoCompactionEnabled: true,
    manualCompactionAvailable: false,
  }
}

export class CodexSessionManager {
  private readonly codex = new Codex()
  private readonly sessions = new Map<string, LocalSession>()

  startThread(input: {
    threadId: string
    providerThreadId?: string
    codexThreadId?: string
    model?: string
    reasoningEffort?: ModelReasoningEffort
    mode?: AiChatMode
  }) {
    const session = this.createSession({
      codexThreadId: input.providerThreadId ?? input.codexThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      mode: input.mode,
    })
    this.sessions.set(input.threadId, session)

    return {
      threadId: input.threadId,
      providerThreadId: session.codexThreadId,
      codexThreadId: session.codexThreadId,
    }
  }

  async runTurn(input: RunCodexTurnInput): Promise<RunCodexTurnResult> {
    const session = this.ensureSession(input)
    const prompt = buildCodexPrompt({
      environmentId: input.environmentId,
      mode: input.mode,
      userMessage: input.message,
      toolResults: input.toolResults,
    })
    const turn = await session.thread.run(
      buildCodexInput(prompt, input.imagePaths),
      {
        outputSchema: outputSchemaForMode(input.mode),
      },
    )

    session.codexThreadId = session.thread.id ?? session.codexThreadId

    let structured = {
      response: turn.finalResponse,
      toolRequests: [] as DataverseToolRequest[],
    }

    try {
      structured = parseCodexStructuredTurn(turn.finalResponse)
    } catch {
      structured.response = turn.finalResponse
    }

    return {
      threadId: input.threadId,
      providerThreadId: session.codexThreadId,
      codexThreadId: session.codexThreadId,
      response: structured.response,
      toolRequests: structured.toolRequests,
      items: turn.items.map((item) => ({ id: item.id, type: item.type })),
      contextUsage: contextUsageFromCodexUsage(turn.usage),
    }
  }

  async runTurnStreamed(
    input: RunCodexTurnInput,
    onEvent: (event: ThreadEvent) => void,
  ): Promise<RunCodexTurnResult> {
    const session = this.ensureSession(input)
    const prompt = buildCodexPrompt({
      environmentId: input.environmentId,
      mode: input.mode,
      userMessage: input.message,
      toolResults: input.toolResults,
    })
    const turn = await session.thread.runStreamed(
      buildCodexInput(prompt, input.imagePaths),
      {
        outputSchema: outputSchemaForMode(input.mode),
      },
    )
    const items: ThreadItem[] = []
    let finalResponse = ""
    let usage: Usage | null = null

    for await (const event of turn.events) {
      onEvent(event)

      if (event.type === "thread.started") {
        session.codexThreadId = event.thread_id
      }

      if (event.type === "item.completed") {
        items.push(event.item)
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
      }

      if (event.type === "turn.failed") {
        throw new Error(event.error.message)
      }

      if (event.type === "turn.completed") {
        usage = event.usage
      }

      if (event.type === "error") {
        throw new Error(event.message)
      }
    }

    session.codexThreadId = session.thread.id ?? session.codexThreadId

    let structured = {
      response: finalResponse,
      toolRequests: [] as DataverseToolRequest[],
    }

    try {
      structured = parseCodexStructuredTurn(finalResponse)
    } catch {
      structured.response = finalResponse
    }

    return {
      threadId: input.threadId,
      providerThreadId: session.codexThreadId,
      codexThreadId: session.codexThreadId,
      response: structured.response,
      toolRequests: structured.toolRequests,
      items: items.map((item) => ({ id: item.id, type: item.type })),
      contextUsage: contextUsageFromCodexUsage(usage),
    }
  }

  private ensureSession(input: RunCodexTurnInput) {
    const existing = this.sessions.get(input.threadId)
    if (
      existing &&
      existing.model === input.model &&
      existing.reasoningEffort === input.reasoningEffort &&
      existing.mode === (input.mode ?? "chat")
    ) {
      return existing
    }

    const codexThreadId =
      input.providerThreadId ?? input.codexThreadId ?? existing?.codexThreadId
    const session = this.createSession({
      codexThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      mode: input.mode,
    })
    this.sessions.set(input.threadId, session)
    return session
  }

  private createSession(input: {
    codexThreadId?: string
    model?: string
    reasoningEffort?: ModelReasoningEffort
    mode?: AiChatMode
  }): LocalSession {
    const mode = input.mode ?? "chat"
    const isExperimentalAgent = mode === "experimental-agent"
    const options = {
      model: input.model,
      sandboxMode: isExperimentalAgent
        ? ("workspace-write" as const)
        : ("read-only" as const),
      approvalPolicy: "never" as const,
      networkAccessEnabled: isExperimentalAgent,
      skipGitRepoCheck: true,
      modelReasoningEffort: input.reasoningEffort,
    }
    const thread = input.codexThreadId
      ? this.codex.resumeThread(input.codexThreadId, options)
      : this.codex.startThread(options)

    return {
      thread,
      codexThreadId: input.codexThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      mode,
    }
  }
}
