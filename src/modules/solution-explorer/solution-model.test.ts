import { describe, expect, it } from "vitest"

import type {
  SolutionComponentSummary,
  SolutionDependencyItem,
  SolutionDependencyReport,
  SolutionLayer,
  SolutionSummary,
  SolutionWebResourceCandidate,
} from "@/core/dataverse/schemas"
import {
  buildDependencySections,
  buildSolutionLayerRows,
  defaultWebResourceRoot,
  filterSolutionComponents,
  filterSolutions,
  filterWebResourceCandidates,
  formatSelectedSource,
  formatSolutionDate,
  groupSolutionComponents,
  includesSolutionSearch,
} from "./solution-model"

const solutions: SolutionSummary[] = [
  {
    id: "managed",
    uniqueName: "Core",
    friendlyName: "Core Solution",
    version: "1.0.0.0",
    isManaged: true,
    isVisible: true,
    publisherName: "Microsoft",
    publisherPrefix: "msdyn",
  },
  {
    id: "unmanaged",
    uniqueName: "CustomerExtensions",
    friendlyName: "Customer Extensions",
    version: "2.0.0.0",
    isManaged: false,
    isVisible: true,
    publisherName: "Contoso",
    publisherPrefix: " con ",
  },
]

const baseComponent: SolutionComponentSummary = {
  id: "base",
  solutionId: "solution",
  objectId: "base-object",
  componentType: 1,
  componentTypeLabel: "Table",
  group: "Tables",
  displayName: "Base",
}

const dependencyItem: SolutionDependencyItem = {
  id: "dependency-1",
  dependencyType: 1,
  dependencyTypeLabel: "Published",
  dependentComponentType: 60,
  dependentComponentTypeLabel: "System Form",
  dependentComponentObjectId: "dependent-object",
  requiredComponentType: 61,
  requiredComponentTypeLabel: "Web Resource",
  requiredComponentObjectId: "required-object",
}

describe("solution search and filtering", () => {
  it("keeps the existing case-insensitive substring behavior", () => {
    expect(includesSolutionSearch("Customer Extensions", "EXTENS")).toBe(true)
    expect(includesSolutionSearch("Customer Extensions", "missing")).toBe(false)
    expect(includesSolutionSearch("", "")).toBe(true)
    expect(includesSolutionSearch(undefined, "")).toBe(false)
  })

  it("filters solutions by all searchable labels and managed state", () => {
    expect(filterSolutions(solutions, "core", "all").map(({ id }) => id)).toEqual([
      "managed",
    ])
    expect(
      filterSolutions(solutions, "CONTOSO", "unmanaged").map(({ id }) => id),
    ).toEqual(["unmanaged"])
    expect(filterSolutions(solutions, "", "managed").map(({ id }) => id)).toEqual([
      "managed",
    ])
    expect(filterSolutions(solutions, "core", "unmanaged")).toEqual([])
  })

  it("searches every component field used by the component list", () => {
    const components: SolutionComponentSummary[] = [
      { ...baseComponent, id: "display", displayName: "Account Form" },
      {
        ...baseComponent,
        id: "logical",
        displayName: "Logical",
        logicalName: "contact",
      },
      {
        ...baseComponent,
        id: "schema",
        displayName: "Schema",
        schemaName: "new_Project",
      },
      {
        ...baseComponent,
        id: "type",
        displayName: "Type",
        componentTypeLabel: "Canvas App",
      },
      {
        ...baseComponent,
        id: "group",
        displayName: "Group",
        group: "Processes",
      },
      {
        ...baseComponent,
        id: "object",
        objectId: "4b966290-unique",
        displayName: "Object",
      },
    ]

    const cases = [
      ["account", "display"],
      ["CONTACT", "logical"],
      ["project", "schema"],
      ["canvas", "type"],
      ["process", "group"],
      ["4B966290", "object"],
    ] as const

    for (const [search, expectedId] of cases) {
      expect(
        filterSolutionComponents(components, search).map(({ id }) => id),
      ).toEqual([expectedId])
    }
  })

  it("excludes candidates already in the solution after searching name, label, or type", () => {
    const candidates: SolutionWebResourceCandidate[] = [
      {
        id: "script",
        name: "con_/scripts/account.js",
        displayName: "Account Script",
        type: "js",
        typeCode: 3,
        isManaged: false,
        inSolution: false,
      },
      {
        id: "style",
        name: "con_/styles/site.css",
        type: "css",
        typeCode: 2,
        isManaged: false,
        inSolution: false,
      },
      {
        id: "existing",
        name: "con_/scripts/existing.js",
        displayName: "Existing Script",
        type: "js",
        typeCode: 3,
        isManaged: false,
        inSolution: true,
      },
    ]

    expect(
      filterWebResourceCandidates(candidates, "ACCOUNT").map(({ id }) => id),
    ).toEqual(["script"])
    expect(
      filterWebResourceCandidates(candidates, "css").map(({ id }) => id),
    ).toEqual(["style"])
    expect(filterWebResourceCandidates(candidates, "existing")).toEqual([])
    expect(
      filterWebResourceCandidates(candidates, "").map(({ id }) => id),
    ).toEqual(["script", "style"])
  })
})

describe("solution component grouping", () => {
  it("uses the established Dataverse group order and alphabetizes unknown groups", () => {
    const components: SolutionComponentSummary[] = [
      { ...baseComponent, id: "zeta", group: "Zeta", displayName: "Zeta" },
      {
        ...baseComponent,
        id: "web-first",
        group: "Web Resources",
        displayName: "Web First",
      },
      { ...baseComponent, id: "table", group: "Tables", displayName: "Table" },
      { ...baseComponent, id: "alpha", group: "Alpha", displayName: "Alpha" },
      {
        ...baseComponent,
        id: "web-second",
        group: "Web Resources",
        displayName: "Web Second",
      },
    ]

    const groups = groupSolutionComponents(components)

    expect(groups.map(([name]) => name)).toEqual([
      "Tables",
      "Web Resources",
      "Alpha",
      "Zeta",
    ])
    expect(groups[1]?.[1].map(({ id }) => id)).toEqual([
      "web-first",
      "web-second",
    ])
  })
})

describe("solution display formatting", () => {
  it("preserves date fallbacks and locale-aware valid dates", () => {
    const value = "2026-06-17T12:20:00Z"
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))

    expect(formatSolutionDate()).toBe("Unknown")
    expect(formatSolutionDate("")).toBe("Unknown")
    expect(formatSolutionDate("not-a-date")).toBe("not-a-date")
    expect(formatSolutionDate(value)).toBe(expected)
  })

  it("builds the established default root from a trimmed publisher prefix", () => {
    expect(defaultWebResourceRoot()).toBe("new_/CustomWebresource")
    expect(defaultWebResourceRoot({ ...solutions[1], publisherPrefix: "   " })).toBe(
      "new_/CustomWebresource",
    )
    expect(defaultWebResourceRoot(solutions[1])).toBe("con_/CustomWebresource")
  })

  it("summarizes zero, one, or multiple selected sources", () => {
    expect(formatSelectedSource([])).toBe("No source selected")
    expect(formatSelectedSource(["C:\\repo\\account.js"])).toBe(
      "C:\\repo\\account.js",
    )
    expect(formatSelectedSource(["one.js", "two.js", "three.js"])).toBe(
      "3 files selected",
    )
  })
})

describe("inspector view models", () => {
  it("maps dependency report sections, labels, and empty messages in display order", () => {
    const report: SolutionDependencyReport = {
      required: [dependencyItem],
      dependents: [],
      deleteBlockers: [{ ...dependencyItem, id: "blocker" }],
    }

    expect(buildDependencySections(report)).toEqual([
      {
        key: "required",
        title: "This Depends On",
        empty: "No required components returned.",
        rows: [
          {
            id: "dependency-1",
            dependentTypeLabel: "System Form",
            dependentObjectId: "dependent-object",
            requiredTypeLabel: "Web Resource",
            requiredObjectId: "required-object",
            dependencyTypeLabel: "Published",
          },
        ],
      },
      {
        key: "dependents",
        title: "Used By",
        empty: "No dependent components returned.",
        rows: [],
      },
      {
        key: "deleteBlockers",
        title: "Delete Blockers",
        empty: "No delete blockers returned.",
        rows: [
          {
            id: "blocker",
            dependentTypeLabel: "System Form",
            dependentObjectId: "dependent-object",
            requiredTypeLabel: "Web Resource",
            requiredObjectId: "required-object",
            dependencyTypeLabel: "Published",
          },
        ],
      },
    ])
    expect(buildDependencySections().every(({ rows }) => rows.length === 0)).toBe(
      true,
    )
  })

  it("maps layer fallbacks without losing zero or empty-string values", () => {
    const changed = "2026-07-01T08:30:00Z"
    const layers: SolutionLayer[] = [
      {
        id: "fallback",
        name: "Active",
      },
      {
        id: "explicit",
        name: "Active",
        solutionName: "",
        componentName: "Account",
        publisherName: "",
        order: 0,
        overwriteTime: changed,
      },
    ]

    expect(buildSolutionLayerRows(layers)).toEqual([
      {
        id: "fallback",
        order: "-",
        solutionName: "Active",
        componentName: undefined,
        publisherName: "Unknown",
        changed: "Unknown",
      },
      {
        id: "explicit",
        order: 0,
        solutionName: "",
        componentName: "Account",
        publisherName: "",
        changed: formatSolutionDate(changed),
      },
    ])
  })
})
