import {
  Codex,
  type ModelReasoningEffort,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
} from "@openai/codex-sdk"

import {
  buildCodexPrompt,
  CODEX_TURN_OUTPUT_SCHEMA,
  parseCodexStructuredTurn,
  type DataverseToolRequest,
  type DataverseToolResult,
} from "./dataverse-tools.js"

type LocalSession = {
  thread: Thread
  codexThreadId?: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
}

export type RunCodexTurnInput = {
  threadId: string
  providerThreadId?: string
  codexThreadId?: string
  environmentId?: string
  message: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
  toolResults?: DataverseToolResult[]
}

export type RunCodexTurnResult = {
  threadId: string
  providerThreadId?: string
  codexThreadId?: string
  response: string
  toolRequests: DataverseToolRequest[]
  items: Array<Pick<ThreadItem, "id" | "type">>
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
  }) {
    const session = this.createSession({
      codexThreadId: input.providerThreadId ?? input.codexThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
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
      userMessage: input.message,
      toolResults: input.toolResults,
    })
    const turn = await session.thread.run(prompt, {
      outputSchema: CODEX_TURN_OUTPUT_SCHEMA,
    })

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
    }
  }

  async runTurnStreamed(
    input: RunCodexTurnInput,
    onEvent: (event: ThreadEvent) => void,
  ): Promise<RunCodexTurnResult> {
    const session = this.ensureSession(input)
    const prompt = buildCodexPrompt({
      environmentId: input.environmentId,
      userMessage: input.message,
      toolResults: input.toolResults,
    })
    const turn = await session.thread.runStreamed(prompt, {
      outputSchema: CODEX_TURN_OUTPUT_SCHEMA,
    })
    const items: ThreadItem[] = []
    let finalResponse = ""

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
    }
  }

  private ensureSession(input: RunCodexTurnInput) {
    const existing = this.sessions.get(input.threadId)
    if (
      existing &&
      existing.model === input.model &&
      existing.reasoningEffort === input.reasoningEffort
    ) {
      return existing
    }

    const codexThreadId =
      input.providerThreadId ?? input.codexThreadId ?? existing?.codexThreadId
    const session = this.createSession({
      codexThreadId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    })
    this.sessions.set(input.threadId, session)
    return session
  }

  private createSession(input: {
    codexThreadId?: string
    model?: string
    reasoningEffort?: ModelReasoningEffort
  }): LocalSession {
    const options = {
      model: input.model,
      sandboxMode: "read-only" as const,
      approvalPolicy: "never" as const,
      networkAccessEnabled: false,
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
    }
  }
}
