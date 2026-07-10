import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()

async function filesBelow(directory, extensionPattern) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return filesBelow(entryPath, extensionPattern)
      }

      return extensionPattern.test(entry.name) ? [entryPath] : []
    }),
  )

  return files.flat()
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/")
}

const violations = []
const coreFiles = await filesBelow(path.join(root, "src", "core"), /\.(?:ts|tsx)$/)
for (const file of coreFiles) {
  const source = await readFile(file, "utf8")
  if (/["']@\/modules\//.test(source)) {
    violations.push(`${relative(file)} imports a feature module`)
  }
}

const backendFiles = await filesBelow(
  path.join(root, "src-tauri", "src", "backend"),
  /\.rs$/,
)
for (const file of backendFiles) {
  const source = await readFile(file, "utf8")
  const testModuleIndex = source.search(/#\[cfg\(test\)\]\s*mod tests/)
  const productionSource =
    testModuleIndex >= 0 ? source.slice(0, testModuleIndex) : source
  if (/use\s+super::\*\s*;/.test(productionSource)) {
    violations.push(`${relative(file)} has a production wildcard parent import`)
  }
}

if (violations.length > 0) {
  throw new Error(`Architecture boundary violations:\n- ${violations.join("\n- ")}`)
}

console.log(
  `Verified ${coreFiles.length} core files and ${backendFiles.length} Rust backend files against dependency-boundary rules.`,
)
