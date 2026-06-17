# OpenDataverse

OpenDataverse is a desktop workbench for Microsoft Dataverse and Dynamics 365
workflows that are awkward to do from a browser tab.

## Current Features

### Webresource Management

Webresource Management connects to a Dataverse environment, lists web resources,
shows and edits resource content, and lets you bind a local file to a Dataverse
web resource. Bound files can be published manually or watched for local changes
and auto-published.

Publishing uses the Dataverse Web API from the Tauri backend:

- update the web resource content with `PATCH webresourceset`
- publish the changed resource with `PublishXml`
- refresh the resource list after a publish

### AI Chat

AI Chat lets you ask questions about the selected Dataverse environment through a
local AI provider. It currently supports Codex and Claude, with provider, model,
and reasoning controls in the chat header.

The important boundary: AI providers do not receive Dataverse refresh tokens and
do not get arbitrary shell access for Dataverse work. OpenDataverse owns
Dataverse auth, and the AI sidecar can only request app-owned, read-only
Dataverse tools such as `WhoAmI`, entity metadata, entity-set listing, and
restricted JSON `GET` calls.

Provider selection is per chat session. Once a thread starts with Codex or
Claude, the thread stays with that provider until the chat is cleared.

### FetchXML Builder

FetchXML Builder is an Advanced Find-style query workspace. It has a visual
Designer for table, column, row-count, condition, group, and related-table
selection, plus a Monaco-backed FetchXML tab for hand-written XML.

FetchXML is the canonical artifact. Designer-generated XML uses the visible row
limit. Manual XML runs as written. Query results are shown in-app, and the tool
can copy both the FetchXML and the Dataverse Web API `fetchXml` URL.

### Solution Explorer

Solution Explorer lists visible Dataverse solutions for the selected
environment, opens a grouped component table, and shows component details,
dependencies, delete blockers, and solution layers. Its write actions are scoped
to developer web resources: existing web resources can be added to an unmanaged
solution, and new text web resources can be created directly in that solution.

## Local Setup

Install the managed toolchain first. This repo uses `mise.toml` for Rust, and
this machine convention is to use mise when a tool is missing.

```sh
mise install
npm install
npm --prefix src-sidecar/ai install
```

Run the browser-only frontend when you want quick UI feedback:

```sh
npm run dev
```

Run the real desktop app when you need Dataverse auth, local file dialogs, file
watching, updater checks, or AI sidecar behavior:

```sh
mise exec -- npm run tauri:dev
```

Build everything:

```sh
mise exec -- npm run build
mise exec -- npm run tauri:build
```

Useful checks:

```sh
npm run build:web
npm run lint
npm --prefix src-sidecar/ai run build
```

## AI Provider Setup

The AI sidecar is launched by the Tauri backend with Node. If Node is not on
`PATH`, set `OPENDATAVERSE_AI_NODE` to the Node executable you want the app to
use.

Codex uses the local Codex auth directory. If `CODEX_HOME` is not set, the app
passes `~/.codex` to the sidecar.

```sh
codex login
```

Claude uses the local Claude credentials expected by the Claude agent SDK.

```sh
claude auth login
```

AI Chat still requires a selected and connected Dataverse environment. Provider
auth and Dataverse auth are intentionally separate.

## Dataverse Auth And Local Data

Environment sign-in uses Microsoft browser auth with a local loopback redirect
at `http://localhost:8400`. Tokens stay on disk under the user's OpenDataverse
data directory and are refreshed by the Tauri backend.

OpenDataverse stores user-editable app data in `~/.OpenDataverse`:

- `config.json` stores environments, selected environment, publisher prefix, and
  web resource bindings.
- `user-settings.json` stores local UI preferences such as dark mode.
- `tokens/token-<environment-id>.json` stores the Dataverse token for an
  environment.
