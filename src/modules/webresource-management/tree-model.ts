import type {
  WebResource,
  WebResourceBinding,
} from "@/core/dataverse/schemas"

export type ResourceTreeFolder = {
  type: "folder"
  id: string
  name: string
  path: string
  children: ResourceTreeNode[]
  resourceCount: number
  boundCount: number
  markerResource?: WebResource
}

export type ResourceTreeFile = {
  type: "file"
  id: string
  name: string
  resource: WebResource
}

export type ResourceTreeNode = ResourceTreeFolder | ResourceTreeFile

export type ResourceTreeRow =
  | {
      type: "folder"
      folder: ResourceTreeFolder
      depth: number
    }
  | {
      type: "file"
      file: ResourceTreeFile
      depth: number
    }

export type BindingTreeFolder = {
  type: "folder"
  id: string
  name: string
  path: string
  children: BindingTreeNode[]
  bindingCount: number
  autoPublishCount: number
  localDirectories: Set<string>
}

export type BindingTreeFile = {
  type: "file"
  id: string
  name: string
  binding: WebResourceBinding
}

export type BindingTreeNode = BindingTreeFolder | BindingTreeFile

export type BindingTreeRow =
  | {
      type: "folder"
      folder: BindingTreeFolder
      depth: number
    }
  | {
      type: "file"
      file: BindingTreeFile
      depth: number
    }

export const folderMarkerFileName = ".folder.xml"
export const folderMarkerContent =
  "<!-- OpenDataverse folder marker. Add web resources to this path. -->"

type NamedTreeNode = {
  type: "folder" | "file"
  name: string
}

function splitResourceName(name: string): string[] {
  const parts = name.split("/").filter(Boolean)

  return parts.length > 0 ? parts : [name]
}

export function normalizeWebResourcePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
}

export function isFolderMarkerResourceName(name: string): boolean {
  return normalizeWebResourcePath(name).endsWith(`/${folderMarkerFileName}`)
}

export function isRootFolder(folder: ResourceTreeFolder): boolean {
  return !folder.path.includes("/")
}

function compareTreeNodes(left: NamedTreeNode, right: NamedTreeNode): number {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

function sortResourceTree(nodes: ResourceTreeNode[]): void {
  nodes.sort(compareTreeNodes)

  for (const node of nodes) {
    if (node.type === "folder") {
      sortResourceTree(node.children)
    }
  }
}

function sortBindingTree(nodes: BindingTreeNode[]): void {
  nodes.sort(compareTreeNodes)

  for (const node of nodes) {
    if (node.type === "folder") {
      sortBindingTree(node.children)
    }
  }
}

export function buildResourceTree(
  resources: readonly WebResource[],
  boundResourceIds: ReadonlySet<string>,
): ResourceTreeNode[] {
  const root: ResourceTreeFolder = {
    type: "folder",
    id: "folder:",
    name: "",
    path: "",
    children: [],
    resourceCount: 0,
    boundCount: 0,
  }
  const folderByPath = new Map<string, ResourceTreeFolder>()

  for (const resource of resources) {
    const parts = splitResourceName(resource.name)
    const fileName = parts.at(-1) ?? resource.name
    const isBound = boundResourceIds.has(resource.id)
    const isFolderMarker = isFolderMarkerResourceName(resource.name)
    let parent = root
    const pathParts: string[] = []

    if (!isFolderMarker) {
      root.resourceCount += 1
    }
    if (isBound && !isFolderMarker) {
      root.boundCount += 1
    }

    for (const part of parts.slice(0, -1)) {
      pathParts.push(part)
      const folderPath = pathParts.join("/")
      let folder = folderByPath.get(folderPath)

      if (!folder) {
        folder = {
          type: "folder",
          id: `folder:${folderPath}`,
          name: part,
          path: folderPath,
          children: [],
          resourceCount: 0,
          boundCount: 0,
        }
        folderByPath.set(folderPath, folder)
        parent.children.push(folder)
      }

      if (!isFolderMarker) {
        folder.resourceCount += 1
      }
      if (isBound && !isFolderMarker) {
        folder.boundCount += 1
      }
      parent = folder
    }

    if (isFolderMarker) {
      parent.markerResource = resource
      continue
    }

    parent.children.push({
      type: "file",
      id: `file:${resource.id}`,
      name: fileName,
      resource,
    })
  }

  sortResourceTree(root.children)

  return root.children
}

function localDirectoryPath(path: string): string {
  const lastSeparatorIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\"),
  )

  return lastSeparatorIndex >= 0 ? path.slice(0, lastSeparatorIndex) : path
}

export function buildBindingTree(
  bindings: readonly WebResourceBinding[],
): BindingTreeNode[] {
  const root: BindingTreeFolder = {
    type: "folder",
    id: "binding-folder:",
    name: "",
    path: "",
    children: [],
    bindingCount: 0,
    autoPublishCount: 0,
    localDirectories: new Set(),
  }
  const folderByPath = new Map<string, BindingTreeFolder>()

  for (const binding of bindings) {
    const parts = splitResourceName(binding.webResourceName)
    const fileName = parts.at(-1) ?? binding.webResourceName
    const localDirectory = localDirectoryPath(binding.localPath)
    let parent = root
    const pathParts: string[] = []

    root.bindingCount += 1
    root.localDirectories.add(localDirectory)
    if (binding.autoPublish) {
      root.autoPublishCount += 1
    }

    for (const part of parts.slice(0, -1)) {
      pathParts.push(part)
      const folderPath = pathParts.join("/")
      let folder = folderByPath.get(folderPath)

      if (!folder) {
        folder = {
          type: "folder",
          id: `binding-folder:${folderPath}`,
          name: part,
          path: folderPath,
          children: [],
          bindingCount: 0,
          autoPublishCount: 0,
          localDirectories: new Set(),
        }
        folderByPath.set(folderPath, folder)
        parent.children.push(folder)
      }

      folder.bindingCount += 1
      folder.localDirectories.add(localDirectory)
      if (binding.autoPublish) {
        folder.autoPublishCount += 1
      }
      parent = folder
    }

    parent.children.push({
      type: "file",
      id: `binding-file:${binding.id}`,
      name: fileName,
      binding,
    })
  }

  sortBindingTree(root.children)

  return root.children
}

export function collectFolderIds(nodes: readonly ResourceTreeNode[]): string[] {
  const ids: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }

  return ids
}

export function collectBindingFolderIds(
  nodes: readonly BindingTreeNode[],
): string[] {
  const ids: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      ids.push(node.id)
      ids.push(...collectBindingFolderIds(node.children))
    }
  }

  return ids
}

export function collectFolderPaths(
  nodes: readonly ResourceTreeNode[],
): string[] {
  const paths: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path)
      paths.push(...collectFolderPaths(node.children))
    }
  }

  return paths
}

export function collectFolderResources(
  folder: ResourceTreeFolder,
): WebResource[] {
  const resources: WebResource[] = []

  if (folder.markerResource) {
    resources.push(folder.markerResource)
  }

  for (const child of folder.children) {
    if (child.type === "file") {
      resources.push(child.resource)
    } else {
      resources.push(...collectFolderResources(child))
    }
  }

  return resources
}

export function collectFolderFileResources(
  folder: ResourceTreeFolder,
): WebResource[] {
  const resources: WebResource[] = []

  for (const child of folder.children) {
    if (child.type === "file") {
      resources.push(child.resource)
    } else {
      resources.push(...collectFolderFileResources(child))
    }
  }

  return resources
}

export function flattenResourceTree(
  nodes: readonly ResourceTreeNode[],
  expandedFolderIds: ReadonlySet<string>,
  forceExpanded: boolean,
  depth = 0,
): ResourceTreeRow[] {
  const rows: ResourceTreeRow[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      rows.push({ type: "folder", folder: node, depth })

      if (forceExpanded || expandedFolderIds.has(node.id)) {
        rows.push(
          ...flattenResourceTree(
            node.children,
            expandedFolderIds,
            forceExpanded,
            depth + 1,
          ),
        )
      }
    } else {
      rows.push({ type: "file", file: node, depth })
    }
  }

  return rows
}

export function flattenBindingTree(
  nodes: readonly BindingTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
  depth = 0,
): BindingTreeRow[] {
  const rows: BindingTreeRow[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      rows.push({ type: "folder", folder: node, depth })

      if (!collapsedFolderIds.has(node.id)) {
        rows.push(
          ...flattenBindingTree(node.children, collapsedFolderIds, depth + 1),
        )
      }
    } else {
      rows.push({ type: "file", file: node, depth })
    }
  }

  return rows
}
