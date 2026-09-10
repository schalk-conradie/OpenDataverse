import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { isTauriRuntime } from "@/core/desktop/runtime"
import type { DataverseEnvironment, WebResourceBinding } from "@/core/dataverse/schemas"
import { checkWebResourceBinding } from "./gateway"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@/core/desktop/runtime", () => ({ isTauriRuntime: vi.fn() }))

const environment: DataverseEnvironment = {
  id: "preview", name: "Preview", url: "https://org.crm.dynamics.com", authState: "connected",
}
const binding: WebResourceBinding = {
  id: "binding", environmentId: environment.id,
  webResourceId: "3f3c9f6a-1111-4d58-b77d-100000000001",
  webResourceName: "new_/scripts/account-form.js",
  localPath: "/workspace/dist/account-form.js", lastKnownVersion: "old", autoPublish: false,
}

beforeEach(() => vi.resetAllMocks())

describe("published binding comparison", () => {
  it("passes the selected environment and binding through the read-only command contract", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    const status = {
      state: "outOfDate", publishedVersion: "69863297",
      publishedModifiedOn: "2026-09-01T09:00:00Z", localModifiedOn: 1789032000000,
    }
    vi.mocked(invoke).mockResolvedValue(status)
    expect(await checkWebResourceBinding(environment, binding)).toEqual(status)
    expect(invoke).toHaveBeenCalledExactlyOnceWith("check_web_resource_binding", { environment, binding })
  })

  it("preserves a failed read instead of reporting a match", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.mocked(invoke).mockRejectedValue("Access denied")
    await expect(checkWebResourceBinding(environment, binding)).rejects.toBe("Access denied")
  })

  it("rejects an invalid native response", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue({ state: "saved" })
    await expect(checkWebResourceBinding(environment, binding)).rejects.toThrow()
  })

  it("previews matching, different, missing and unavailable published content with auto-publish off", async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false)
    expect((await checkWebResourceBinding(environment, binding)).state).toBe("outOfDate")
    expect((await checkWebResourceBinding(environment, {
      ...binding, webResourceId: binding.webResourceId.replace(/001$/, "002"),
    })).state).toBe("upToDate")
    const missing = await checkWebResourceBinding(environment, {
      ...binding, webResourceId: binding.webResourceId.replace(/001$/, "003"),
    })
    expect(missing.state).toBe("missingLocal")
    expect(missing.localModifiedOn).toBeUndefined()
    await expect(checkWebResourceBinding(environment, {
      ...binding, webResourceId: binding.webResourceId.replace(/001$/, "004"),
    })).rejects.toThrow("Dataverse could not be reached")
    expect(invoke).not.toHaveBeenCalled()
  })
})
