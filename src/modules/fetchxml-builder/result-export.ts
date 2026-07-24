import type { FetchXmlQueryResult } from "@/core/dataverse/schemas"

function escapeCsvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value)

  return `"${text.replaceAll('"', '""')}"`
}

export function buildFetchXmlCsv(
  result: FetchXmlQueryResult,
  columnLabel: (column: string) => string,
) {
  const header = result.columns.map((column) => escapeCsvCell(columnLabel(column)))
  const rows = result.rows.map((row) =>
    result.columns.map((column) => escapeCsvCell(row[column])),
  )

  return [header, ...rows].map((row) => row.join(",")).join("\r\n")
}
