# AI Module Technical Design

Last reviewed: 2026-06-12

## Goal

Add an AI Chat module to OpenDataverse that lets a signed-in user ask Dataverse
questions in natural language, with Codex performing reasoning and tool use while
OpenDataverse keeps ownership of Dataverse authentication.

The first useful scenario is a chat interface that can do the same read-only
work as the local `dynamics-webapi` skill:

- verify the selected environment with `WhoAmI`
- list Dataverse entity sets
- inspect entity metadata
- run bounded OData GET queries
- summarize returned records

The AI module must reuse the existing OpenDataverse auth used for web resource
publishing. It must not require a second Azure CLI login flow, a separate
`token.json`, or direct Codex access to refresh tokens.

## Current App Context

Relevant existing code:

- `src/modules/tool-registry.ts` owns sidebar module registration.
- `src/core/dataverse/schemas.ts` owns `ToolId`, `ToolWindow`, environment, and
  Dataverse data schemas.
- `src/core/desktop/bridge.ts` wraps Tauri `invoke(...)` calls for the React UI.
- `src-tauri/src/lib.rs` owns config storage, browser auth, token storage,
  token refresh, Dataverse GET helpers, and publish helpers.

The existing Rust backend already has the right auth primitives:

- `load_token(app, environment_id)`
- `refresh_token(app, environment, token)`
- `access_token_for(app, environment)`
- `dataverse_get(app, environment, path, query)`
- `dataverse_json_request(...)`

The AI module should extend these primitives, not replace them.

## External Tooling Facts

Use current OpenAI docs when implementing. As of 2026-06-12:

- The Codex SDK is intended to programmatically control local Codex agents and
  can be integrated into internal applications and workflows.
- The TypeScript SDK package is `@openai/codex-sdk`; it must run server-side and
  requires Node.js 18 or later.
- Codex supports ChatGPT subscription auth and API-key auth. For this desktop
  app, use the user's local Codex auth. Do not embed a shared OpenAI key.
- Codex can also run as an MCP server via `codex mcp-server`, but that is better
  for multi-agent orchestration than the initial in-app chat.
- OpenAI tool patterns support wrapping local logic as function tools. The same
  idea should be used here: expose app-owned Dataverse operations as tools.

References:

- https://developers.openai.com/codex/sdk
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/guides/agents-sdk
- https://developers.openai.com/api/docs/guides/tools

## Recommendation

Build the first version as a local, trusted AI Chat module backed by a Node
sidecar that uses `@openai/codex-sdk`.

The Codex SDK should not be imported into the React renderer because the SDK is
server-side only. The renderer should talk to the Tauri backend. The Tauri
backend should either:

1. spawn a managed Node sidecar that owns Codex SDK thread state, or
2. expose Tauri commands that proxy to a long-running local Node service.

Prefer option 1 for desktop packaging: a managed sidecar keeps the dependency
local to the app and avoids requiring the user to start another service.

## High-Level Architecture

```text
React AI Chat module
  -> src/core/desktop/ai-bridge.ts
    -> Tauri commands
      -> AI sidecar process using @openai/codex-sdk
        -> Codex local agent authenticated with user's Codex login
        -> app-provided Dataverse tool calls
          -> Tauri backend Dataverse read commands
            -> access_token_for(...)
            -> Dataverse Web API
```

Codex auth and Dataverse auth are separate:

- Codex/OpenAI auth: user's local Codex/ChatGPT subscription or API-key login.
- Dataverse auth: existing OpenDataverse environment auth and refresh tokens.

Never pass the Dataverse refresh token to Codex or the renderer.

## User Experience

Add a sidebar item:

- id: `ai-chat`
- title: `AI Chat`
- description: `Ask Dataverse questions`
- icon: use a Lucide chat/sparkles icon that fits the current sidebar style
- status: `ready` once implemented

Initial screen:

- chat transcript area
- composer at the bottom
- selected environment indicator
- compact status row for `Connected`, `No environment`, `Codex not signed in`,
  `Running`, and `Tool used`
- optional tool event disclosure under assistant messages

Do not make a landing page. The first screen should be the chat itself.

Suggested starter prompts when an environment is selected:

- `Who am I connected as?`
- `List entity sets related to account.`
- `Show account metadata for the primary name and created fields.`
- `Get the first 5 accounts with name and accountid.`

## Frontend Implementation

Add:

- `src/modules/ai-chat/AiChatModule.tsx`
- `src/modules/ai-chat/types.ts`
- `src/modules/ai-chat/message-store.ts` if local module state grows
- `src/core/desktop/ai-bridge.ts`

Update:

- `ToolId` in `src/core/dataverse/schemas.ts`
- `toolRegistry` in `src/modules/tool-registry.ts`
- `renderToolWindow(...)` in `src/App.tsx`

Suggested TypeScript types:

```ts
export type AiChatRole = "user" | "assistant" | "tool" | "system"

export type AiChatMessage = {
  id: string
  role: AiChatRole
  content: string
  createdAt: string
  status?: "pending" | "streaming" | "complete" | "error"
  toolName?: string
  metadata?: Record<string, unknown>
}

export type AiChatThread = {
  id: string
  environmentId?: string
  codexThreadId?: string
  title: string
  createdAt: string
  updatedAt: string
  messages: AiChatMessage[]
}
```

Bridge functions:

```ts
export async function startAiChatThread(input: {
  environmentId?: string
}): Promise<AiChatThread>

export async function sendAiChatMessage(input: {
  threadId: string
  environmentId?: string
  message: string
}): Promise<AiChatMessage[]>
```

Streaming can be added later. For the first implementation, returning the
updated message list after each turn is acceptable.

## Backend Implementation

Add Tauri commands:

```rust
start_ai_chat_thread(environment_id: Option<String>) -> AiChatThread
send_ai_chat_message(thread_id: String, environment_id: Option<String>, message: String) -> Vec<AiChatMessage>
dataverse_ai_whoami(environment: DataverseEnvironment) -> serde_json::Value
dataverse_ai_list_entity_sets(environment: DataverseEnvironment) -> serde_json::Value
dataverse_ai_get(environment: DataverseEnvironment, path: String) -> serde_json::Value
dataverse_ai_metadata(environment: DataverseEnvironment, logical_name: Option<String>) -> serde_json::Value
```

The `dataverse_ai_*` commands should call `dataverse_get(...)` so they inherit
the current token refresh behavior. They should return sanitized JSON. They
should not expose access tokens, refresh tokens, local token paths, or raw config
paths.

Recommended Dataverse command behavior:

- `dataverse_ai_whoami`: GET `/WhoAmI`
- `dataverse_ai_list_entity_sets`: GET `/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName`
- `dataverse_ai_metadata`: GET metadata for all or one entity with bounded fields
- `dataverse_ai_get`: accept only relative API paths or entity-set paths

`dataverse_ai_get` validation:

- reject absolute URLs
- reject non-GET operations
- normalize leading `/api/data/v9.2/`
- allow only paths under `/api/data/v9.2/`
- require `$top` or inject a conservative default, such as `$top=25`
- cap requested `$top` to a maximum, such as 100
- allow OData query options needed for read-only exploration:
  `$select`, `$filter`, `$orderby`, `$expand`, `$count`, `$top`, `$skiptoken`
- reject attempts to call action/function endpoints that can mutate state

## Codex Sidecar Design

Create a sidecar package under a clear local boundary, for example:

```text
src-sidecar/ai/
  package.json
  tsconfig.json
  src/index.ts
  src/codex-session.ts
  src/dataverse-tools.ts
```

The sidecar should:

- start on demand when the AI module is first opened
- maintain a map from OpenDataverse `AiChatThread.id` to Codex `threadId`
- call `new Codex().startThread()` for new conversations
- call `codex.resumeThread(codexThreadId)` for existing conversations
- send a system/base prompt that defines the AI module contract
- expose app-owned Dataverse tools, not raw shell access to token files

Important: do not let Codex execute arbitrary shell commands for Dataverse
queries in v1. Keep Dataverse access behind the restricted backend commands.
This preserves the existing app security model and keeps the skill behavior
read-only.

Suggested base prompt:

```text
You are the OpenDataverse AI module. Help the user inspect Dataverse metadata
and records for the currently selected environment. Use only the provided
Dataverse read tools for Dataverse data. Do not ask for, reveal, store, or print
access tokens or refresh tokens. Treat all Dataverse operations as read-only.
Prefer small, bounded OData queries. Explain assumptions and ask for clarification
before broad queries. Never create, update, delete, publish, import, or execute
Dataverse actions.
```

## Tool Contract

Expose these tools to the sidecar/Codex layer:

### `dataverse_whoami`

Input:

```json
{}
```

Returns the current `WhoAmI` payload for the selected environment.

### `dataverse_list_entity_sets`

Input:

```json
{
  "search": "account"
}
```

Returns a bounded list of logical names and entity set names. `search` is
optional and should filter locally if the metadata response is large.

### `dataverse_get`

Input:

```json
{
  "path": "accounts?$select=name,accountid&$top=5"
}
```

Returns raw Dataverse JSON with response size limits. If the response includes
`@odata.nextLink`, return it as metadata but do not auto-page unless the user
asks.

### `dataverse_metadata`

Input:

```json
{
  "logicalName": "account"
}
```

Returns entity metadata summary and selected attributes. Keep large metadata
payloads summarized or bounded.

## Reusing the `dynamics-webapi` Skill

Do not run the existing `dynamics-webapi` script directly in v1.

That skill is useful as a behavior reference, but it expects `token.json` or
Azure CLI login. OpenDataverse already owns a better auth path. Reusing the
script would either duplicate login or require creating temporary token files,
which is weaker than app-owned commands.

Instead, mirror the skill's read-only actions through backend commands:

- `whoami`
- `health`
- `list`
- `metadata`
- `get`

Optional v2: provide a compatibility layer that lets Codex invoke a local skill
runner, but injects an app-owned `dataverse_get` adapter instead of token files.

## Security Rules

Required:

- Never expose refresh tokens to React, Codex, logs, tool results, or sidecar
  stdout/stderr.
- Do not write Dataverse access tokens to temporary files for Codex.
- Redact bearer tokens from all error strings before returning them to the UI.
- Only allow GET requests in the AI module.
- Default every generated query to a bounded `$top`.
- Add clear user confirmation before any future mutating operation. Mutating
  operations are out of scope for v1.
- Keep the Codex sandbox at read-only or equivalent for general repo context.
- Treat Dataverse result data as sensitive customer data; do not persist chat
  history outside the local app config unless the user opts in.

Recommended:

- Add a per-turn tool trace in the UI so users can see which Dataverse queries
  were run.
- Add response-size limits and ask the user to narrow broad queries.
- Add an environment lock per chat thread. If the selected environment changes,
  require a new thread or explicit confirmation to continue against the new org.
- Add a "clear chat" command that deletes local transcript state.

## Persistence

Persist only:

- app chat thread id
- Codex thread id
- environment id
- messages
- timestamps

Do not persist:

- access tokens
- refresh tokens
- full raw API responses unless they are part of an explicit message
- hidden prompts containing secret material

Use the existing config storage approach only if chat history is small. If chat
history grows, add a dedicated local file under the app home directory, for
example `~/.OpenDataverse/ai-chat.json`.

## Error Handling

Map backend failures to user-safe messages:

- no environment selected: `Select a Dataverse environment first.`
- disconnected auth: `Connect this environment before using AI Chat.`
- expired auth refresh failed: `Reconnect this environment.`
- Codex not signed in: `Sign in to Codex on this machine, then try again.`
- query rejected by guardrail: explain which rule rejected it
- Dataverse throttling: show retry guidance and preserve the failed query

Log internal details only after redaction.

## Phased Implementation Plan

### Phase 1: Read-only chat skeleton

- Add `ai-chat` to `ToolId` and `toolRegistry`.
- Build `AiChatModule` with local-only messages and no Codex call.
- Add selected environment status and composer states.
- Add mock assistant responses for browser preview.

### Phase 2: Dataverse read commands

- Add `dataverse_ai_whoami`, `dataverse_ai_list_entity_sets`,
  `dataverse_ai_get`, and `dataverse_ai_metadata`.
- Reuse `dataverse_get(...)` and `access_token_for(...)`.
- Add path/query validation and response-size caps.
- Add bridge functions in `src/core/desktop/ai-bridge.ts`.
- Verify with connected environment auth.

### Phase 3: Codex sidecar

- Add the Node sidecar package.
- Add `@openai/codex-sdk`.
- Add Tauri sidecar startup and request/response transport.
- Start/resume Codex threads.
- Send prompts with environment context and tool availability.
- Return assistant responses to the UI.

### Phase 4: Tool calling

- Wire sidecar Dataverse tool calls to Tauri backend commands.
- Render tool traces in the chat UI.
- Add query confirmation only for broad or risky requests.
- Add tests for rejected paths and `$top` caps.

### Phase 5: Streaming and polish

- Stream assistant text and tool events.
- Add stop/cancel.
- Add chat history list.
- Add thread renaming.
- Add export transcript.

## Test Plan

Frontend:

- AI module appears in sidebar.
- Empty state fits without overlap.
- Composer disables when no environment is selected.
- Tool traces render compactly.
- Long messages wrap correctly.

Rust/backend:

- `dataverse_ai_get` rejects absolute URLs.
- `dataverse_ai_get` rejects non-API paths.
- `$top` is injected when missing.
- `$top` is capped when too high.
- token refresh path still works through `access_token_for(...)`.
- error redaction removes bearer tokens.

Sidecar:

- starts when first AI message is sent.
- maps local thread ids to Codex thread ids.
- resumes an existing Codex thread.
- handles Codex auth missing.
- handles tool call errors without losing the chat turn.

Manual:

- Connect an environment.
- Ask `Who am I connected as?`
- Ask for account entity metadata.
- Ask for first 5 account names.
- Switch environments and verify the chat does not silently query the wrong org.

## Open Questions

- Should chat history be persisted by default, or should it be session-only in
  v1?
- Should this module require Codex ChatGPT subscription auth only, or also allow
  API-key auth?
- Should the sidecar be bundled with the app or installed on first use?
- Should AI Chat be read-only permanently, or should future publishing actions
  be allowed behind explicit confirmation?

## Non-Goals For v1

- Mutating Dataverse records.
- Publishing web resources from AI.
- Generating temporary Dataverse token files.
- Running Azure CLI login from the AI module.
- Letting Codex inspect raw token storage.
- Cloud-hosted multi-user AI chat.
