export type DataverseToolName =
  | "dataverse_whoami"
  | "dataverse_list_entity_sets"
  | "dataverse_get"
  | "dataverse_metadata"

export type DataverseToolRequest = {
  name: DataverseToolName
  arguments: Record<string, unknown>
}

export type DataverseToolResult = {
  name: DataverseToolName
  arguments: Record<string, unknown>
  ok: boolean
  result?: unknown
  error?: string
}

export type AiStructuredTurn = {
  response: string
  toolRequests: DataverseToolRequest[]
}

export const OPEN_DATAVERSE_BASE_PROMPT = `You are the OpenDataverse AI module.
Help the user inspect Dataverse metadata and records for the selected environment.
Use only the listed Dataverse read tools for Dataverse data.
Do not ask for, reveal, store, or print access tokens or refresh tokens.
Treat all Dataverse operations as read-only.
Prefer small, bounded OData queries.
Never create, update, delete, publish, import, or execute Dataverse actions.
For greetings or other non-Dataverse messages, answer briefly and return no tool requests.
If tool results are already available for this turn, answer from those results and return no tool requests unless a small additional read is truly required.
If a small additional read is required, return it in toolRequests instead of telling the user what the next read should be.
Do not produce a final answer until you have enough Dataverse data to answer the user's question, or until a needed read is unavailable.
Format the response field as concise GitHub-flavored Markdown when structure helps. Do not use raw HTML.
Return structured output that matches the provided schema.`

export const AI_TURN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    response: {
      type: "string",
      description:
        "Assistant response for the user. Use concise GitHub-flavored Markdown when structure helps. If tool data is required first, keep this short.",
    },
    toolRequests: {
      type: "array",
      description: "Dataverse read-only tool calls for OpenDataverse to execute.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            enum: [
              "dataverse_whoami",
              "dataverse_list_entity_sets",
              "dataverse_get",
              "dataverse_metadata",
            ],
          },
          arguments: {
            type: "object",
            additionalProperties: false,
            properties: {
              search: {
                type: "string",
                description:
                  "Local entity metadata search text, or an empty string when unused.",
              },
              logicalName: {
                type: "string",
                description:
                  "Dataverse entity logical name, or an empty string when unused.",
              },
              path: {
                type: "string",
                description:
                  "Relative Dataverse Web API path, such as accounts?$select=name,accountid&$top=5, or an empty string when unused.",
              },
            },
            required: ["search", "logicalName", "path"],
          },
        },
        required: ["name", "arguments"],
      },
    },
  },
  required: ["response", "toolRequests"],
} as const

export const CODEX_TURN_OUTPUT_SCHEMA = AI_TURN_OUTPUT_SCHEMA

export function buildDataverseTurnPrompt(input: {
  environmentId?: string
  userMessage: string
  toolResults?: DataverseToolResult[]
}) {
  const toolResults =
    input.toolResults && input.toolResults.length > 0
      ? JSON.stringify(input.toolResults, null, 2)
      : "[]"

  return `${OPEN_DATAVERSE_BASE_PROMPT}

Selected environment id: ${input.environmentId ?? "none"}

Available tools:
- dataverse_whoami: no arguments
- dataverse_list_entity_sets: optional { "search": "account" }
- dataverse_metadata: optional { "logicalName": "account" }
- dataverse_get: { "path": "accounts?$select=name,accountid&$top=5" }

Every tool request must include an arguments object with string fields "search", "logicalName", and "path". Use an empty string for unused fields.

Tool results already available for this turn:
${toolResults}

When tool results are not empty, produce a useful final answer for the user from those results.

User message:
${input.userMessage}`
}

export function buildCodexPrompt(input: {
  environmentId?: string
  userMessage: string
  toolResults?: DataverseToolResult[]
}) {
  return buildDataverseTurnPrompt(input)
}

export function parseAiStructuredTurn(value: unknown): AiStructuredTurn {
  const parsed =
    typeof value === "string"
      ? (JSON.parse(value) as Partial<AiStructuredTurn>)
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as Partial<AiStructuredTurn>)
        : {}

  return {
    response: typeof parsed.response === "string" ? parsed.response : "",
    toolRequests: Array.isArray(parsed.toolRequests)
      ? parsed.toolRequests.filter(isDataverseToolRequest)
      : [],
  }
}

export function parseCodexStructuredTurn(value: string): AiStructuredTurn {
  return parseAiStructuredTurn(value)
}

function isDataverseToolRequest(value: unknown): value is DataverseToolRequest {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<DataverseToolRequest>
  return (
    typeof candidate.name === "string" &&
    [
      "dataverse_whoami",
      "dataverse_list_entity_sets",
      "dataverse_get",
      "dataverse_metadata",
    ].includes(candidate.name) &&
    Boolean(candidate.arguments) &&
    typeof candidate.arguments === "object" &&
    !Array.isArray(candidate.arguments)
  )
}
