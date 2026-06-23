import { appCommitHash } from "@/core/build-info"

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  changes: string[]
}

const changelogSeenStorageKey = "opendataverse.changelog.last-seen-build"

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "0.1.51",
    date: "2026-06-23",
    title: "Webresource folder creation",
    changes: [
      "Added an Add Folder action to Webresource Management so users can create root folders or child folders from the folder context menu.",
      "Created folder markers as solution-scoped web resources and hid those markers from the resource tree while keeping browser-preview validation stateful.",
    ],
  },
  {
    version: "0.1.50",
    date: "2026-06-23",
    title: "Application icon refresh",
    changes: [
      "Replaced the app icon set with a rounded OpenDataverse brand mark that fits native dock and launcher surfaces.",
      "Updated the in-app header, empty state, and browser-preview favicon to use the same OpenDataverse icon.",
    ],
  },
  {
    version: "0.1.49",
    date: "2026-06-24",
    title: "Visual refresh across modules",
    changes: [
      "Refined global design tokens with a restrained OKLCH palette, warmer tinted neutrals, and consistent rounded surfaces.",
      "Overhauled the app shell, Webresource Management, AI Chat, Solution Explorer, and Plugin Registration modules for a calmer, more considered interface.",
      "Replaced harsh status badges, side-stripe borders, and aggressive destructive actions with subtler status pills and outline actions.",
      "Improved empty states and loading/error surfaces with icon wells and clearer copy.",
      "Added browser-preview mock coverage for Solution Explorer and Plugin Registration so the Browser plugin can validate these modules outside Tauri.",
      "Documented the design system in DESIGN.md and added agent maintainability guidelines in AGENTS.md.",
    ],
  },
  {
    version: "0.1.48",
    date: "2026-06-23",
    title: "Environment management cleanup",
    changes: [
      "Removed the duplicate Add button from the Manage Environments dialog so new environments are added from the main sidebar control without overlapping the dialog close button.",
    ],
  },
  {
    version: "0.1.47",
    date: "2026-06-23",
    title: "Webresource folder uploads",
    changes: [
      "Added a right-click folder action in Webresource Management for uploading one or more selected files directly into that web resource folder.",
      "Prefilled the upload target root from the selected folder so existing Dataverse folder paths can be reused without manually opening the general import flow.",
    ],
  },
  {
    version: "0.1.46",
    date: "2026-06-22",
    title: "Browser preview mock coverage",
    changes: [
      "Expanded browser-preview web resource mock data so PNG, JPG, GIF, ICO, and XSL resources can be tested with the Browser plugin.",
      "Matched browser-preview web resource content fallbacks to image and XSL resource types instead of returning JavaScript content for every non-PNG resource.",
      "Fixed closed dialogs so they no longer intercept clicks after nested browser-preview forms are submitted.",
    ],
  },
  {
    version: "0.1.45",
    date: "2026-06-22",
    title: "Web resource image previews",
    changes: [
      "Fixed Webresource Management so imported PNG, JPG, GIF, ICO, and XSL web resources are included in the resource list.",
      "Added preview-only rendering for binary image web resources instead of trying to open them as UTF-8 text.",
    ],
  },
  {
    version: "0.1.44",
    date: "2026-06-22",
    title: "AI chat history management",
    changes: [
      "Added right-click rename actions for saved AI Chat and AI Agent history entries.",
      "Added hover delete controls in Saved Chats so unwanted chat history entries can be removed locally.",
    ],
  },
  {
    version: "0.1.43",
    date: "2026-06-19",
    title: "Experimental AI agent",
    changes: [
      "Added a Danger Zone setting that hides or enables AI Agent (Experimental).",
      "Added AI Agent (Experimental) as an unsafe module with visible warnings that Dataverse changes can seriously harm an environment.",
      "Gave the experimental agent a write-capable Codex sandbox and an explicit Dataverse Web API mutation tool while keeping regular AI Chat read-only.",
    ],
  },
  {
    version: "0.1.42",
    date: "2026-06-19",
    title: "Environment management",
    changes: [
      "Added a Manage Environments dialog for editing, reconnecting, and deleting saved Dataverse environments.",
      "Kept environment deletes local-only by removing saved config, auth tokens, bindings, and open tabs without touching Dataverse.",
      "Made URL edits clear local auth and bindings, close affected tabs, and require an explicit reconnect.",
    ],
  },
  {
    version: "0.1.41",
    date: "2026-06-19",
    title: "Webresource Management chat removal",
    changes: [
      "Removed the embedded AI chat panel from Webresource Management so the workspace focuses on browsing, editing, binding, and publishing web resources.",
    ],
  },
  {
    version: "0.1.40",
    date: "2026-06-19",
    title: "AI chat pasted images",
    changes: [
      "Added AI Chat support for pasting screenshots and other images directly into the composer.",
      "Stored pasted images in the app cache, displayed them as pending attachments, and sent them to Codex with the chat turn.",
    ],
  },
  {
    version: "0.1.39",
    date: "2026-06-19",
    title: "AI chat attachments",
    changes: [
      "Added AI Chat composer actions for attaching screenshots, files, and folders as turn context.",
      "Sent selected image attachments to Codex as local images while bounding text file and folder context before it reaches the AI provider.",
      "Rendered attached screenshots, files, and folders in user chat messages with local thumbnail previews where available.",
    ],
  },
  {
    version: "0.1.38",
    date: "2026-06-19",
    title: "Web resource imports",
    changes: [
      "Added solution-scoped web resource imports from selected files or folders.",
      "Exposed web resource imports from Webresource Management and Solution Explorer.",
      "Preserved folder-relative paths under an editable Dataverse web resource root such as AG_/CustomWebresource.",
    ],
  },
  {
    version: "0.1.37",
    date: "2026-06-18",
    title: "Latest update install",
    changes: [
      "Changed the sidebar Update button to re-check release metadata when clicked so it installs the latest available OpenDataverse build instead of a previously cached update.",
    ],
  },
  {
    version: "0.1.36",
    date: "2026-06-18",
    title: "AI chat extended tool rounds",
    changes: [
      "Raised the bounded AI Chat Dataverse continuation ceiling to 32 tool rounds for deeper solution and component analysis.",
    ],
  },
  {
    version: "0.1.35",
    date: "2026-06-18",
    title: "AI chat broad lookup budget",
    changes: [
      "Raised the bounded AI Chat Dataverse tool budget so broader solution and component questions can finish without stopping after four rounds.",
      "Guided AI providers to group related Dataverse reads and summarize unresolved optional details instead of exhausting the tool loop.",
    ],
  },
  {
    version: "0.1.34",
    date: "2026-06-18",
    title: "Mac AI sidecar launcher",
    changes: [
      "Fixed AI Chat on macOS when OpenDataverse is launched outside a shell by resolving Node from OPENDATAVERSE_AI_NODE, PATH, Mise, Homebrew, and other common user-tool locations.",
      "Expanded the AI sidecar PATH on launch so provider tooling can find local command-line dependencies from the same mac desktop session.",
    ],
  },
  {
    version: "0.1.33",
    date: "2026-06-18",
    title: "Tauri backend modules",
    changes: [
      "Split the Rust Tauri backend out of the large lib.rs file into feature-focused backend modules for auth, AI chat, FetchXML, plug-in registration, Solution Explorer, and web resources.",
      "Kept Tauri command registration centralized while moving command implementations and related tests next to their feature code.",
    ],
  },
  {
    version: "0.1.32",
    date: "2026-06-18",
    title: "AI chat tool continuation",
    changes: [
      "Changed AI Chat to continue bounded Dataverse tool rounds until the provider has enough data to answer instead of stopping after the first tool-result summary.",
      "Tightened the AI chat prompt so additional Dataverse reads are requested as tool calls rather than described as the next step.",
    ],
  },
  {
    version: "0.1.31",
    date: "2026-06-18",
    title: "Plugin Registration error dialogs",
    changes: [
      "Added modal error dialogs for Plugin Registration write, inspection, dependency, lazy-load, and read-only guard failures so important errors are not hidden in the status area.",
    ],
  },
  {
    version: "0.1.30",
    date: "2026-06-18",
    title: "Plugin Registration tree navigation",
    changes: [
      "Changed Plugin Registration from a flat grouped list into a PRT-style expandable tree for packages, assemblies, plug-in types, steps, images, service endpoints, and webhooks.",
      "Changed startup loading to fetch only root registration nodes and form metadata; assembly, type, endpoint, and step descendants now load when their tree node is expanded.",
    ],
  },
  {
    version: "0.1.29",
    date: "2026-06-18",
    title: "Plugin Registration layout fix",
    changes: [
      "Changed the Plugin Registration workspace to stack the detail pane below the table on narrower desktop widths so registration text and actions no longer overlap.",
      "Removed unsupported service endpoint state reads and toggles so endpoint loading no longer requests Dataverse state fields that are not exposed by service endpoints.",
    ],
  },
  {
    version: "0.1.28",
    date: "2026-06-18",
    title: "Plugin Registration unmanaged default",
    changes: [
      "Changed Plugin Registration to load unmanaged assemblies, packages, types, steps, images, and service endpoints by default.",
      "Aligned browser-preview Plugin Registration data with the unmanaged working set used by native Dataverse reads.",
    ],
  },
  {
    version: "0.1.27",
    date: "2026-06-18",
    title: "Plugin Registration load resilience",
    changes: [
      "Changed Plugin Registration startup to load registration sections with bounded fallbacks so one slow Dataverse table does not block the whole tool.",
      "Added visible Plugin Registration load warnings and disabled automatic retry loops for the initial registry snapshot.",
    ],
  },
  {
    version: "0.1.26",
    date: "2026-06-18",
    title: "Plugin Registration",
    changes: [
      "Added the Plugin Registration workspace for assemblies, plug-in types, steps, images, service endpoints, inspection, dependencies, and export workflows.",
      "Added browser-preview mock data and validation contracts for native Dataverse plug-in registration.",
    ],
  },
  {
    version: "0.1.25",
    date: "2026-06-18",
    title: "ChatGPT 5.3 Spark default",
    changes: [
      "Changed the Codex AI chat default model from GPT 5.4 mini to ChatGPT 5.3 Spark.",
    ],
  },
  {
    version: "0.1.24",
    date: "2026-06-17",
    title: "Webresource AI assistant",
    changes: [
      "Added a compact AI chat panel to Webresource Management with Codex and Claude provider selectors.",
      "Scoped webresource chat prompts to the selected resource or the current webresource view.",
    ],
  },
  {
    version: "0.1.23",
    date: "2026-06-17",
    title: "Solution Explorer load defaults",
    changes: [
      "Loaded unmanaged solutions first in newest-created order and removed startup component-count fan-out.",
      "Limited existing web resource add candidates to unmanaged developer resources and excluded Microsoft-prefixed resources.",
    ],
  },
  {
    version: "0.1.22",
    date: "2026-06-17",
    title: "Hidden Windows AI sidecar",
    changes: [
      "Started the AI sidecar without opening a blank console window on Windows.",
    ],
  },
  {
    version: "0.1.21",
    date: "2026-06-17",
    title: "AI sidecar provider isolation",
    changes: [
      "Loaded AI provider runtimes only when their provider is used so Claude setup cannot break Codex chat startup.",
      "Included Claude sidecar runtime files in packaged desktop builds.",
    ],
  },
  {
    version: "0.1.20",
    date: "2026-06-17",
    title: "Full Xrm IntelliSense",
    changes: [
      "Expanded web resource JavaScript IntelliSense to use maintained Xrm client API type declarations.",
      "Added completions and diagnostics coverage for global context user settings, Xrm namespaces, and XrmEnum values.",
    ],
  },
  {
    version: "0.1.19",
    date: "2026-06-17",
    title: "Solution Explorer",
    changes: [
      "Added the Solution Explorer workspace for browsing Dataverse solutions and grouped solution components.",
      "Added component details, dependency inspection, solution layers, and solution-scoped web resource add/create actions.",
    ],
  },
  {
    version: "0.1.18",
    date: "2026-06-17",
    title: "Script editing IntelliSense and save flow",
    changes: [
      "Added JavaScript IntelliSense for Dataverse client scripts in Web Resource Management.",
      "Improved script editing so changes can be saved from the editor workflow.",
    ],
  },
  {
    version: "0.1.17",
    date: "2026-06-17",
    title: "Web Resource Management",
    changes: [
      "Renamed Autopublisher to Web Resource Management across the app.",
      "Added web resource file editing alongside bindings, publish actions, and activity history.",
    ],
  },
  {
    version: "0.1.16",
    date: "2026-06-17",
    title: "AI chat history",
    changes: [
      "Added the ability to return to previous AI chat threads.",
      "Persisted chat thread summaries so older Dataverse conversations can be resumed.",
    ],
  },
  {
    version: "0.1.15",
    date: "2026-06-17",
    title: "Codex chat stability",
    changes: [
      "Hardened the Codex-backed AI chat path and related Tauri sidecar commands.",
      "Expanded setup documentation for the local AI chat runtime.",
    ],
  },
  {
    version: "0.1.14",
    date: "2026-06-17",
    title: "Claude chat support",
    changes: [
      "Added a Claude sidecar session path for AI chat experiments.",
      "Refined AI chat provider handling and Dataverse tool calls.",
    ],
  },
  {
    version: "0.1.13",
    date: "2026-06-17",
    title: "Table metadata cleanup",
    changes: [
      "Cleaned up Dataverse table metadata returned to the app.",
      "Documented architecture decisions from the metadata changes.",
    ],
  },
  {
    version: "0.1.12",
    date: "2026-06-12",
    title: "FetchXML Builder",
    changes: [
      "Added the FetchXML Builder workspace for composing Dataverse queries.",
      "Added desktop bridge support for table metadata, attributes, relationships, and query execution.",
    ],
  },
  {
    version: "0.1.11",
    date: "2026-06-12",
    title: "AI defaults and tool tabs",
    changes: [
      "Updated the AI chat defaults to the cheaper GPT 5.4 mini profile.",
      "Reused existing tool tabs per environment and added the deliberate Open Second Tab action.",
    ],
  },
  {
    version: "0.1.10",
    date: "2026-06-12",
    title: "Authentication fixes",
    changes: [
      "Improved Dataverse authentication recovery and heartbeat state handling.",
      "Added clearer environment prompts before opening environment-specific tools.",
    ],
  },
  {
    version: "0.1.9",
    date: "2026-06-12",
    title: "Release sidecar packaging",
    changes: [
      "Fixed the release workflow so the AI sidecar dependencies are installed before packaging.",
    ],
  },
  {
    version: "0.1.7",
    date: "2026-06-12",
    title: "Dark mode and file unbind",
    changes: [
      "Added the Settings appearance tab with dark mode preference persistence.",
      "Added support for unbinding local files from Dataverse web resources.",
    ],
  },
  {
    version: "0.1.6",
    date: "2026-06-12",
    title: "File watch auto-publish",
    changes: [
      "Added local file watching for web resource bindings.",
      "Added auto-publish support when watched files change.",
    ],
  },
  {
    version: "0.1.5",
    date: "2026-06-12",
    title: "Nightly build labels",
    changes: [
      "Displayed the nightly commit hash in the app chrome and window title.",
    ],
  },
  {
    version: "0.1.4",
    date: "2026-06-12",
    title: "Updater metadata fix",
    changes: [
      "Fixed the updater metadata workflow input for release publishing.",
    ],
  },
  {
    version: "0.1.3",
    date: "2026-06-12",
    title: "Sidebar cleanup",
    changes: ["Removed the desktop subtitle from the sidebar header."],
  },
  {
    version: "0.1.2",
    date: "2026-06-11",
    title: "Release workflow update",
    changes: [
      "Updated the Tauri release action version used by GitHub Actions.",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-06-11",
    title: "Auto-updates",
    changes: [
      "Added Tauri auto-update support with signed updater artifacts.",
      "Added the sidebar Update pill for installing available releases.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-11",
    title: "Initial desktop app",
    changes: [
      "Created the Tauri and React desktop shell for OpenDataverse.",
      "Added environment management, Dataverse connection checks, and initial web resource publishing tools.",
    ],
  },
]

export const latestChangelogEntry = changelogEntries[0]

export function getChangelogBuildId(appVersion: string) {
  return `${appVersion}:${appCommitHash}`
}

function getLocalStorage() {
  if (typeof window === "undefined") {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function shouldShowChangelogForBuild(buildId: string) {
  return getLocalStorage()?.getItem(changelogSeenStorageKey) !== buildId
}

export function markChangelogBuildSeen(buildId: string) {
  getLocalStorage()?.setItem(changelogSeenStorageKey, buildId)
}
