# Architecture Maintainability Refactor

Refactor OpenDataverse along its existing feature and runtime boundaries so the codebase remains easy to change as the product grows. Preserve current behavior, security boundaries, browser-preview parity, and the existing React, Tauri, and AI sidecar stack.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is done,
set its status to `Complete` and write its **Phase Summary** with what changed,
key decisions, verification results, and anything needed to continue with zero
conversation context. Run the phase's **Verification Plan** before moving on.
When all phases are done, fill in **Final Recap** and **Deployment Plan**.

Do not perform deployment steps unless the user explicitly asks. The deployment
section is an instruction plan only.

## Scope
- In:
  - Restore clear dependency direction between the app shell, feature modules, shared domain code, and desktop infrastructure.
  - Split oversized files only at established domain seams: feature gateways, pure transforms, focused dialogs/panels, storage, authenticated Dataverse transport, and Tauri composition.
  - Keep Dataverse tokens and privileged operations in Rust and preserve the existing AI sidecar boundary.
  - Keep browser-preview behavior feature-complete enough for visual validation.
  - Add characterization and unit tests around extracted behavior before or alongside structural moves.
  - Update architecture documentation and the application changelog for shipped changes.
- Out:
  - Replacing React, Zustand, TanStack Query, Tauri, Rust, Zod, or the AI provider SDKs.
  - New dependencies, generic framework layers, speculative repositories/services, or broad visual redesign.
  - Dataverse schema changes, production migrations, releases, or live-environment writes.
  - Behavior changes unrelated to resolving an architectural boundary or enabling reliable verification.
- Success criteria:
  - `src/core` no longer imports feature implementation or feature mock-data modules.
  - Shared orchestration files have focused ownership; app-shell dialogs/lifecycle and workspace state transitions are independently testable.
  - Pure feature transforms are outside TSX render files and covered by focused tests.
  - Rust feature modules use explicit shared dependencies rather than `use super::*`; storage/authenticated transport are named modules rather than an implicit parent namespace.
  - Existing renderer-to-Tauri command names and serialized payloads remain compatible unless a deliberate, documented contract change is required.
  - Frontend tests, lint, web build, AI sidecar build, bundle assertion, Rust tests, Tauri build, and browser-preview QA pass.

## Architectural Decisions
- [x] Record the feature-oriented dependency and runtime-boundary decision in [ADR-0004](../architecture/adr-0004-feature-oriented-boundaries.md).

## Phase 1: Baseline And Safety Net
Status: Complete

- [x] Inventory source concentration, cross-feature imports, shared-state ownership, Rust wildcard imports, and current tests.
- [x] Restore root and AI-sidecar dependencies from lockfiles.
- [x] Run and record the unmodified baseline for frontend tests/coverage, lint, web build, AI sidecar build, bundle assertion, Rust tests, and Tauri build.
- [x] Open each tool in the browser preview and record any existing runtime or layout failures before refactoring.
- [x] Add characterization tests for shared workspace transitions and pure behavior that will move in later phases.

### Verification Plan
- `npm run test:coverage` - expected result: current frontend tests pass and baseline coverage is recorded.
- `npm run lint` - expected result: baseline lint passes or existing failures are documented.
- `npm run build` - expected result: renderer and AI sidecar compile.
- `npm run test:bundle` - expected result: browser bundle assertions pass.
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml` - expected result: current Rust tests pass.
- `mise exec -- npm run tauri:build` - expected result: desktop package compiles.

### Phase Summary
Installed both dependency trees with `npm ci`, then established frontend,
sidecar, Rust, and browser-preview baselines. Frontend tests, lint, and builds
were green. The original Rust suite exposed one Windows-only fixture problem:
the Mise lookup test created a Unix-style `node` shim instead of the native
`node.exe` fixture expected on Windows. The fixture was corrected without
changing production behavior. All tools rendered representative browser data
before structural work began. Characterization coverage was added for workspace
state transitions and the pure feature behavior selected for extraction.

## Phase 2: Frontend Dependency Direction
Status: Complete

- [x] Move each feature's browser-preview data and state behind a feature-owned gateway.
- [x] Split the monolithic desktop bridge into feature-owned command gateways while keeping shared runtime detection and storage primitives in `src/core`.
- [x] Move AI-specific model defaults and contracts out of the generic desktop core dependency path.
- [x] Remove remaining `src/core` imports of `src/modules` and verify there are no new dependency cycles.
- [x] Add gateway tests covering runtime parsing and browser-preview behavior.

### Verification Plan
- `rg -n '"@/modules/' src/core` - expected result: no matches.
- `npm run test:coverage` - expected result: gateway and existing tests pass.
- `npm run lint && npm run build:web` - expected result: strict TypeScript, lint, and web build pass.
- Browser preview - expected result: every tool still loads representative data and supported mock mutations still work.

### Phase Summary
Deleted the three feature-aware core bridges and replaced them with a small
runtime detector, a workspace/config gateway, and feature-owned gateways for
AI Chat, FetchXML, Form Logic, Plugin Registration, Solution Explorer, and Web
Resources. Browser-preview mutations remain explicit and shared only where the
Solution and Web Resource previews must observe the same records. Gateway tests
cover parsing, preview reads, preview writes, and cross-feature preview
visibility. `src/core` has no static or dynamic feature imports, enforced by an
architecture check.

## Phase 3: App Shell And Workspace State
Status: Complete

- [x] Extract environment management, settings, notification reporting, update lifecycle, and tool rendering from `App.tsx` into focused app-shell components/hooks.
- [x] Make the tool registry the single mapping from a tool id to its presentation metadata and lazy component.
- [x] Extract pure environment, binding, and tool-window transitions from the Zustand store.
- [x] Keep effects and persistence at explicit boundaries while preserving current user-visible messages and error behavior.
- [x] Add tests for environment deletion/URL changes, window activation/closure, binding transitions, and tool-opening behavior.

### Verification Plan
- `npm run test:coverage` - expected result: app-shell/store transition tests and existing tests pass.
- `npm run lint && npm run build:web` - expected result: no hook, type, lint, or build regressions.
- Browser preview - expected result: environment CRUD, settings, notifications, tool navigation, and changelog surfaces behave as before.

### Phase Summary
Reduced `App.tsx` from roughly 1,590 lines to 589. Environment dialogs,
settings, notifications, tool rendering, startup/changelog state, appearance
and window-title synchronization, heartbeat polling, and updater lifecycle now
have focused app-shell owners. The tool registry owns both presentation metadata
and lazy component loading. Pure environment, binding, and tool-window
transitions moved to `workspace-state.ts` with focused tests; the Zustand store
retains effects and persistence orchestration.

## Phase 4: Feature Module Decomposition
Status: Complete

- [x] Extract Webresource Management tree/path/download-job behavior into feature-owned domain files with tests.
- [x] Extract Webresource Management dialogs and viewer into focused components without introducing generic wrapper layers.
- [x] Extract Plugin Registration tree/form/label transforms into feature-owned domain files with tests.
- [x] Split substantial Plugin Registration editors and detail panels along existing record boundaries.
- [x] Extract FetchXML designer AST/XML generation into a pure feature-owned module with round-trip characterization tests for generated output.
- [x] Extract Form Logic form-XML parsing and prompt-context transforms into pure feature-owned modules with tests.
- [x] Extract AI Chat attachment/message/context transforms into pure feature-owned modules with tests.
- [x] Remove semantically duplicated formatting or Dataverse rules only when the concept and ownership are genuinely shared.

### Verification Plan
- `npm run test:coverage` - expected result: extracted domain behavior is covered and existing behavior remains green.
- `npm run lint && npm run build:web` - expected result: strict TypeScript, React hooks, lint, and web build pass.
- Browser preview - expected result: each affected tool completes its primary browse/edit interaction with no visual regression.

### Phase Summary
Extracted pure tree, registration-form, designer/XML, form-XML/prompt, chat,
and solution transforms with focused tests. Web Resource dialogs, viewer,
download status, and Resources/Bindings/Activity panels are feature-owned
components. Plugin assembly/step/image/endpoint editors and details are
separate components. AI message presentation and Solution dialogs/inspector are
also isolated. The primary orchestration files now range from 589 to 1,176
lines except the deliberately stateful Web Resource workspace at 1,125 lines;
queries, mutations, and watcher lifecycles remain with their owning module.

## Phase 5: Rust Backend Boundaries
Status: Complete

- [x] Verify the current Tauri command/state pattern against current official Tauri documentation before changing composition.
- [x] Extract config, settings, token paths, and persisted-token operations into a storage/auth foundation with focused tests.
- [x] Extract authenticated Dataverse request, paging, response, and common OData helpers into an explicit Dataverse client module.
- [x] Replace `use super::*` in every backend feature with explicit imports.
- [x] Divide AI, Plugin Registration, and Solution backend internals only at demonstrated subdomain seams while preserving public Tauri commands.
- [x] Keep command registration in one readable composition root and verify every frontend invocation has a registered backend command.
- [x] Add contract-focused Rust tests for moved serialization, validation, pagination, and payload behavior.

### Verification Plan
- `rg -n 'use super::\*' src-tauri/src/backend` - expected result: no production matches; local test modules may use it.
- Renderer command-to-handler audit - expected result: every production `invoke` command is registered exactly once.
- `mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` - expected result: formatting passes.
- `mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` - expected result: no warnings.
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml` - expected result: all Rust tests pass.
- `mise exec -- npm run tauri:build -- --no-sign` - expected result: local MSI and NSIS packages build without release signing.

### Phase Summary
Reduced `backend/mod.rs` to a 98-line composition root using one documented
Tauri handler registration. Storage, auth state, and authenticated Dataverse
transport now have named modules. AI owns explicit domain, Dataverse-tool,
attachment, and sidecar submodules; Plugin Registration owns read-model and
assembly-inspection submodules; Solution Explorer owns component-read and web
resource-write submodules. Production imports are explicit. Four unused
renderer-facing AI helper commands were removed while their internal tool
functions remain unchanged, leaving an exact 64 renderer commands to 64
registered handlers. The final Rust suite has 35 passing tests and zero Clippy
warnings with warnings denied.

## Phase 6: Completion Audit And Documentation
Status: Complete

- [x] Update `README.md`, `docs/ARCHITECTURE_DECISIONS.md`, and ADR-0004 to match the implemented structure rather than the proposed one.
- [x] Add changelog entries for every shipped application change.
- [x] Run the complete repository verification suite from a clean dependency install.
- [x] Run browser-preview QA for all modules in light/dark mode and with reduced motion.
- [x] Inspect the final dependency graph, largest files, unsafe TypeScript assertions, wildcard Rust imports, skipped tests, and diff for residual architectural drift.
- [x] Fill in every phase summary, the final recap, and deployment instructions.

### Verification Plan
- `npm run verify` - expected result: frontend coverage, lint, builds, bundle assertions, and audit pass.
- `mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` - expected result: formatting passes.
- `mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` - expected result: no warnings.
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml` - expected result: all Rust tests pass.
- `mise exec -- npm run tauri:build -- --no-sign` - expected result: local MSI and NSIS packages succeed without release signing.
- Browser preview QA - expected result: all tools render and primary interactions work in both themes with reduced motion respected.

### Phase Summary
`npm run verify` passes 88 tests, lint, renderer and AI-sidecar builds, bundle
assertions, the 64/64 command contract, dependency-boundary rules, and the
production dependency audit. Rust formatting, check, Clippy, and all 35 tests
pass. Browser preview QA covered all tools and the newly extracted dialogs and
panels; light/dark and reduced-motion states were exercised and restored. A
full local Tauri build produced fresh MSI and NSIS installers and returned zero
with `--no-sign`. The normal signed build correctly stopped after bundling
because the release-only `TAURI_SIGNING_PRIVATE_KEY` was not present.

## Final Recap
OpenDataverse now has feature-oriented frontend slices, a composition-focused
app shell, independently testable workspace transitions and domain transforms,
feature-owned desktop/preview gateways, and a thin Rust composition root over
explicit storage, transport, and feature subdomains. Renderer/Tauri contracts
and serialized payloads were preserved; the only command-surface change removes
four unused AI wrappers that had no renderer caller. No dependency or framework
was added, and no Dataverse schema or live data was changed.

## Deployment Plan
No deployment was performed. For a release:

1. Start from a clean checkout and run `npm ci` plus
   `npm --prefix src-sidecar/ai ci`.
2. Run `npm run verify`, Rust formatting/check/Clippy/tests, and connected
   desktop smoke tests against a non-production Dataverse environment.
3. Provide the release signing environment, including
   `TAURI_SIGNING_PRIVATE_KEY`; do not use `--no-sign` for published updater
   artifacts.
4. Run `mise exec -- npm run tauri:build` and verify both signed Windows
   installers and updater artifacts.
5. Install the generated package on a clean Windows test account and exercise
   authentication, each tool's primary read path, a scoped developer write,
   updater discovery, and rollback/uninstall behavior.
6. Publish the signed artifacts and release metadata through the repository's
   normal release workflow after review.
