# Self-Contained Plugin Registration Tool

Date: 2026-06-18
Status: Accepted

## Context

OpenDataverse is intended to give Dataverse developers explicit, environment-scoped desktop tools that work outside the browser. The user wants a Plugin Registration tool matching the current XrmToolBox Plugin Registration experience, but not Windows-only.

Current Microsoft documentation confirms that PRT registers and edits Dataverse plug-in registrations, but the Dataverse development tools page says PRT, CMT, and PD are Windows WPF tools and that the `pac tool` command is available only on a Windows CLI install. `pac plugin push` exists, but it imports plug-ins rather than providing full interactive registration-tool parity, and it would still be an external runtime dependency.

The existing OpenDataverse architecture keeps Dataverse auth and token refresh in the Tauri backend. React calls typed commands and does not receive refresh tokens. The plugin-registration feature must preserve that boundary while adding write-heavy capabilities.

## Decision

Build Plugin Registration as a native OpenDataverse tool.

The app must not launch or require XrmToolBox, Microsoft PRT, `pac`, Visual Studio, Windows, or an installed .NET runtime at app runtime. The Tauri/Rust backend owns:

- local plug-in assembly and package inspection
- Dataverse Web API reads and writes
- token refresh and request execution
- secure configuration writes
- local export file creation

The React renderer owns:

- tree/list/detail presentation
- explicit forms and validation feedback
- user confirmation prompts
- browser-preview mock data

The tool will inspect assemblies without executing plug-in code. Registerable type discovery must come from metadata parsing, not loading a DLL into the app's main runtime or shelling out to external tools.

The default registration working set is unmanaged components. Managed registrations are deployment artifacts owned by solution ALM and can be introduced later only as an explicit read-only browse mode, not as update targets.

Plug-in Profiler installation, profiling, and debug replay are intentionally out of scope. Logging-based debugging is the expected workflow for this project.

## Consequences

- OpenDataverse can provide Plugin Registration on macOS and other non-Windows platforms.
- The app remains self-contained and does not inherit the installation, platform, or auth profile behavior of PRT, XrmToolBox, or PAC CLI.
- Backend implementation is larger because it must own assembly metadata parsing and Dataverse registration payloads directly.
- The existing token boundary stays intact: Dataverse credentials are not exposed to React or to external processes.
- Some legacy PRT features tied to Windows UI, Visual Studio, or profiler replay are excluded by design rather than treated as missing implementation.

## Alternatives Considered

- Launch Microsoft PRT through `pac tool prt`: rejected because Microsoft documents `pac tool`/PRT as Windows-only and it would not meet the self-contained requirement.
- Use `pac plugin push`: rejected because it is an external dependency and does not provide full registration-management parity.
- Embed an external .NET helper process for assembly inspection: rejected because the tool must not require an installed .NET runtime at app runtime.
- Build a minimal step editor only: rejected because the requested target is XrmToolBox Plugin Registration parity, not a narrow CRUD subset.
