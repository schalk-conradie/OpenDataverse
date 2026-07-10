import { describe, expect, it } from "vitest"

import type { PluginRegistrationSnapshot } from "@/core/dataverse/schemas"
import {
  mockPluginAssemblies,
  mockPluginPackages,
  mockPluginRegistrationSnapshot,
  mockPluginServiceEndpoints,
  mockPluginStepImages,
  mockPluginSteps,
  mockPluginTypes,
} from "./mock-data"
import {
  buildTreeRows,
  componentTypeForItem,
  editabilityReasonLabel,
  filterRegistryRows,
  formatBytes,
  formatDate,
  kindLabel,
  registryItemKey,
  registryItems,
  registryItemState,
  stepStateActionLabel,
  type PluginTreeChildren,
  type RegistryItem,
} from "./registry-model"

const snapshot: PluginRegistrationSnapshot = {
  ...mockPluginRegistrationSnapshot,
  packages: mockPluginPackages,
  assemblies: mockPluginAssemblies,
  endpoints: mockPluginServiceEndpoints,
}

const children: PluginTreeChildren = {
  typesByAssembly: {
    [mockPluginAssemblies[0].id]: mockPluginTypes.filter(
      (pluginType) => pluginType.assemblyId === mockPluginAssemblies[0].id,
    ),
    [mockPluginAssemblies[1].id]: mockPluginTypes.filter(
      (pluginType) => pluginType.assemblyId === mockPluginAssemblies[1].id,
    ),
  },
  stepsByType: {
    [mockPluginTypes[0].id]: mockPluginSteps.filter(
      (step) => step.pluginTypeId === mockPluginTypes[0].id,
    ),
    [mockPluginTypes[1].id]: mockPluginSteps.filter(
      (step) => step.pluginTypeId === mockPluginTypes[1].id,
    ),
  },
  stepsByEndpoint: {
    [mockPluginServiceEndpoints[0].id]: mockPluginSteps.filter(
      (step) =>
        step.serviceEndpointId === mockPluginServiceEndpoints[0].id,
    ),
  },
  imagesByStep: {
    [mockPluginSteps[0].id]: mockPluginStepImages.filter(
      (image) => image.stepId === mockPluginSteps[0].id,
    ),
  },
}

const expandedKeys = new Set([
  `package:${mockPluginPackages[0].id}`,
  `assembly:${mockPluginAssemblies[0].id}`,
  `assembly:${mockPluginAssemblies[1].id}`,
  `type:${mockPluginTypes[0].id}`,
  `type:${mockPluginTypes[1].id}`,
  `step:${mockPluginSteps[0].id}`,
  `endpoint:${mockPluginServiceEndpoints[0].id}`,
])

function requireItem(
  items: readonly RegistryItem[],
  kind: RegistryItem["kind"],
  id: string,
): RegistryItem {
  const item = items.find((candidate) => candidate.kind === kind && candidate.id === id)
  if (!item) {
    throw new Error(`Missing ${kind}:${id}`)
  }

  return item
}

describe("plug-in registry hierarchy", () => {
  it("keeps packaged assemblies nested while standalone assemblies and endpoints stay at the root", () => {
    const collapsedRows = buildTreeRows(snapshot, children, new Set(), new Set())

    expect(
      collapsedRows.map((row) => [row.item.kind, row.depth, row.childCount]),
    ).toEqual([
      ["package", 0, 1],
      ["assembly", 0, 1],
      ["endpoint", 0, 1],
    ])

    const loadingKey = `type:${mockPluginTypes[0].id}`
    const rows = buildTreeRows(
      snapshot,
      children,
      expandedKeys,
      new Set([loadingKey]),
    )

    expect(rows.map((row) => [row.item.kind, row.depth])).toEqual([
      ["package", 0],
      ["assembly", 1],
      ["type", 2],
      ["step", 3],
      ["image", 4],
      ["type", 2],
      ["step", 3],
      ["assembly", 0],
      ["type", 1],
      ["endpoint", 0],
      ["step", 1],
    ])
    expect(rows.find((row) => row.key === loadingKey)?.loading).toBe(true)
    expect(rows.find((row) => row.item.kind === "image")).toMatchObject({
      expandable: false,
      childCount: undefined,
    })
  })

  it("filters only the rows exposed by the current expansion state", () => {
    const collapsedRows = buildTreeRows(snapshot, children, new Set(), new Set())
    const rows = buildTreeRows(snapshot, children, expandedKeys, new Set())

    expect(filterRegistryRows(collapsedRows, "all", "PREACCOUNT")).toEqual([])
    expect(
      filterRegistryRows(rows, "all", "PREACCOUNT").map((row) => row.key),
    ).toEqual([`image:${mockPluginStepImages[0].id}`])
    expect(filterRegistryRows(rows, "step", "").map((row) => row.item.id)).toEqual(
      mockPluginSteps.map((step) => step.id),
    )
    expect(
      filterRegistryRows(rows, "assembly", mockPluginAssemblies[1].id).map(
        (row) => row.item.id,
      ),
    ).toEqual([mockPluginAssemblies[1].id])
  })
})

describe("plug-in registry item view models", () => {
  const items = registryItems(snapshot, children)

  it("maps source records to stable titles, subtitles, keys, and component types", () => {
    const pluginType = requireItem(items, "type", mockPluginTypes[0].id)
    const step = requireItem(items, "step", mockPluginSteps[0].id)
    const image = requireItem(items, "image", mockPluginStepImages[0].id)

    expect(pluginType).toMatchObject({
      title: mockPluginTypes[0].friendlyName,
      subtitle: mockPluginTypes[0].typeName,
    })
    expect(step).toMatchObject({
      subtitle: "Update · account · Pre-operation",
      enabled: true,
    })
    expect(image.subtitle).toBe(
      `PreImage · ${mockPluginStepImages[0].stepName}`,
    )
    expect(registryItemKey(step)).toBe(`step:${mockPluginSteps[0].id}`)

    expect(
      Object.fromEntries(
        items
          .filter(
            (item, index, all) =>
              all.findIndex((candidate) => candidate.kind === item.kind) === index,
          )
          .map((item) => [item.kind, componentTypeForItem(item)]),
      ),
    ).toEqual({
      package: 10029,
      assembly: 91,
      type: 90,
      step: 92,
      image: 93,
      endpoint: 95,
    })
    expect(kindLabel("endpoint")).toBe("Endpoint")
  })

  it("derives managed and step states before presenting their labels", () => {
    const managedAssembly = requireItem(
      items,
      "assembly",
      mockPluginAssemblies[1].id,
    )
    const enabledStep = requireItem(items, "step", mockPluginSteps[0].id)
    const disabledStep = requireItem(items, "step", mockPluginSteps[1].id)
    const unmanagedPackage = requireItem(
      items,
      "package",
      mockPluginPackages[0].id,
    )

    expect(registryItemState(managedAssembly)).toEqual({
      kind: "managed",
      label: "Managed",
    })
    expect(registryItemState(enabledStep)).toEqual({
      kind: "enabled",
      label: "Enabled",
    })
    expect(registryItemState(disabledStep)).toEqual({
      kind: "disabled",
      label: "Disabled",
    })
    expect(registryItemState(unmanagedPackage)).toEqual({
      kind: "unmanaged",
      label: "Unmanaged",
    })
    expect(editabilityReasonLabel(managedAssembly.editable)).toBe(
      "Managed component",
    )
    expect(stepStateActionLabel(true)).toBe("Disable")
    expect(stepStateActionLabel(false)).toBe("Enable")
  })

  it("preserves existing date and byte formatting fallbacks", () => {
    const dateValue = "2026-06-17T12:20:00Z"

    expect(formatDate()).toBe("Unknown")
    expect(formatDate("not-a-date")).toBe("not-a-date")
    expect(formatDate(dateValue)).not.toBe(dateValue)
    expect(formatBytes()).toBe("Unknown")
    expect(formatBytes(0)).toBe("Unknown")
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB")
  })
})
