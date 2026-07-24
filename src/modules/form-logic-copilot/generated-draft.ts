export type GeneratedDraft = {
  source: string
  logicalName?: string
  displayName?: string
  description?: string
  response?: string
}

function parseDraftJson(jsonText: string): GeneratedDraft | undefined {
  let parsed: Partial<GeneratedDraft>

  try {
    parsed = JSON.parse(jsonText) as Partial<GeneratedDraft>
  } catch {
    return undefined
  }

  if (typeof parsed.source !== "string") {
    return undefined
  }

  if (!parsed.source.trim()) {
    const explanation = [parsed.description, parsed.response].find(
      (value) => typeof value === "string" && value.trim(),
    )
    throw new Error(
      explanation?.trim() ?? "AI did not generate JavaScript source.",
    )
  }

  return {
    source: parsed.source,
    logicalName:
      typeof parsed.logicalName === "string" ? parsed.logicalName : undefined,
    displayName:
      typeof parsed.displayName === "string" ? parsed.displayName : undefined,
    description:
      typeof parsed.description === "string" ? parsed.description : undefined,
    response:
      typeof parsed.response === "string" ? parsed.response : undefined,
  }
}

function extractBalancedJsonObject(value: string) {
  const start = value.indexOf("{")
  if (start === -1) {
    return undefined
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < value.length; index += 1) {
    const char = value[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, index + 1)
      }
    }
  }

  return undefined
}

function extractFencedBlock(value: string) {
  const codeBlocks = Array.from(value.matchAll(/```(\w+)?\s*([\s\S]*?)```/g))

  const jsonBlock = codeBlocks.find(
    (match) => match[1]?.toLowerCase() === "json",
  )
  if (jsonBlock) {
    return { language: "json", content: jsonBlock[2]?.trim() ?? "" }
  }

  const scriptBlock =
    codeBlocks.find((match) =>
      ["js", "javascript", "typescript", "ts"].includes(
        match[1]?.toLowerCase() ?? "",
      ),
    ) ?? codeBlocks[0]

  if (!scriptBlock) {
    return undefined
  }

  return {
    language: scriptBlock[1]?.toLowerCase(),
    content: scriptBlock[2]?.trim() ?? "",
  }
}

function scriptStartIndex(value: string) {
  const candidates = [
    "var OpenDataverse",
    "window.OpenDataverse",
    "const OpenDataverse",
    "let OpenDataverse",
    "function ",
    "\"use strict\"",
    "'use strict'",
  ]
    .map((candidate) => value.indexOf(candidate))
    .filter((index) => index >= 0)

  return candidates.length ? Math.min(...candidates) : -1
}

function looksLikeJavaScriptSource(value: string) {
  return (
    value.includes("executionContext.getFormContext") ||
    value.includes("Xrm.") ||
    value.includes("OpenDataverse.") ||
    value.includes("function ")
  )
}

export function parseGeneratedDraft(content: string): GeneratedDraft {
  const trimmed = content.trim()
  const fencedBlock = extractFencedBlock(trimmed)

  if (fencedBlock?.language === "json") {
    const parsed = parseDraftJson(fencedBlock.content)
    if (parsed) {
      return parsed
    }
  }

  const directJson = parseDraftJson(trimmed)
  if (directJson) {
    return directJson
  }

  const embeddedJsonText = extractBalancedJsonObject(trimmed)
  if (embeddedJsonText) {
    const embeddedJson = parseDraftJson(embeddedJsonText)
    if (embeddedJson) {
      return embeddedJson
    }
  }

  if (fencedBlock?.content && looksLikeJavaScriptSource(fencedBlock.content)) {
    return { source: fencedBlock.content }
  }

  const sourceStart = scriptStartIndex(trimmed)
  if (sourceStart >= 0) {
    const source = trimmed.slice(sourceStart).trim()
    if (looksLikeJavaScriptSource(source)) {
      return { source }
    }
  }

  if (looksLikeJavaScriptSource(trimmed)) {
    return { source: trimmed }
  }

  throw new Error(
    "AI response did not include valid draft JSON or JavaScript source.",
  )
}
