import type {
  SolutionComponentSummary,
  SolutionDependencyItem,
  SolutionDependencyReport,
  SolutionLayer,
  SolutionSummary,
  SolutionWebResourceCandidate,
} from "@/core/dataverse/schemas"

const componentGroupOrder: readonly string[] = [
  "Tables",
  "Columns",
  "Relationships",
  "Choices",
  "Keys and Indexes",
  "Forms",
  "Views",
  "Processes",
  "Charts",
  "Web Resources",
  "Site Maps",
  "Apps",
  "Custom Controls",
  "Environment Variables",
  "Security",
  "Developer Extensions",
  "Connectors",
  "AI",
  "Other",
]

type ManagedFilter = "all" | "unmanaged" | "managed"

export type SolutionComponentGroup = [
  name: string,
  components: SolutionComponentSummary[],
]

export type SolutionDependencyRow = {
  readonly id: string
  readonly dependentTypeLabel: string
  readonly dependentObjectId: string
  readonly requiredTypeLabel: string
  readonly requiredObjectId: string
  readonly dependencyTypeLabel: string
}

export type SolutionDependencySection = {
  readonly key: keyof SolutionDependencyReport
  readonly title: string
  readonly empty: string
  readonly rows: readonly SolutionDependencyRow[]
}

export type SolutionLayerRow = {
  readonly id: string
  readonly order: number | "-"
  readonly solutionName: string
  readonly componentName?: string
  readonly publisherName: string
  readonly changed: string
}

const dependencySectionDefinitions = [
  {
    key: "required",
    title: "This Depends On",
    empty: "No required components returned.",
  },
  {
    key: "dependents",
    title: "Used By",
    empty: "No dependent components returned.",
  },
  {
    key: "deleteBlockers",
    title: "Delete Blockers",
    empty: "No delete blockers returned.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof SolutionDependencyReport
  title: string
  empty: string
}>

export function formatSolutionDate(value?: string): string {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function includesSolutionSearch(
  value: string | undefined,
  search: string,
): boolean {
  return value?.toLowerCase().includes(search.toLowerCase()) ?? false
}

export function defaultWebResourceRoot(solution?: SolutionSummary): string {
  const publisherPrefix = solution?.publisherPrefix?.trim()
  const prefix =
    publisherPrefix === undefined || publisherPrefix === ""
      ? "new"
      : publisherPrefix

  return `${prefix}_/CustomWebresource`
}

export function formatSelectedSource(paths: readonly string[]): string {
  if (paths.length === 0) {
    return "No source selected"
  }

  if (paths.length === 1) {
    return paths[0]
  }

  return `${paths.length} files selected`
}

function solutionMatchesFilter(
  solution: SolutionSummary,
  filter: ManagedFilter,
): boolean {
  if (filter === "managed") {
    return solution.isManaged
  }

  if (filter === "unmanaged") {
    return !solution.isManaged
  }

  return true
}

export function filterSolutions(
  solutions: readonly SolutionSummary[],
  search: string,
  filter: ManagedFilter,
): SolutionSummary[] {
  return solutions.filter((solution) => {
    const matchesSearch =
      includesSolutionSearch(solution.friendlyName, search) ||
      includesSolutionSearch(solution.uniqueName, search) ||
      includesSolutionSearch(solution.publisherName, search)

    return matchesSearch && solutionMatchesFilter(solution, filter)
  })
}

export function filterSolutionComponents(
  components: readonly SolutionComponentSummary[],
  search: string,
): SolutionComponentSummary[] {
  return components.filter(
    (component) =>
      includesSolutionSearch(component.displayName, search) ||
      includesSolutionSearch(component.logicalName, search) ||
      includesSolutionSearch(component.schemaName, search) ||
      includesSolutionSearch(component.componentTypeLabel, search) ||
      includesSolutionSearch(component.group, search) ||
      includesSolutionSearch(component.objectId, search),
  )
}

export function filterWebResourceCandidates(
  candidates: readonly SolutionWebResourceCandidate[],
  search: string,
): SolutionWebResourceCandidate[] {
  return candidates.filter((candidate) => {
    const matchesSearch =
      includesSolutionSearch(candidate.name, search) ||
      includesSolutionSearch(candidate.displayName, search) ||
      includesSolutionSearch(candidate.type, search)

    return matchesSearch && !candidate.inSolution
  })
}

export function groupSolutionComponents(
  components: readonly SolutionComponentSummary[],
): SolutionComponentGroup[] {
  const groups = new Map<string, SolutionComponentSummary[]>()

  for (const component of components) {
    const items = groups.get(component.group) ?? []
    items.push(component)
    groups.set(component.group, items)
  }

  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = componentGroupOrder.indexOf(left)
    const rightIndex = componentGroupOrder.indexOf(right)
    const normalizedLeft =
      leftIndex === -1 ? componentGroupOrder.length : leftIndex
    const normalizedRight =
      rightIndex === -1 ? componentGroupOrder.length : rightIndex

    return normalizedLeft - normalizedRight || left.localeCompare(right)
  })
}

function buildDependencyRow(
  item: SolutionDependencyItem,
): SolutionDependencyRow {
  return {
    id: item.id,
    dependentTypeLabel: item.dependentComponentTypeLabel,
    dependentObjectId: item.dependentComponentObjectId,
    requiredTypeLabel: item.requiredComponentTypeLabel,
    requiredObjectId: item.requiredComponentObjectId,
    dependencyTypeLabel: item.dependencyTypeLabel,
  }
}

export function buildDependencySections(
  report?: SolutionDependencyReport,
): SolutionDependencySection[] {
  return dependencySectionDefinitions.map((definition) => ({
    ...definition,
    rows: (report?.[definition.key] ?? []).map(buildDependencyRow),
  }))
}

export function buildSolutionLayerRows(
  layers: readonly SolutionLayer[],
): SolutionLayerRow[] {
  return layers.map((layer) => ({
    id: layer.id,
    order: layer.order ?? "-",
    solutionName: layer.solutionName ?? layer.name,
    componentName: layer.componentName,
    publisherName: layer.publisherName ?? "Unknown",
    changed: formatSolutionDate(layer.overwriteTime),
  }))
}
