# Plugin Registration Parity Matrix

Date: 2026-06-18

Baseline: current XrmToolBox Plugin Registration workflow, excluding Plug-in Profiler/debug replay by project decision.

## Commands And Dialogs

| Area | Baseline capability | OpenDataverse status | Notes |
| --- | --- | --- | --- |
| Registry tree | Browse assemblies, packages, types, steps, images, endpoints | Shipped | Implemented as a PRT-style expandable tree. Packages contain assemblies; assemblies contain plug-in types or workflow activities; types contain steps; steps contain images; service endpoints/webhooks contain endpoint-bound steps. Descendants load when expanded. The default working set is unmanaged registrations. |
| Assembly registration | Inspect DLL, register assembly, create selected plug-in type rows | Shipped | Self-contained PE/CLR metadata inspection in Rust; no `dotnet`, PRT, PAC, or XrmToolBox process. |
| Assembly update | Upload new content/properties without touching existing steps | Shipped | Updates `pluginassembly` content/properties and leaves steps/images intact. |
| Assembly unregister | Delete unmanaged assembly | Shipped | Guarded by managed/customizable checks and explicit confirmation. |
| Plug-in type registration | Create/remove plug-in type rows | Shipped | Create/remove supported where Dataverse permits it. |
| Step registration | Create/update plug-in and endpoint steps | Shipped | Supports message, filter/entity, stage, mode, rank, deployment, unsecure config, secure config, run-as user, enabled state, async auto-delete, and description. |
| Secure configuration | Save secure config and bind to step | Shipped | Secure values are write-only from renderer perspective after save; read model exposes only presence and ID. |
| Image registration | Create/update/delete step images | Shipped | Supports pre/post/both, alias, message property, attributes, and Create pre-image prevention. |
| Step state | Enable/disable individual steps | Shipped | Bulk enable/disable is not yet implemented. |
| Endpoint/webhook registration | Create/update/delete service endpoints and endpoint-bound steps | Shipped | Covers Web API fields represented in the current UI: contract, auth type, URL/path/namespace, message format, auth value, description. Service endpoints do not expose step-style state fields. |
| Dependencies | Inspect required/dependent/delete-blocking dependencies | Shipped | Uses existing Dataverse dependency functions. |
| Export | Export selected/current registration snapshot to JSON | Shipped | Includes endpoints/webhooks and respects unmanaged-only default. |
| Add to solution | Add created assemblies/types/steps/images/endpoints to solution | Shipped | Uses `AddSolutionComponent` when a solution unique name is supplied by the write model. |
| Managed/system safety | Prevent managed/Microsoft component edits/removes | Shipped | Managed registration rows are excluded from the default working set; conservative editability reasons are still surfaced in the read model and enforced again in Rust before writes. |
| Managed read-only browse | Inspect managed registrations without edit/update actions | Gap | Can be added later as an explicit read-only mode, separate from the unmanaged registration workflow. |
| Package browse | Read plug-in packages | Shipped | Package records are listed when present. |
| Package upload/update | Register/update NuGet plug-in package content | Gap | Needs a safe native package upload path and package artifact validation. |
| Filtering attribute picker | Pick fields from entity metadata | Gap | Current UI accepts comma-separated attributes. |
| Bulk enable/disable | Enable/disable across assemblies/types/packages/endpoints | Gap | Individual step state is implemented. |
| Active layers | Detect/remove active unmanaged layers | Gap | Not implemented; needs Dataverse action availability checks and confirmation design. |
| Profiler/debug replay | Install profiler, capture profile, replay in Visual Studio | Out of scope | Explicitly excluded by project decision. |

## Records And Fields

| Dataverse table | Coverage |
| --- | --- |
| `pluginassemblies` | Read, create, update, delete, add to solution. |
| `plugintypes` | Read, create, delete, add to solution. |
| `pluginpackages` | Read-only snapshot. |
| `sdkmessages` | Read public messages. |
| `sdkmessagefilters` | Read filters with `iscustomprocessingstepallowed`. |
| `sdkmessageprocessingsteps` | Read, create, update, delete, enable/disable, add to solution. |
| `sdkmessageprocessingstepsecureconfigs` | Create/update and bind to steps; values not read back to renderer. |
| `sdkmessageprocessingstepimages` | Read, create, update, delete, add to solution. |
| `serviceendpoints` | Read, create, update, delete, enable/disable, add to solution. |
| `systemusers` | Read active users for run-as selection. |
| Dependency functions | Read required, dependent, and delete-blocking dependencies. |

## Validation Rules

| Rule | Status |
| --- | --- |
| Assembly must be a PE/CLR file | Shipped |
| Assembly metadata inspection must not execute plug-in code | Shipped |
| Registerable type discovery uses direct `IPlugin` interfaces and `CodeActivity` base types | Shipped |
| Warn for unsigned assembly | Shipped |
| Warn for no registerable types | Shipped |
| Warn for large assembly | Shipped |
| Create-message pre-image prevention | Shipped |
| Managed/system edit/delete prevention | Shipped |
| Secure config write-only behavior after save | Shipped |
| Update steps with all attributes warning | Gap |
| Native package content validation | Gap |
