import { describe, expect, it } from "vitest"

import type {
  WebResource,
  WebResourceBinding,
} from "@/core/dataverse/schemas"
import {
  buildBindingTree,
  buildResourceTree,
  collectBindingFolderIds,
  collectFolderFileResources,
  collectFolderIds,
  collectFolderPaths,
  collectFolderResources,
  flattenBindingTree,
  flattenResourceTree,
  isFolderMarkerResourceName,
  isRootFolder,
  normalizeWebResourcePath,
  type BindingTreeFolder,
  type BindingTreeNode,
  type ResourceTreeFolder,
  type ResourceTreeNode,
} from "./tree-model"

function webResource(id: string, name: string): WebResource {
  return {
    id,
    name,
    type: name.endsWith(".folder.xml") ? "xml" : "js",
    version: "1",
    isManaged: false,
    solution: "OpenDataverse",
  }
}

function binding(
  id: string,
  webResourceName: string,
  localPath: string,
  autoPublish: boolean,
): WebResourceBinding {
  return {
    id,
    environmentId: "environment-1",
    localPath,
    webResourceName,
    webResourceId: `resource-${id}`,
    lastKnownVersion: "1",
    autoPublish,
  }
}

function findResourceFolder(
  nodes: readonly ResourceTreeNode[],
  path: string,
): ResourceTreeFolder {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue
    }
    if (node.path === path) {
      return node
    }

    const nested = findOptionalResourceFolder(node.children, path)
    if (nested) {
      return nested
    }
  }

  throw new Error(`Resource folder ${path} was not found.`)
}

function findOptionalResourceFolder(
  nodes: readonly ResourceTreeNode[],
  path: string,
): ResourceTreeFolder | undefined {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue
    }
    if (node.path === path) {
      return node
    }

    const nested = findOptionalResourceFolder(node.children, path)
    if (nested) {
      return nested
    }
  }

  return undefined
}

function findBindingFolder(
  nodes: readonly BindingTreeNode[],
  path: string,
): BindingTreeFolder {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue
    }
    if (node.path === path) {
      return node
    }

    const nested = findOptionalBindingFolder(node.children, path)
    if (nested) {
      return nested
    }
  }

  throw new Error(`Binding folder ${path} was not found.`)
}

function findOptionalBindingFolder(
  nodes: readonly BindingTreeNode[],
  path: string,
): BindingTreeFolder | undefined {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue
    }
    if (node.path === path) {
      return node
    }

    const nested = findOptionalBindingFolder(node.children, path)
    if (nested) {
      return nested
    }
  }

  return undefined
}

describe("web resource paths", () => {
  it("normalizes separators, whitespace, and empty path segments", () => {
    expect(normalizeWebResourcePath("  new_\\scripts // app.js  ")).toBe(
      "new_/scripts/app.js",
    )
    expect(normalizeWebResourcePath(" /// ")).toBe("")
  })

  it("recognizes nested folder markers after path normalization", () => {
    expect(
      isFolderMarkerResourceName(" new_\\empty\\.folder.xml "),
    ).toBe(true)
    expect(isFolderMarkerResourceName("new_/empty/app.js")).toBe(false)
  })
})

describe("resource tree model", () => {
  const resources = [
    webResource("file-10", "new_/scripts/file10.js"),
    webResource("root-file", "root.js"),
    webResource("empty-marker", "new_/empty/.folder.xml"),
    webResource("file-2", "new_/scripts/file2.js"),
  ]

  it("hides folder markers, sorts folders before files, and aggregates counts", () => {
    const tree = buildResourceTree(
      resources,
      new Set(["file-2", "empty-marker"]),
    )
    const rootFolder = findResourceFolder(tree, "new_")
    const emptyFolder = findResourceFolder(tree, "new_/empty")
    const scriptsFolder = findResourceFolder(tree, "new_/scripts")

    expect(tree.map((node) => node.name)).toEqual(["new_", "root.js"])
    expect(rootFolder.children.map((node) => node.name)).toEqual([
      "empty",
      "scripts",
    ])
    expect(scriptsFolder.children.map((node) => node.name)).toEqual([
      "file2.js",
      "file10.js",
    ])
    expect(rootFolder).toMatchObject({ resourceCount: 2, boundCount: 1 })
    expect(emptyFolder).toMatchObject({ resourceCount: 0, boundCount: 0 })
    expect(emptyFolder.markerResource?.id).toBe("empty-marker")
    expect(scriptsFolder).toMatchObject({ resourceCount: 2, boundCount: 1 })
    expect(collectFolderIds(tree)).toEqual([
      "folder:new_",
      "folder:new_/empty",
      "folder:new_/scripts",
    ])
    expect(collectFolderPaths(tree)).toEqual([
      "new_",
      "new_/empty",
      "new_/scripts",
    ])
  })

  it("flattens only expanded branches unless search forces expansion", () => {
    const tree = buildResourceTree(resources, new Set())
    const collapsedRows = flattenResourceTree(tree, new Set(), false)
    const partiallyExpandedRows = flattenResourceTree(
      tree,
      new Set(["folder:new_"]),
      false,
    )
    const searchRows = flattenResourceTree(tree, new Set(), true)

    expect(
      collapsedRows.map((row) =>
        row.type === "folder"
          ? `folder:${row.folder.path}:${row.depth}`
          : `file:${row.file.name}:${row.depth}`,
      ),
    ).toEqual(["folder:new_:0", "file:root.js:0"])
    expect(
      partiallyExpandedRows.map((row) =>
        row.type === "folder"
          ? `folder:${row.folder.path}:${row.depth}`
          : `file:${row.file.name}:${row.depth}`,
      ),
    ).toEqual([
      "folder:new_:0",
      "folder:new_/empty:1",
      "folder:new_/scripts:1",
      "file:root.js:0",
    ])
    expect(
      searchRows.map((row) =>
        row.type === "folder"
          ? `folder:${row.folder.path}:${row.depth}`
          : `file:${row.file.name}:${row.depth}`,
      ),
    ).toEqual([
      "folder:new_:0",
      "folder:new_/empty:1",
      "folder:new_/scripts:1",
      "file:file2.js:2",
      "file:file10.js:2",
      "file:root.js:0",
    ])
  })

  it("includes markers for folder deletion but excludes them from file selection", () => {
    const tree = buildResourceTree(resources, new Set())
    const rootFolder = findResourceFolder(tree, "new_")
    const scriptsFolder = findResourceFolder(tree, "new_/scripts")

    expect(
      collectFolderResources(rootFolder).map((resource) => resource.id),
    ).toEqual(["empty-marker", "file-2", "file-10"])
    expect(
      collectFolderFileResources(rootFolder).map((resource) => resource.id),
    ).toEqual(["file-2", "file-10"])
    expect(isRootFolder(rootFolder)).toBe(true)
    expect(isRootFolder(scriptsFolder)).toBe(false)
  })
})

describe("binding tree model", () => {
  it("aggregates binding state and treats collapsed folders as hidden branches", () => {
    const tree = buildBindingTree([
      binding(
        "10",
        "new_/scripts/file10.js",
        "C:\\repo\\scripts\\file10.js",
        false,
      ),
      binding(
        "2",
        "new_/scripts/file2.js",
        "C:\\repo\\scripts\\file2.js",
        true,
      ),
      binding("root", "root.js", "C:\\repo\\root.js", false),
    ])
    const rootFolder = findBindingFolder(tree, "new_")
    const scriptsFolder = findBindingFolder(tree, "new_/scripts")
    const expandedRows = flattenBindingTree(tree, new Set())
    const collapsedRows = flattenBindingTree(tree, new Set(["binding-folder:new_"]))

    expect(tree.map((node) => node.name)).toEqual(["new_", "root.js"])
    expect(scriptsFolder.children.map((node) => node.name)).toEqual([
      "file2.js",
      "file10.js",
    ])
    expect(rootFolder).toMatchObject({ bindingCount: 2, autoPublishCount: 1 })
    expect([...rootFolder.localDirectories]).toEqual(["C:\\repo\\scripts"])
    expect(collectBindingFolderIds(tree)).toEqual([
      "binding-folder:new_",
      "binding-folder:new_/scripts",
    ])
    expect(expandedRows).toHaveLength(5)
    expect(
      collapsedRows.map((row) =>
        row.type === "folder" ? row.folder.path : row.file.name,
      ),
    ).toEqual(["new_", "root.js"])
  })
})
