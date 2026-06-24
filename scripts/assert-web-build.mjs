import { readdir, stat } from "node:fs/promises"
import path from "node:path"

const distAssetsDir = path.resolve("dist/assets")
const maxInitialChunkBytes = 450_000
const requiredToolChunks = [
  "AiChatModule-",
  "FetchXmlBuilderModule-",
  "PluginRegistrationModule-",
  "SolutionExplorerModule-",
  "WebResourceManagementModule-",
]

const files = await readdir(distAssetsDir)
const javascriptFiles = files.filter((file) => file.endsWith(".js"))
const initialChunks = javascriptFiles.filter((file) => /^index-[\w-]+\.js$/.test(file))

if (initialChunks.length !== 1) {
  throw new Error(`Expected one initial index chunk, found ${initialChunks.length}.`)
}

const initialChunk = initialChunks[0]
const initialChunkSize = (await stat(path.join(distAssetsDir, initialChunk))).size

if (initialChunkSize > maxInitialChunkBytes) {
  throw new Error(
    `Initial chunk ${initialChunk} is ${initialChunkSize} bytes; expected <= ${maxInitialChunkBytes}.`,
  )
}

for (const prefix of requiredToolChunks) {
  if (!javascriptFiles.some((file) => file.startsWith(prefix))) {
    throw new Error(`Missing lazy-loaded tool chunk with prefix ${prefix}.`)
  }
}

console.log(
  `Web build chunks verified: ${initialChunk} (${initialChunkSize} bytes), ${requiredToolChunks.length} tool chunks.`,
)
