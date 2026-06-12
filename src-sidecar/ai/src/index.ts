import process from "node:process"
import { createInterface } from "node:readline"

import { CodexSessionManager } from "./codex-session.js"
import type { DataverseToolResult } from "./dataverse-tools.js"
import type { ModelReasoningEffort, ThreadEvent } from "@openai/codex-sdk"

type SidecarRequest =
  | {
      id: string
      method: "start_thread"
      params: {
        threadId: string
        codexThreadId?: string
        model?: string
        reasoningEffort?: ModelReasoningEffort
      }
    }
  | {
      id: string
      method: "run_turn" | "run_turn_stream"
      params: {
        threadId: string
        codexThreadId?: string
        environmentId?: string
        message: string
        model?: string
        reasoningEffort?: ModelReasoningEffort
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

const manager = new CodexSessionManager()
const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

function writeResponse(response: SidecarResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function handleRequest(request: SidecarRequest) {
  switch (request.method) {
    case "start_thread":
      return manager.startThread(request.params)
    case "run_turn":
      return manager.runTurn(request.params)
    case "run_turn_stream":
      return manager.runTurnStreamed(request.params, (event) => {
        writeResponse({ id: request.id, ok: true, event })
      })
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
