# OpenDataverse

A focused cross-platform desktop shell for Dataverse and Dynamics 365 tools.

The app is built with Tauri, Vite, React, TypeScript, Tailwind CSS, and shadcn/ui. The first registered tool is Autopublisher; future tools can be added through the module registry.

## Commands

```sh
npm install
npm run dev
npm run tauri:dev
npm run build:web
npm run tauri:build
npm run lint
```

Rust is pinned through `mise.toml`.

```sh
mise install
mise exec -- npm run tauri:build
```

## Structure

- `src/modules/tool-registry.ts` registers tool modules.
- `src/modules/autopublisher/` contains the first tool window.
- `src/store/workspace-store.ts` manages environments, open tool tabs, and bindings.
- `src/core/dataverse/` contains shared Dataverse schemas and validation.
- `src/core/desktop/` wraps Tauri commands and desktop APIs.
- `src-tauri/src/lib.rs` contains native Tauri commands for app config persistence and the auth command seam.

## Local Data

OpenDataverse stores user-editable app data in `~/.OpenDataverse`:

- `~/.OpenDataverse/config.json` stores environments, selected environment, publisher prefix, and file bindings.
- `~/.OpenDataverse/tokens/token-<environment-id>.json` stores environment-specific auth tokens.

If an older build wrote data to Tauri's platform app-config directory, the app migrates `config.json` on startup and token files when an environment token is next used.

## Current Scope

The base shell supports environment management, XRMToolBox-style tool tabs, modular tool registration, and persisted app config. The Autopublisher module can start Dataverse browser auth with the same public client and `http://localhost:8400` loopback redirect used by the reference TUI, store and refresh tokens locally, list real web resources through the Dataverse Web API, bind a local file to a web resource, and publish the bound file content through `PATCH webresourceset` plus `PublishXml`.
