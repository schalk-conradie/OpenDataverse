import { describe, expect, it } from "vitest"

import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import {
  getFormLogicFormContext,
  listFormLogicEntities,
  listFormLogicForms,
} from "@/modules/form-logic-copilot/gateway"

const environment: DataverseEnvironment = {
  id: "browser-preview",
  name: "Browser Preview",
  url: "https://preview.crm.dynamics.com",
  authState: "disconnected",
}

describe("form-logic browser-preview gateway", () => {
  it("keeps entity, form, and context records aligned", async () => {
    const entities = await listFormLogicEntities(environment)
    const account = entities.find((entity) => entity.logicalName === "account")
    if (!account) {
      throw new Error("Account preview entity is missing")
    }

    const forms = await listFormLogicForms(environment, account.logicalName)
    const mainForm = forms.find((form) => form.isDefault)
    if (!mainForm) {
      throw new Error("Account preview form is missing")
    }

    const context = await getFormLogicFormContext(
      environment,
      account.logicalName,
      mainForm.id,
    )

    expect(context.entity.logicalName).toBe(account.logicalName)
    expect(context.form.id).toBe(mainForm.id)
    expect(context.formXml).toContain("<form>")
  })

  it("falls back to a complete preview context for an unknown form", async () => {
    const context = await getFormLogicFormContext(
      environment,
      "unknown",
      "missing-form",
    )

    expect(context.entity.logicalName).toBe("account")
    expect(context.form.id).toBe("00000000-0000-0000-0000-000000000201")
  })
})
