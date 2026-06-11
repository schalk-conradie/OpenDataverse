import { open } from "@tauri-apps/plugin-dialog"

import { isTauriRuntime } from "@/core/desktop/bridge"

export async function chooseLocalFile() {
  if (!isTauriRuntime()) {
    return "/workspace/src/account-form.ts"
  }

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Web resource files",
        extensions: ["js", "ts", "css", "html", "htm", "xml", "svg", "resx"],
      },
    ],
  })

  return typeof selected === "string" ? selected : undefined
}
