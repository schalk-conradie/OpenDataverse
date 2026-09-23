import { describe, expect, it } from "vitest"

import type { PluginMessageSummary } from "@/core/dataverse/schemas"
import {
  filterPluginMessages,
  findPluginMessageByName,
} from "./message-autocomplete"

const messages: PluginMessageSummary[] = [
  { id: "retrieve", name: "Retrieve" },
  { id: "retrieve-multiple", name: "RetrieveMultiple" },
]

describe("plug-in message autocomplete", () => {
  it("resolves complete message names without confusing similar choices", () => {
    expect(findPluginMessageByName(messages, " retrieve ")?.id).toBe("retrieve")
    expect(findPluginMessageByName(messages, "RETRIEVEMULTIPLE")?.id).toBe(
      "retrieve-multiple",
    )
    expect(findPluginMessageByName(messages, "RetrieveM")).toBeUndefined()
  })

  it("shows every message for an empty query and filters partial names", () => {
    expect(filterPluginMessages(messages, "")).toEqual(messages)
    expect(filterPluginMessages(messages, "multiple")).toEqual([messages[1]])
  })

  it("sorts all messages alphabetically and puts an exact search match first", () => {
    const unsorted: PluginMessageSummary[] = [
      { id: "multiple", name: "UpdateMultiple" },
      { id: "create", name: "Create" },
      { id: "internal", name: "_UpdateBatch" },
      { id: "account", name: "AccountUpdate" },
      { id: "update", name: "Update" },
    ]

    expect(filterPluginMessages(unsorted, "").map((message) => message.name)).toEqual([
      "AccountUpdate",
      "Create",
      "Update",
      "_UpdateBatch",
      "UpdateMultiple",
    ])
    expect(filterPluginMessages(unsorted, "update").map((message) => message.name)).toEqual([
      "Update",
      "UpdateMultiple",
      "AccountUpdate",
      "_UpdateBatch",
    ])
  })
})
