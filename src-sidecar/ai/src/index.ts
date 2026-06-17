import process from "node:process"
import { createInterface } from "node:readline"

import { ClaudeSessionManager, type ClaudeReasoningEffort } from "./claude-session.js"
import { CodexSessionManager } from "./codex-session.js"
import type { DataverseToolResult } from "./dataverse-tools.js"
import type { ModelReasoningEffort, ThreadEvent } from "@openai/codex-sdk"

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

const codexManager = new CodexSessionManager()
const claudeManager = new ClaudeSessionManager()
const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

function writeResponse(response: SidecarResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function handleRequest(request: SidecarRequest) {
  const provider = request.params.provider ?? "codex"

  switch (request.method) {
    case "start_thread":
      if (provider === "claude") {
        return claudeManager.startThread({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return codexManager.startThread({
        ...request.params,
        reasoningEffort: request.params
          .reasoningEffort as ModelReasoningEffort | undefined,
      })
    case "run_turn":
      if (provider === "claude") {
        return claudeManager.runTurn({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return codexManager.runTurn({
        ...request.params,
        reasoningEffort: request.params
          .reasoningEffort as ModelReasoningEffort | undefined,
      })
    case "run_turn_stream":
      if (provider === "claude") {
        return claudeManager.runTurnStreamed({
          ...request.params,
          reasoningEffort: request.params
            .reasoningEffort as ClaudeReasoningEffort | undefined,
        })
      }

      return codexManager.runTurnStreamed(
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
