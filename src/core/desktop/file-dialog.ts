import { open, save } from "@tauri-apps/plugin-dialog"

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

export async function choosePluginAssemblyFile() {
  if (!isTauriRuntime()) {
    return "/workspace/bin/Contoso.Plugins.dll"
  }

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Plugin assemblies",
        extensions: ["dll"],
      },
    ],
  })

  return typeof selected === "string" ? selected : undefined
}

export async function choosePluginPackageFile() {
  if (!isTauriRuntime()) {
    return "/workspace/bin/Contoso.Plugins.1.0.0.nupkg"
  }

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Plugin packages",
        extensions: ["nupkg", "zip"],
      },
    ],
  })

  return typeof selected === "string" ? selected : undefined
}

export async function choosePluginRegistrationExportFile() {
  if (!isTauriRuntime()) {
    return "/workspace/plugin-registration-export.json"
  }

  const selected = await save({
    defaultPath: "plugin-registration-export.json",
    filters: [
      {
        name: "Registration export",
        extensions: ["json"],
      },
    ],
  })

  return typeof selected === "string" ? selected : undefined
}
