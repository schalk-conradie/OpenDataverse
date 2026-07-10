import { describe, expect, it } from "vitest"

import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import {
  executeFetchXml,
  getFetchXmlEntityMetadata,
  listFetchXmlEntities,
} from "@/modules/fetchxml-builder/gateway"

const environment: DataverseEnvironment = {
  id: "browser-preview",
  name: "Browser Preview",
  url: "https://preview.crm.dynamics.com",
  authState: "disconnected",
}

describe("FetchXML browser-preview gateway", () => {
  it("keeps entity summaries and metadata aligned", async () => {
    const entities = await listFetchXmlEntities(environment)
    const contact = await getFetchXmlEntityMetadata(environment, "contact")

    expect(entities.map((entity) => entity.logicalName)).toContain("contact")
    expect(contact).toMatchObject({
      logicalName: "contact",
      entitySetName: "contacts",
      primaryIdAttribute: "contactid",
    })
  })

  it("builds the Web API URL from the manually authored base entity", async () => {
    const fetchXml =
      '<fetch><entity name="contact"><attribute name="fullname" /></entity></fetch>'
    const result = await executeFetchXml(environment, fetchXml)

    expect(result.webApiUrl).toBe(
      `${environment.url}/api/data/v9.2/contacts?fetchXml=${encodeURIComponent(fetchXml)}`,
    )
  })
})
