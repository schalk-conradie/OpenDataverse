import { describe, expect, it } from "vitest"

import type { FetchXmlAttributeSummary } from "@/core/dataverse/schemas"
import { operatorByValue } from "@/modules/fetchxml-builder/designer-domain"
import { valueControlForAttribute } from "@/modules/fetchxml-builder/value-input"

function attribute(
  attributeType: string,
  extra: Partial<FetchXmlAttributeSummary> = {},
): FetchXmlAttributeSummary {
  return {
    logicalName: "sample",
    displayName: "Sample",
    attributeType,
    isValidForRead: true,
    ...extra,
  }
}

describe("FetchXML filter value controls", () => {
  it("uses date and date-time pickers from Dataverse date metadata", () => {
    const dateOnly = attribute("DateTime", { dateTimeFormat: "DateOnly" })
    const dateTime = attribute("DateTime", {
      dateTimeBehavior: "UserLocal",
      dateTimeFormat: "DateAndTime",
    })

    expect(
      valueControlForAttribute(dateOnly, operatorByValue("on", dateOnly)),
    ).toMatchObject({ kind: "input", type: "date" })
    expect(
      valueControlForAttribute(dateTime, operatorByValue("on", dateTime)),
    ).toMatchObject({ kind: "input", type: "datetime-local" })
  })

  it("uses numeric controls with appropriate increments", () => {
    const wholeNumber = attribute("Integer")
    const decimal = attribute("Money")
    const date = attribute("DateTime")

    expect(
      valueControlForAttribute(
        wholeNumber,
        operatorByValue("gt", wholeNumber),
      ),
    ).toMatchObject({ kind: "input", type: "number", step: "1" })
    expect(
      valueControlForAttribute(decimal, operatorByValue("gt", decimal)),
    ).toMatchObject({ kind: "input", type: "number", step: "any" })
    expect(
      valueControlForAttribute(date, operatorByValue("last-x-days", date)),
    ).toMatchObject({
      kind: "input",
      type: "number",
      step: "1",
      min: 1,
    })
  })

  it("uses option selectors for choices and booleans", () => {
    const choice = attribute("Picklist", {
      optionValues: [
        { value: 1, label: "Preferred" },
        { value: 2, label: "Standard" },
      ],
    })
    const boolean = attribute("Boolean")

    expect(
      valueControlForAttribute(choice, operatorByValue("eq", choice)),
    ).toMatchObject({ kind: "select", options: choice.optionValues })
    expect(
      valueControlForAttribute(boolean, operatorByValue("eq", boolean)),
    ).toMatchObject({
      kind: "select",
      options: [
        { value: 0, label: "No" },
        { value: 1, label: "Yes" },
      ],
    })
  })
})
