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
    changes: [
      "Removed the desktop subtitle from the sidebar header.",
    ],
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
