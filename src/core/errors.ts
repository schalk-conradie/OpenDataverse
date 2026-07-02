function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nonEmpty(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()

  return trimmed || fallback
}

export function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return nonEmpty(error.message, fallback)
  }

  if (typeof error === "string") {
    return nonEmpty(error, fallback)
  }

  if (error === null || error === undefined) {
    return fallback
  }

  if (isRecord(error)) {
    const message = error.message ?? error.error
    if (typeof message === "string") {
      return nonEmpty(message, fallback)
    }
  }

  return nonEmpty(safeJson(error) ?? String(error), fallback)
}

export function formatErrorDetails(error: unknown, fallback: string) {
  const message = formatErrorMessage(error, fallback)

  if (error instanceof Error) {
    const details = [message]

    if (error.name && error.name !== "Error") {
      details.unshift(error.name)
    }

    if (error.cause) {
      details.push("", "Cause:", formatErrorMessage(error.cause, "Unknown cause"))
    }

    if (error.stack) {
      details.push("", "Stack:", error.stack)
    }

    return details.join("\n")
  }

  if (isRecord(error)) {
    const raw = safeJson(error)

    if (raw && raw !== message) {
      return `${message}\n\nRaw error:\n${raw}`
    }
  }

  return message
}
