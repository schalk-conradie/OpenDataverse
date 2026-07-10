import { describe, expect, it } from "vitest"

import type {
  AppConfig,
  DataverseEnvironment,
  ToolWindow,
} from "@/core/dataverse/schemas"
import {
  applyEnvironmentAuthState,
  applyEnvironmentUpdate,
  closeToolWindow,
  removeWebResourceBinding,
  removeEnvironmentFromWorkspace,
  updateToolWindowState,
  updateWebResourceBinding,
  upsertWebResourceBinding,
  validateEnvironmentInput,
} from "@/store/workspace-state"

const environments: DataverseEnvironment[] = [
  {
    id: "dev",
    name: "Development",
    url: "https://dev.crm.dynamics.com",
    authState: "connected",
  },
  {
    id: "test",
    name: "Test",
    url: "https://test.crm.dynamics.com",
    authState: "disconnected",
  },
]

const windows: ToolWindow[] = [
  {
    id: "dev-window",
    toolId: "autopublisher",
    environmentId: "dev",
    title: "Webresource Management",
    createdAt: "2026-07-10T08:00:00.000Z",
  },
  {
    id: "test-window",
    toolId: "solution-explorer",
    environmentId: "test",
    title: "Solution Explorer",
    createdAt: "2026-07-10T08:01:00.000Z",
  },
]

function config(): AppConfig {
  return {
    currentEnvironmentId: "dev",
    publisherPrefix: "new",
    environments,
    bindings: [
      {
        id: "dev-binding",
        environmentId: "dev",
        localPath: "C:/src/account.js",
        webResourceName: "new_/account.js",
        webResourceId: "account-resource",
        lastKnownVersion: "1",
        autoPublish: true,
      },
      {
        id: "test-binding",
        environmentId: "test",
        localPath: "C:/src/contact.js",
        webResourceName: "new_/contact.js",
        webResourceId: "contact-resource",
        lastKnownVersion: "1",
        autoPublish: false,
      },
    ],
  }
}

describe("workspace environment transitions", () => {
  it("normalizes valid input and rejects duplicate names and URLs", () => {
    expect(
      validateEnvironmentInput(config(), {
        name: " Production ",
        url: "https://prod.crm.dynamics.com/",
      }),
    ).toEqual({
      ok: true,
      data: {
        name: "Production",
        url: "https://prod.crm.dynamics.com",
      },
    })

    expect(
      validateEnvironmentInput(config(), {
        name: "development",
        url: "https://another.crm.dynamics.com",
      }),
    ).toEqual({ ok: false, error: "Environment name already exists" })

    expect(
      validateEnvironmentInput(config(), {
        name: "Another",
        url: "https://TEST.crm.dynamics.com/",
      }),
    ).toEqual({ ok: false, error: "Environment URL already exists" })
  })

  it("updates authentication without mutating the input config", () => {
    const original = config()
    const updated = applyEnvironmentAuthState(original, "dev", "expired")

    expect(updated.environments[0]?.authState).toBe("expired")
    expect(original.environments[0]?.authState).toBe("connected")
  })

  it("clears environment-owned bindings and windows when the URL changes", () => {
    const development = environments.find(
      (environment) => environment.id === "dev",
    )
    if (!development) {
      throw new Error("Development fixture is missing")
    }

    const updated = applyEnvironmentUpdate(
      config(),
      windows,
      "dev-window",
      development,
      {
        name: "Development renamed",
        url: "https://dev2.crm.dynamics.com",
      },
    )

    expect(updated.urlChanged).toBe(true)
    expect(updated.config.environments[0]).toMatchObject({
      name: "Development renamed",
      url: "https://dev2.crm.dynamics.com",
      authState: "disconnected",
    })
    expect(updated.config.bindings.map((binding) => binding.id)).toEqual([
      "test-binding",
    ])
    expect(updated.openWindows.map((window) => window.id)).toEqual([
      "test-window",
    ])
    expect(updated.activeWindowId).toBe("test-window")
  })

  it("removes an environment and selects the adjacent environment", () => {
    const removed = removeEnvironmentFromWorkspace(
      config(),
      windows,
      "dev-window",
      "dev",
    )

    expect(removed.config.currentEnvironmentId).toBe("test")
    expect(removed.config.environments.map((environment) => environment.id)).toEqual([
      "test",
    ])
    expect(removed.config.bindings.map((binding) => binding.id)).toEqual([
      "test-binding",
    ])
    expect(removed.activeWindowId).toBe("test-window")
  })
})

describe("workspace window transitions", () => {
  it("activates the most recent remaining window when the active window closes", () => {
    expect(closeToolWindow(windows, "test-window", "test-window")).toEqual({
      openWindows: [windows[0]],
      activeWindowId: "dev-window",
    })
  })

  it("merges feature state into only the matching window", () => {
    const updated = updateToolWindowState(windows, "dev-window", {
      selectedResourceId: "resource-1",
    })

    expect(updated[0]?.state).toEqual({ selectedResourceId: "resource-1" })
    expect(updated[1]).toBe(windows[1])
  })
})

describe("workspace binding transitions", () => {
  it("updates an existing environment/resource pair instead of duplicating it", () => {
    const upsert = upsertWebResourceBinding(
      config(),
      {
        environmentId: "dev",
        localPath: "C:/src/account-updated.js",
        webResourceName: "new_/account.js",
        webResourceId: "account-resource",
        lastKnownVersion: "2",
        autoPublish: false,
      },
      "unused-new-id",
    )

    expect(upsert.existingBinding).toBe(true)
    expect(upsert.config.bindings).toHaveLength(2)
    expect(upsert.config.bindings[0]).toMatchObject({
      id: "dev-binding",
      localPath: "C:/src/account-updated.js",
      lastKnownVersion: "2",
      autoPublish: false,
    })
  })

  it("applies explicit binding patches and reports the removed binding", () => {
    const updated = updateWebResourceBinding(config(), "dev-binding", {
      autoPublish: false,
      lastKnownVersion: "3",
    })
    const removal = removeWebResourceBinding(updated, "dev-binding")

    expect(updated.bindings[0]).toMatchObject({
      autoPublish: false,
      lastKnownVersion: "3",
    })
    expect(removal.removedBinding?.id).toBe("dev-binding")
    expect(removal.config.bindings.map((binding) => binding.id)).toEqual([
      "test-binding",
    ])
  })
})
