import { describe, expect, it } from "vitest"

import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import {
  createWebResourceInSolution,
  importWebResourcesInSolution,
  listSolutions,
} from "@/modules/solution-explorer/gateway"
import {
  deleteWebResources,
  listWebResources,
} from "@/modules/webresource-management/gateway"

const environment: DataverseEnvironment = {
  id: "browser-preview",
  name: "Browser Preview",
  url: "https://preview.crm.dynamics.com",
  authState: "disconnected",
}

describe("solution browser-preview gateway", () => {
  it("applies managed filters and keeps newest solutions first", async () => {
    const [all, managed, unmanaged] = await Promise.all([
      listSolutions(environment, "all"),
      listSolutions(environment, "managed"),
      listSolutions(environment, "unmanaged"),
    ])

    expect(all.map((solution) => solution.id)).toEqual([
      "solution-core",
      "solution-sales",
    ])
    expect(managed.every((solution) => solution.isManaged)).toBe(true)
    expect(unmanaged.every((solution) => !solution.isManaged)).toBe(true)
  })

  it("shares created web resources with the webresource preview", async () => {
    const created = await createWebResourceInSolution(environment, {
      solutionUniqueName: "CoreCustomizations",
      name: "new_/tests/gateway-preview.js",
      displayName: "Gateway preview",
      description: "Architecture test fixture",
      type: "js",
      content: "export const preview = true",
    })

    try {
      const resources = await listWebResources(environment, false)
      expect(resources).toContainEqual(
        expect.objectContaining({
          id: created.webResourceId,
          name: "new_/tests/gateway-preview.js",
          solution: "CoreCustomizations",
        }),
      )
    } finally {
      if (created.webResourceId) {
        await deleteWebResources(environment, [created.webResourceId])
      }
    }
  })

  it("normalizes imported source paths under the requested root", async () => {
    const result = await importWebResourcesInSolution(environment, {
      solutionUniqueName: "CoreCustomizations",
      sourcePaths: ["C:\\src\\account.js", "/src/forms/account.css"],
      targetRoot: "/new_/scripts/",
      description: "",
    })

    expect(result.imported.map((item) => [item.name, item.type])).toEqual([
      ["new_/scripts/account.js", "js"],
      ["new_/scripts/account.css", "css"],
    ])
  })
})
