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

Solution Explorer loads unmanaged Dataverse solutions first for the selected
environment, ordered newest-created first. It opens a grouped component table
and shows component details, dependencies, delete blockers, and solution layers.
Its write actions are scoped to developer web resources: existing unmanaged,
non-Microsoft web resources can be added to an unmanaged solution, and new text
web resources can be created directly in that solution.

### Plugin Registration

Plugin Registration is a native Dataverse plug-in registration workspace for
unmanaged assemblies, plug-in types, processing steps, step images, secure
configuration, and service endpoints/webhooks. It can inspect a compiled
plug-in DLL locally, register or update unmanaged registrations through the
Dataverse Web API, add registration components to a solution, inspect
dependencies, and export an unmanaged registration snapshot.

The workspace uses a PRT-style expandable registration tree. Packages contain
assemblies, assemblies contain plug-in types or workflow activities, those
contain steps, and steps contain images. Service endpoints and webhooks are
root nodes whose steps load underneath them when expanded.

The tool is self-contained in OpenDataverse. It does not launch or require
Windows PRT, XrmToolBox, PAC CLI, Visual Studio, or an installed .NET runtime.
Dataverse tokens remain in the Tauri backend, and secure configuration values
are written without being read back into the renderer after save.

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
npm run verify
mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
mise exec -- cargo test --manifest-path src-tauri/Cargo.toml
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
- `user-settings.json` stores local UI preferences such as appearance theme and
  light/dark mode.
- `tokens/token-<environment-id>.json` stores the Dataverse token for an
  environment.

## Architecture

OpenDataverse is split across three runtime boundaries:

- `src/` is the React renderer. `App.tsx` composes the shell, while each folder
  under `src/modules/` owns its screen, pure domain transforms, typed Tauri
  gateway, browser-preview behavior, and focused tests.
- `src-tauri/` owns local storage, browser authentication, token refresh,
  authenticated Dataverse transport, local file/process access, and Tauri
  command registration. `src-tauri/src/backend/mod.rs` is the composition root;
  shared storage and Dataverse transport live in named foundation modules.
- `src-sidecar/ai/` owns provider SDK sessions. It receives structured requests
  from Tauri and cannot access Dataverse refresh tokens directly.

Shared frontend code under `src/core/` must not import feature implementations
or feature mock data. Feature code may depend on shared configuration, runtime,
schema, error, appearance, storage, and UI primitives. The tool registry is the
single mapping from a tool id to its metadata and lazy-loaded module.

Renderer calls use stable Tauri command names and serialized payloads. The
quality suite checks that every statically invoked renderer command has a
registered Rust handler.
