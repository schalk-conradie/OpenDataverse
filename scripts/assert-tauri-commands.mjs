import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const rendererRoot = path.join(root, "src")
const backendCompositionPath = path.join(
  root,
  "src-tauri",
  "src",
  "backend",
  "mod.rs",
)

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return sourceFiles(entryPath)
      }

      return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : []
    }),
  )

  return files.flat()
}

function valuesForPattern(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

const invokePattern = /\binvoke(?:<[^>]*>)?\s*\(\s*["'`]([a-z0-9_]+)["'`]/g
const handlerPattern = /\b[a-z_]+::([a-z0-9_]+),?/g
const rendererFiles = await sourceFiles(rendererRoot)
const invokedCommands = new Set()

for (const file of rendererFiles) {
  const source = await readFile(file, "utf8")
  for (const command of valuesForPattern(source, invokePattern)) {
    invokedCommands.add(command)
  }
}

const backendComposition = await readFile(backendCompositionPath, "utf8")
const handlerPrefix = "tauri::generate_handler!["
const handlerStart = backendComposition.indexOf(handlerPrefix)
const handlerEnd = backendComposition.indexOf("])", handlerStart)
if (handlerStart < 0 || handlerEnd < 0) {
  throw new Error("Could not locate the Tauri command registration block")
}

const registeredCommands = valuesForPattern(
  backendComposition.slice(handlerStart + handlerPrefix.length, handlerEnd),
  handlerPattern,
)
const duplicateRegistrations = registeredCommands.filter(
  (command, index) => registeredCommands.indexOf(command) !== index,
)
if (duplicateRegistrations.length > 0) {
  throw new Error(
    `Tauri commands are registered more than once: ${[
      ...new Set(duplicateRegistrations),
    ].join(", ")}`,
  )
}

const registeredCommandSet = new Set(registeredCommands)
const missingHandlers = [...invokedCommands]
  .filter((command) => !registeredCommandSet.has(command))
  .sort()
if (missingHandlers.length > 0) {
  throw new Error(
    `Renderer commands are missing Tauri handlers: ${missingHandlers.join(", ")}`,
  )
}

console.log(
  `Verified ${invokedCommands.size} renderer commands against ${registeredCommands.length} registered Tauri handlers.`,
)
