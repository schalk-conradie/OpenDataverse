import process from "node:process"
import { createInterface } from "node:readline"

import type { DataverseToolResult } from "./dataverse-tools.js"
import type { ModelReasoningEffort, ThreadEvent } from "@openai/codex-sdk"
import type { ClaudeReasoningEffort, ClaudeSessionManager } from "./claude-session.js"
import type { CodexSessionManager } from "./codex-session.js"

type AiProvider = "codex" | "claude"

type SidecarRequest =
  | {
      id: string
      method: "start_thread"
      params: {
        threadId: string
        provider?: AiProvider
        providerThreadId?: string
        codexThreadId?: string
        model?: string
        reasoningEffort?: ModelReasoningEffort | ClaudeReasoningEffort
      }
    }
  | {
      id: string
      method: "run_turn" | "run_turn_stream"
      params: {
        threadId: string
        provider?: AiProvider
        providerThreadId?: string
        codexThreadId?: string
        environmentId?: string
        message: string
        model?: string
        reasoningEffort?: ModelReasoningEffort | ClaudeReasoningEffort
        toolResults?: DataverseToolResult[]
      }
    }

type SidecarResponse =
  | {
      id: string
      ok: true
      result: unknown
    }
  | {
      id: string
      ok: false
      error: string
    }
  | {
      id: string
      ok: true
      event: ThreadEvent
    }

let codexManager: CodexSessionManager | undefined
let claudeManager: ClaudeSessionManager | undefined
const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

function writeResponse(response: SidecarResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function getCodexManager() {
  if (!codexManager) {
    const module = await import("./codex-session.js")
    codexManager = new module.CodexSessionManager()
  }

  return codexManager
}

async function getClaudeManager() {
  if (!claudeManager) {
    const module = await import("./claude-session.js")
    claudeManager = new module.ClaudeSessionManager()
  }

  return claudeManager
}

async function handleRequest(request: SidecarRequest) {
  const provider = request.params.provider ?? "codex"

  switch (request.method) {
    case "start_thread":
      if (provider === "claude") {
        const manager = await getClaudeManager()
        return manager.startThread({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return (await getCodexManager()).startThread({
        ...request.params,
        reasoningEffort: request.params
          .reasoningEffort as ModelReasoningEffort | undefined,
      })
    case "run_turn":
      if (provider === "claude") {
        return (await getClaudeManager()).runTurn({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return (await getCodexManager()).runTurn({
        ...request.params,
        reasoningEffort: request.params
          .reasoningEffort as ModelReasoningEffort | undefined,
      })
    case "run_turn_stream":
      if (provider === "claude") {
        return (await getClaudeManager()).runTurnStreamed({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return (await getCodexManager()).runTurnStreamed(
        {
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ModelReasoningEffort | undefined,
        },
        (event) => {
          writeResponse({ id: request.id, ok: true, event })
        },
      )
  }
}

lines.on("line", (line) => {
  void (async () => {
    if (!line.trim()) {
      return
    }

    let request: SidecarRequest
    try {
      request = JSON.parse(line) as SidecarRequest
    } catch (error) {
      writeResponse({
        id: "unknown",
        ok: false,
        error: error instanceof Error ? error.message : "Invalid JSON request",
      })
      return
    }

    try {
      const result = await handleRequest(request)
      writeResponse({ id: request.id, ok: true, result })
    } catch (error) {
      writeResponse({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "AI sidecar request failed",
      })
    }
  })()
})
