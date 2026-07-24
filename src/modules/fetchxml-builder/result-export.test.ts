import { describe, expect, it } from "vitest"

import { buildFetchXmlCsv } from "@/modules/fetchxml-builder/result-export"

describe("FetchXML CSV export", () => {
  it("uses displayed column labels and escapes CSV values", () => {
    const csv = buildFetchXmlCsv(
      {
        columns: ["name", "details", "empty"],
        rows: [
          {
            name: 'A. Datum, "North"',
            details: { active: true },
            empty: null,
          },
        ],
        entitySetName: "accounts",
        webApiUrl: "https://example.test/accounts",
      },
      (column) => (column === "name" ? "Account Name" : column),
    )

    expect(csv).toBe(
      '"Account Name","details","empty"\r\n"A. Datum, ""North""","{""active"":true}",""',
    )
  })
})
