# Native Plugin Registration Tool

Build a native, cross-platform OpenDataverse Plugin Registration tool that matches the current XrmToolBox Plugin Registration workflow without depending on Windows, XrmToolBox, PRT, `pac`, Visual Studio, or an installed .NET runtime.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is done, set its status to `Complete` and write its **Phase Summary** with what changed, key decisions, verification results, and anything needed to continue with zero conversation context. Run the phase's **Verification Plan** before moving on.
When all phases are done, fill in **Final Recap** and **Deployment Plan**.

Do not perform deployment steps unless the user explicitly asks. The deployment section is an instruction plan only.

## Scope
- In:
  - Add `Plugin Registration` as a first-class OpenDataverse tool.
  - Match the current XrmToolBox Plugin Registration baseline for registration and management workflows.
  - Keep all Dataverse auth, token refresh, file reads, assembly inspection, and writes in the Tauri/Rust backend.
  - Register, update, unregister, enable, disable, and inspect unmanaged plug-in assemblies, plug-in types, custom workflow activities, processing steps, secure configuration, step images, plug-in packages where feasible, webhooks/service endpoints, solution membership, dependencies, and exports.
  - Provide a productive React UI for tree/list navigation, detail editing, search, filters, validation, and explicit confirmation before destructive actions.
- Out:
  - Plug-in Profiler installation, profiling, debug replay, and Visual Studio replay workflows.
  - Wrapping or launching Windows PRT, XrmToolBox, `pac tool prt`, Power Platform Tools for Visual Studio, or external .NET helper executables at app runtime.
  - Silent background registration or auto-advancing workflow state after copy/export operations.
  - Generic solution ALM beyond the registration components needed by this tool.
- Success criteria:
  - A user on macOS can load a compiled Dataverse plug-in assembly or supported plug-in package, inspect discovered registerable types, register/update it to Dataverse, create/update steps and images, and manage the registrations without opening Windows tooling.
  - Dataverse tokens remain unavailable to React and to any external process.
  - Managed/system components are excluded from the default working set and cannot be accidentally edited or removed; destructive actions require explicit confirmation and return clear errors.
  - The tool handles disconnected browser preview with mock data and real Tauri mode with Dataverse Web API.
  - Each shipped application phase is documented in `src/core/changelog.ts`.

## Research Baseline
- Microsoft documents PRT as creating/editing Dataverse registrations, while current Dataverse development-tool docs state PRT/CMT/PD are Windows WPF tools and `pac tool` is available only on a Windows CLI install.
- `pac plugin push` can import plug-ins, but it is not a complete PRT replacement and is not acceptable here because this tool must be self-contained.
- The current XrmToolBox package baseline is `Xrm.Sdk.PluginRegistration` 3.2026.4.1. Its package notes include core operations, managed/unmanaged filters, export, dependency display, bulk enable/disable, filtering-attribute improvements, webhook export, and safety checks around image/filtering registration.
- Dataverse Web API tables/actions needed include `pluginassemblies`, `plugintypes`, `pluginpackages`, `sdkmessages`, `sdkmessagefilters`, `sdkmessageprocessingsteps`, `sdkmessageprocessingstepimages`, `sdkmessageprocessingstepsecureconfigs`, `serviceendpoints`, dependency records, `AddSolutionComponent`, and active-layer removal actions where supported.
- The repo already has early uncommitted plugin-registration type/bridge/mock scaffolding. Treat it as user work and build with it rather than reverting it.

References:
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/download-tools-nuget
- https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/tool
- https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/plugin
- https://www.nuget.org/packages/Xrm.Sdk.PluginRegistration
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/pluginassembly
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstep
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepimage
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepsecureconfig
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/serviceendpoint

## Architectural Decisions
- [x] Record native self-contained registration architecture in [ADR-0003](../architecture/adr-0003-self-contained-plugin-registration-tool.md).

## Phase 1: Baseline Inventory And Contracts
Status: Complete

- [x] Convert the XrmToolBox baseline into a local parity matrix covering commands, dialogs, records, fields, validations, and out-of-scope profiler/debug items.
- [x] Audit existing `src/core/dataverse/schemas.ts`, `src/core/desktop/bridge.ts`, `src/core/desktop/file-dialog.ts`, and `src/modules/plugin-registration/` changes and reconcile them into the planned contract without discarding user work.
- [x] Extend shared TypeScript types for assemblies, packages, types, steps, images, secure configs, messages, filters, endpoints, dependencies, solution actions, exports, and write results.
- [x] Define zod schemas for all renderer-to-backend write inputs before backend commands are implemented.
- [x] Add the tool to `src/modules/tool-registry.ts` and `src/App.tsx` behind a usable browser-preview mock surface.
- [x] Add a changelog entry for the visible Plugin Registration planning/scaffolding change when app UI behavior changes.

### Verification Plan
- `npm run build:web` - expected result: TypeScript and Vite compile with the new tool contract.
- `npm run lint` - expected result: no new lint errors.
- Manual browser preview - expected result: Plugin Registration appears as a tool and opens mock data without requiring Tauri.

### Phase Summary
Completed 2026-06-18. Added the parity matrix at [plugin-registration-parity-matrix.md](../architecture/plugin-registration-parity-matrix.md), reconciled the existing plugin-registration scaffold into expanded TypeScript/zod contracts, added browser mock data, registered Plugin Registration as a ready tool, and added the changelog entry `0.1.26`. Verification: `npm run build:web` and `npm run lint` pass.

## Phase 2: Self-Contained Assembly And Package Inspection
Status: Partial

- [x] Select and integrate a Rust-side .NET metadata parser for PE/CLI assemblies, or implement the minimum ECMA-335 reader needed for this tool.
- [x] Extract assembly name, version, culture, public key token, file hash, target framework, strong-name status, and size.
- [x] Discover registerable exported non-abstract classes implementing `Microsoft.Xrm.Sdk.IPlugin`.
- [x] Discover custom workflow activities where metadata supports doing so safely without executing assembly code.
- [ ] Detect package artifacts for dependent assemblies and decide which package shapes can be supported natively.
- [x] Return structured inspection warnings for unsupported target framework, unsigned assemblies where signing is required, assemblies larger than Dataverse limits, missing SDK references, and no discovered registerable types.
- [ ] Add fixture-driven Rust tests using small checked-in sample assemblies or generated test binaries that do not require external tools during app runtime.

### Verification Plan
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml assembly_metadata` - expected result: metadata parser tests pass.
- `npm run build:web` - expected result: frontend contracts still compile.
- Manual Tauri smoke with a known plug-in DLL - expected result: inspection shows assembly details and discovered types without invoking `dotnet`, `pac`, or PRT.

### Phase Summary
Partial implementation shipped 2026-06-18. Added a self-contained PE/CLI metadata reader plus `clrmeta` for ECMA-335 metadata parsing. The backend extracts assembly identity, SHA-256 hash, size, target framework strings, strong-name status, direct `IPlugin` implementations, and direct `CodeActivity` custom workflow activities without executing assembly code. Package artifact inspection and fixture assemblies remain open. Verification: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml assembly_metadata` passes with the current parser rejection test.

## Phase 3: Dataverse Read Model
Status: Complete

- [x] Implement Tauri commands to list plug-in assemblies, packages, plug-in types, custom workflow activity types, steps, images, secure config presence, messages, message filters, endpoints, users, and dependencies.
- [x] Use existing Dataverse token refresh and request helpers; do not expose tokens to React.
- [x] Normalize Dataverse option values into labels for isolation mode, source type, stage, mode, deployment, image type, state, status, endpoint contract, and endpoint auth type.
- [x] Build message/entity filter queries using `sdkmessages` and `sdkmessagefilters` with `iscustomprocessingstepallowed` filtering.
- [x] Include managed/system component flags and editability reasons in the read model.
- [x] Add browser-preview mock data that mirrors the real response shapes.

### Verification Plan
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml plugin_registration_read_model` - expected result: mapper and option-label tests pass.
- `npm run build:web` - expected result: read-model types compile.
- Manual Tauri smoke against a development Dataverse environment - expected result: assemblies, types, steps, images, messages, filters, and endpoints load.

### Phase Summary
Completed 2026-06-18. Added Tauri read commands and a combined snapshot for unmanaged assemblies, packages, types, steps, images, messages, filters, service endpoints, users, dependencies, option labels, secure config presence, and editability reasons. Follow-up fixes: the initial snapshot now loads sections concurrently with bounded fallbacks and visible warnings so one slow or unsupported Dataverse table cannot trap the whole tool in a loading state, the default registration working set is unmanaged to match Dataverse ALM edit boundaries, and the primary UI now follows the PRT tree hierarchy with type, step, endpoint, and image descendants loaded only when their parent node is expanded. Verification: `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml plugin_registration_read_model`, `npm run build:web`, and `npm run lint` pass.

## Phase 4: Assembly, Package, And Type Writes
Status: Partial

- [ ] Implement register-new assembly using inspected metadata, base64 content upload, sandbox isolation defaults, database/file-store source handling where supported, and selected type creation.
- [x] Implement update-existing assembly content/properties without changing unrelated steps.
- [x] Implement create/update/remove plug-in type records where Dataverse permits it.
- [ ] Implement supported native plug-in package registration/update path, including clear unsupported-package errors when parity cannot be achieved safely.
- [ ] Add solution-add behavior for assemblies/packages using `AddSolutionComponent` and unmanaged solution selection.
- [x] Prevent write operations on managed Microsoft/out-of-box components and surface Dataverse permission failures clearly.
- [x] Add changelog entry for shipped assembly/package/type registration behavior.

### Verification Plan
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml plugin_registration_writes` - expected result: payload construction and validation tests pass.
- `npm run build:web` - expected result: write UI compiles.
- Manual Tauri smoke in a disposable Dataverse environment - expected result: register, update, add to solution, and unregister test assembly paths behave as expected.

### Phase Summary
Partial implementation shipped 2026-06-18. Added assembly register/update/unregister, selected plug-in type creation, plug-in type unregister, managed/system write guards, and optional `AddSolutionComponent` calls. Native plug-in package upload/update remains open; packages are currently read-only in the snapshot. Verification: `npm run build:web`, `npm run lint`, and full `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml` pass.

## Phase 5: Step, Secure Config, And Image Writes
Status: Partial

- [x] Implement create/update step payloads for plug-in type and service-endpoint handlers.
- [x] Support message, primary entity, secondary entity, stage, mode, rank, deployment, filtering attributes, unsecure configuration, secure configuration, run-as user, description, enablement, and async-delete where applicable.
- [ ] Create/update/delete `sdkmessageprocessingstepsecureconfig` records and bind/unbind them to steps without leaking secure config values back to the renderer after save.
- [ ] Implement enable/disable and bulk enable/disable for individual steps, plug-in types, assemblies, packages, and endpoints.
- [x] Implement register/update/delete images with pre/post/both image type, alias, message property name, attributes, and Create-message pre-image prevention.
- [ ] Add filtering-attribute picker using entity metadata and warn when Update steps target all attributes.
- [x] Add changelog entry for shipped step/config/image behavior.

### Verification Plan
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml plugin_registration_steps` - expected result: step, secure-config, state, and image payload tests pass.
- `npm run build:web` - expected result: step/image UI compiles.
- Manual Tauri smoke in a disposable Dataverse environment - expected result: create/update/enable/disable/delete step, secure config, and images work and refresh accurately.

### Phase Summary
Partial implementation shipped 2026-06-18. Added plug-in and endpoint step create/update/delete, secure config create/update/bind with write-only renderer behavior, individual step state changes, and image create/update/delete with Create pre-image prevention. Bulk state changes and metadata-driven filtering attribute picker remain open. Verification: `npm run build:web`, `npm run lint`, and full Rust tests pass.

## Phase 6: Webhooks, Service Endpoints, Dependencies, Export, And Active Layers
Status: Partial

- [x] Implement webhook/service endpoint read and write support for the XrmToolBox parity set that can be represented through Dataverse Web API.
- [x] Support endpoint-bound step registration using the same step editor model.
- [x] Implement dependency inspection for assemblies, plug-in types, steps, images, packages, and endpoints.
- [x] Implement export of all or selected registrations to a local file through Tauri file APIs, including webhook/endpoint rows.
- [ ] Implement active-layer detection and removal only if the Dataverse actions are available and the user confirms the operation.
- [ ] Add search, managed/unmanaged filters, view grouping by package/assembly/entity/message, and details panes that match the parity matrix.
- [x] Add changelog entry for shipped webhook, dependency, export, search/filter, and active-layer behavior.

### Verification Plan
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml plugin_registration_endpoints` - expected result: endpoint/dependency/export payload tests pass.
- `npm run build:web` - expected result: full tool UI compiles.
- Manual Tauri smoke in a disposable Dataverse environment - expected result: endpoints, endpoint steps, dependency view, export, search/filter, and active-layer checks work or show supported clear errors.

### Phase Summary
Partial implementation shipped 2026-06-18. Added service endpoint/webhook reads and writes, endpoint-bound step registration, dependencies, JSON export, search/filter, PRT-style tree navigation, lazy descendant loading, and details panes. Active-layer detection/removal remains open. Verification: `npm run build:web`, `npm run lint`, and full Rust tests pass.

## Phase 7: Hardening, Parity Review, And Documentation
Status: Partial

- [x] Re-run the parity matrix against the current XrmToolBox baseline and mark exact matches, intentional differences, and unsupported Dataverse/API gaps.
- [ ] Add focused unit tests for validation rules, component editability, destructive-action guards, and Dataverse payload serialization.
- [x] Add a small manual QA script for a disposable development environment covering assembly registration, step/image creation, config, solution add, export, and unregister cleanup.
- [x] Update README feature documentation with public-facing setup and usage notes that do not mention local validation mechanics.
- [x] Verify changelog entries cover every shipped application change.
- [ ] Run a final UI pass for dense, work-focused layout, text overflow, responsive behavior, and no card-in-card composition.

### Verification Plan
- `npm run lint` - expected result: no lint errors.
- `npm run build:web` - expected result: frontend build succeeds.
- `npm --prefix src-sidecar/ai run build` - expected result: sidecar remains unaffected.
- `mise exec -- cargo test --manifest-path src-tauri/Cargo.toml` - expected result: Rust tests pass.
- `mise exec -- npm run tauri:build` - expected result: packaged desktop build succeeds.

### Phase Summary
Partial implementation shipped 2026-06-18. Updated README, parity matrix, manual QA checklist, changelog, and added focused Rust tests for assembly parser rejection, option labels, and managed editability. Automated verification passes. Remaining hardening needs real browser/Tauri UI smoke, real Dataverse disposable-org smoke, package fixtures, and active-layer validation.

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions only; do not execute unless the user explicitly asks)_
