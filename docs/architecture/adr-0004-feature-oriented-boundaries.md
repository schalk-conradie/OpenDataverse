# Feature-Oriented Boundaries With A Thin Composition Root

Date: 2026-07-10
Status: Accepted

## Context

OpenDataverse has clear product-level modules and strong renderer, Tauri, and AI-sidecar security boundaries. As the feature set grew, several source files became complete subsystems: feature TSX files own rendering, domain transforms, queries, mutations, dialogs, and local workflows; the frontend desktop bridge knows every feature and its browser mock data; and the Rust backend parent module provides a broad implicit namespace through `use super::*`.

The product must continue supporting a realistic browser preview while privileged Dataverse auth and writes remain in Tauri. The refactor must preserve behavior and avoid a speculative framework, generic service layer, or new dependency.

## Decision

Use feature-oriented vertical slices with explicit shared foundations and a thin composition root.

Each frontend feature owns:

- its rendered module and focused child components
- pure domain transforms and feature-specific types
- its typed Tauri command gateway
- its browser-preview implementation and mock state
- focused tests for domain behavior and gateway contracts

Shared frontend code owns only concepts used independently by multiple features, such as application configuration, appearance, error formatting, runtime detection, and reusable UI primitives. Shared code must not import feature implementations or feature mock data.

The app shell owns environment selection, tool/window composition, settings, updates, and notifications. The tool registry is the single mapping from tool identity to presentation and lazy module loading. Zustand remains the workspace state mechanism, but pure transitions are separated from effects and persistence where that makes behavior independently testable.

The Rust backend keeps one Tauri composition root and explicit feature command modules. Persisted configuration/token operations and authenticated Dataverse transport become named shared modules. Feature modules import only the shared types and functions they use; wildcard imports from the parent backend module are not permitted.

The composition root registers only commands used by the renderer. AI provider
tool helpers that are called internally by the Rust tool loop remain private
Rust functions rather than additional renderer-facing commands.

Renderer-to-Tauri command names and serialized shapes remain stable during structural moves. Contract changes require focused validation, tests, and a separate documented rationale.

## Consequences

- A developer can understand or change one feature without loading the implementation details of every other feature.
- Browser-preview code remains a first-class verification adapter but no longer reverses the dependency from shared core into feature modules.
- Pure transforms and state transitions can be tested without rendering React or starting Tauri.
- Explicit Rust imports make feature dependencies and shared infrastructure visible.
- Some files and imports increase because ownership is represented directly rather than hidden inside large files.
- The refactor must be incremental; large mechanical moves without characterization tests would increase regression risk.

## Alternatives Considered

- Keep one file per feature: rejected because current feature files combine too many independently changing responsibilities and are already difficult to review and test.
- Introduce generic repositories, service containers, or a dependency-injection framework: rejected because the app has concrete feature boundaries and does not need runtime indirection.
- Move all browser-preview behavior into one global mock backend: rejected because it recreates the current feature-aware core dependency and makes feature simulations drift together.
- Rewrite the application around a new frontend or backend framework: rejected because the existing runtime and security boundaries are appropriate; the maintainability problem is ownership and dependency direction, not technology choice.
