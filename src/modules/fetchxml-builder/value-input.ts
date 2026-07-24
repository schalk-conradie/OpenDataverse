import type { FetchXmlAttributeSummary } from "@/core/dataverse/schemas"
import type { FilterOperator } from "@/modules/fetchxml-builder/designer-domain"

export type FilterValueControl =
  | {
      kind: "select"
      options: NonNullable<FetchXmlAttributeSummary["optionValues"]>
    }
  | {
      kind: "input"
      type: "text" | "number" | "date" | "datetime-local"
      placeholder: string
      step?: string
      min?: number
    }

const numericTypes = ["integer", "bigint", "decimal", "double", "money"]
const optionTypes = ["picklist", "state", "status", "boolean"]

function normalizedAttributeType(attribute?: FetchXmlAttributeSummary) {
  return attribute?.attributeType.toLowerCase() ?? ""
}

function includesType(type: string, candidates: readonly string[]) {
  return candidates.some((candidate) => type.includes(candidate))
}

export function valueControlForAttribute(
  attribute: FetchXmlAttributeSummary | undefined,
  operator: FilterOperator,
): FilterValueControl {
  const type = normalizedAttributeType(attribute)

  if (operator.value === "last-x-days" || operator.value === "next-x-days") {
    return {
      kind: "input",
      type: "number",
      placeholder: "Days",
      step: "1",
      min: 1,
    }
  }

  if (includesType(type, optionTypes)) {
    const options =
      attribute?.optionValues?.length
        ? attribute.optionValues
        : type.includes("boolean")
          ? [
              { value: 0, label: "No" },
              { value: 1, label: "Yes" },
            ]
          : []

    if (options.length > 0) {
      return { kind: "select", options }
    }
  }

  if (type.includes("datetime")) {
    const dateOnly =
      attribute?.dateTimeFormat?.toLowerCase().includes("dateonly") ||
      attribute?.dateTimeBehavior?.toLowerCase().includes("dateonly")

    return {
      kind: "input",
      type: dateOnly ? "date" : "datetime-local",
      placeholder: dateOnly ? "Date" : "Date and time",
    }
  }

  if (includesType(type, numericTypes)) {
    const wholeNumber = type.includes("integer") || type.includes("bigint")

    return {
      kind: "input",
      type: "number",
      placeholder: "Value",
      step: wholeNumber ? "1" : "any",
    }
  }

  const identifier = ["lookup", "customer", "owner", "uniqueidentifier"].some(
    (candidate) => type.includes(candidate),
  )

  return {
    kind: "input",
    type: "text",
    placeholder: identifier ? "Record ID" : "Value",
  }
}
