import type {
  PluginAssemblySummary,
  PluginEditableState,
  PluginPackageSummary,
  PluginRegistrationSnapshot,
  PluginServiceEndpointSummary,
  PluginStepImageSummary,
  PluginStepSummary,
  PluginTypeSummary,
} from "@/core/dataverse/schemas"

export type RegistryKind =
  | "package"
  | "assembly"
  | "type"
  | "step"
  | "image"
  | "endpoint"

type RegistryItemBase = {
  id: string
  title: string
  subtitle: string
  managed: boolean
  editable: PluginEditableState
}

export type RegistryItem =
  | (RegistryItemBase & {
      kind: "package"
      data: PluginPackageSummary
    })
  | (RegistryItemBase & {
      kind: "assembly"
      data: PluginAssemblySummary
    })
  | (RegistryItemBase & {
      kind: "type"
      data: PluginTypeSummary
    })
  | (RegistryItemBase & {
      kind: "step"
      enabled: boolean
      data: PluginStepSummary
    })
  | (RegistryItemBase & {
      kind: "image"
      data: PluginStepImageSummary
    })
  | (RegistryItemBase & {
      kind: "endpoint"
      data: PluginServiceEndpointSummary
    })

export type RegistryTreeRow = {
  key: string
  item: RegistryItem
  depth: number
  expandable: boolean
  expanded: boolean
  loading: boolean
  childCount?: number
}

export type PluginTreeChildren = {
  typesByAssembly: Readonly<
    Record<string, readonly PluginTypeSummary[] | undefined>
  >
  stepsByType: Readonly<
    Record<string, readonly PluginStepSummary[] | undefined>
  >
  stepsByEndpoint: Readonly<
    Record<string, readonly PluginStepSummary[] | undefined>
  >
  imagesByStep: Readonly<
    Record<string, readonly PluginStepImageSummary[] | undefined>
  >
}

export type RegistryItemState =
  | { kind: "managed"; label: "Managed" }
  | { kind: "enabled"; label: "Enabled" }
  | { kind: "disabled"; label: "Disabled" }
  | { kind: "unmanaged"; label: "Unmanaged" }

function includesSearch(value: string | undefined, search: string): boolean {
  return value?.toLowerCase().includes(search.toLowerCase()) ?? false
}

export function formatDate(value?: string): string {
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

export function formatBytes(value?: number): string {
  if (!value) {
    return "Unknown"
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function componentTypeForItem(item: RegistryItem): number {
  switch (item.kind) {
    case "assembly":
      return 91
    case "type":
      return 90
    case "step":
      return 92
    case "image":
      return 93
    case "endpoint":
      return 95
    case "package":
      return 10029
  }
}

export function registryItemKey(
  item: Pick<RegistryItem, "kind" | "id">,
): string {
  return `${item.kind}:${item.id}`
}

function packageItem(item: PluginPackageSummary): RegistryItem {
  return {
    kind: "package",
    id: item.id,
    title: item.name,
    subtitle: item.version ?? item.fileName ?? "Package",
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function assemblyItem(item: PluginAssemblySummary): RegistryItem {
  return {
    kind: "assembly",
    id: item.id,
    title: item.name,
    subtitle: `${item.version} · ${item.isolationModeLabel}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function typeItem(item: PluginTypeSummary): RegistryItem {
  return {
    kind: "type",
    id: item.id,
    title: item.friendlyName || item.typeName,
    subtitle: item.typeName,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function stepItem(item: PluginStepSummary): RegistryItem {
  return {
    kind: "step",
    id: item.id,
    title: item.name,
    subtitle: `${item.messageName} · ${item.primaryEntity ?? "global"} · ${item.stageLabel}`,
    managed: item.isManaged,
    enabled: item.stateCode === 0,
    editable: item.editable,
    data: item,
  }
}

function imageItem(item: PluginStepImageSummary): RegistryItem {
  return {
    kind: "image",
    id: item.id,
    title: item.name,
    subtitle: `${item.imageTypeLabel} · ${item.stepName}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

function endpointItem(item: PluginServiceEndpointSummary): RegistryItem {
  return {
    kind: "endpoint",
    id: item.id,
    title: item.name,
    subtitle: `${item.contractLabel} · ${item.authTypeLabel}`,
    managed: item.isManaged,
    editable: item.editable,
    data: item,
  }
}

export function registryItems(
  snapshot: PluginRegistrationSnapshot,
  children: PluginTreeChildren,
): RegistryItem[] {
  return [
    ...snapshot.packages.map(packageItem),
    ...snapshot.assemblies.map(assemblyItem),
    ...Object.values(children.typesByAssembly)
      .flatMap((items) => items ?? [])
      .map(typeItem),
    ...Object.values(children.stepsByType)
      .flatMap((items) => items ?? [])
      .map(stepItem),
    ...Object.values(children.stepsByEndpoint)
      .flatMap((items) => items ?? [])
      .map(stepItem),
    ...Object.values(children.imagesByStep)
      .flatMap((items) => items ?? [])
      .map(imageItem),
    ...snapshot.endpoints.map(endpointItem),
  ]
}

export function buildTreeRows(
  snapshot: PluginRegistrationSnapshot,
  children: PluginTreeChildren,
  expandedKeys: ReadonlySet<string>,
  loadingKeys: ReadonlySet<string>,
): RegistryTreeRow[] {
  const rows: RegistryTreeRow[] = []
  const assembliesByPackage = new Map<string, PluginAssemblySummary[]>()
  const packagedAssemblyIds = new Set<string>()

  for (const assembly of snapshot.assemblies) {
    if (assembly.packageId) {
      packagedAssemblyIds.add(assembly.id)
      assembliesByPackage.set(assembly.packageId, [
        ...(assembliesByPackage.get(assembly.packageId) ?? []),
        assembly,
      ])
    }
  }

  function pushRow(
    item: RegistryItem,
    depth: number,
    expandable: boolean,
    childCount?: number,
  ): void {
    const key = registryItemKey(item)
    rows.push({
      key,
      item,
      depth,
      expandable,
      expanded: expandedKeys.has(key),
      loading: loadingKeys.has(key),
      childCount,
    })
  }

  function pushStep(step: PluginStepSummary, depth: number): void {
    const item = stepItem(step)
    const images = children.imagesByStep[step.id]
    pushRow(item, depth, true, images?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const image of images ?? []) {
        pushRow(imageItem(image), depth + 1, false)
      }
    }
  }

  function pushType(pluginType: PluginTypeSummary, depth: number): void {
    const item = typeItem(pluginType)
    const steps = children.stepsByType[pluginType.id]
    pushRow(item, depth, true, steps?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const step of steps ?? []) {
        pushStep(step, depth + 1)
      }
    }
  }

  function pushAssembly(assembly: PluginAssemblySummary, depth: number): void {
    const item = assemblyItem(assembly)
    const pluginTypes = children.typesByAssembly[assembly.id]
    pushRow(item, depth, true, pluginTypes?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const pluginType of pluginTypes ?? []) {
        pushType(pluginType, depth + 1)
      }
    }
  }

  for (const pluginPackage of snapshot.packages) {
    const item = packageItem(pluginPackage)
    const assemblies = assembliesByPackage.get(pluginPackage.id) ?? []
    pushRow(item, 0, assemblies.length > 0, assemblies.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const assembly of assemblies) {
        pushAssembly(assembly, 1)
      }
    }
  }

  for (const assembly of snapshot.assemblies) {
    if (!packagedAssemblyIds.has(assembly.id)) {
      pushAssembly(assembly, 0)
    }
  }

  for (const endpoint of snapshot.endpoints) {
    const item = endpointItem(endpoint)
    const steps = children.stepsByEndpoint[endpoint.id]
    pushRow(item, 0, true, steps?.length)
    if (expandedKeys.has(registryItemKey(item))) {
      for (const step of steps ?? []) {
        pushStep(step, 1)
      }
    }
  }

  return rows
}

export function filterRegistryRows(
  rows: readonly RegistryTreeRow[],
  kindFilter: RegistryKind | "all",
  search: string,
): RegistryTreeRow[] {
  return rows.filter((row) => {
    const matchesKind =
      kindFilter === "all" || row.item.kind === kindFilter
    const matchesSearch =
      !search.trim() ||
      includesSearch(row.item.title, search) ||
      includesSearch(row.item.subtitle, search) ||
      includesSearch(row.item.id, search)

    return matchesKind && matchesSearch
  })
}

const kindLabels: Record<RegistryKind, string> = {
  package: "Package",
  assembly: "Assembly",
  type: "Type",
  step: "Step",
  image: "Image",
  endpoint: "Endpoint",
}

export function kindLabel(kind: RegistryKind): string {
  return kindLabels[kind]
}

export function registryItemState(item: RegistryItem): RegistryItemState {
  if (item.managed) {
    return { kind: "managed", label: "Managed" }
  }

  if (item.kind === "step") {
    return item.enabled
      ? { kind: "enabled", label: "Enabled" }
      : { kind: "disabled", label: "Disabled" }
  }

  return { kind: "unmanaged", label: "Unmanaged" }
}

export function editabilityReasonLabel(
  editable: PluginEditableState,
): string {
  return editable.reasons.join(", ")
}

export function stepStateActionLabel(enabled: boolean): "Disable" | "Enable" {
  return enabled ? "Disable" : "Enable"
}
