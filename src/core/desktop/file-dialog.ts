import { open, save } from "@tauri-apps/plugin-dialog"

import { isTauriRuntime } from "@/core/desktop/runtime"

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

export async function chooseWebResourceImportFiles() {
  if (!isTauriRuntime()) {
    return [
      "/workspace/webresources/CustomWebresource/index.html",
      "/workspace/webresources/CustomWebresource/index.css",
      "/workspace/webresources/CustomWebresource/index.js",
    ]
  }

  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Web resource files",
        extensions: [
          "js",
          "ts",
          "css",
          "html",
          "htm",
          "xml",
          "json",
          "svg",
          "png",
          "jpg",
          "jpeg",
          "gif",
          "ico",
          "resx",
          "xsl",
          "xslt",
        ],
      },
    ],
  })

  if (Array.isArray(selected)) {
    return selected
  }

  return typeof selected === "string" ? [selected] : []
}

export async function chooseWebResourceImportFolder() {
  if (!isTauriRuntime()) {
    return "/workspace/webresources/CustomWebresource"
  }

  const selected = await open({
    multiple: false,
    directory: true,
  })

  return typeof selected === "string" ? selected : undefined
}

export async function chooseWebResourceDownloadFolder() {
  if (!isTauriRuntime()) {
    return "/workspace/downloads"
  }

  const selected = await open({
    multiple: false,
    directory: true,
  })

  return typeof selected === "string" ? selected : undefined
}

export async function chooseWebResourceDownloadFile(webResourceName: string) {
  const fileName =
    webResourceName.split(/[\\/]/).filter(Boolean).at(-1) ?? "webresource"

  if (!isTauriRuntime()) {
    return `/workspace/downloads/${fileName}`
  }

  const selected = await save({
    defaultPath: fileName,
  })

  return typeof selected === "string" ? selected : undefined
}

export async function chooseAiChatImageFiles() {
  if (!isTauriRuntime()) {
    return ["/workspace/screenshots/account-form.png"]
  }

  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp"],
      },
    ],
  })

  if (Array.isArray(selected)) {
    return selected
  }

  return typeof selected === "string" ? [selected] : []
}

export async function chooseAiChatContextFiles() {
  if (!isTauriRuntime()) {
    return ["/workspace/notes/table-plan.md", "/workspace/src/form-script.ts"]
  }

  const selected = await open({
    multiple: true,
    directory: false,
  })

  if (Array.isArray(selected)) {
    return selected
  }

  return typeof selected === "string" ? [selected] : []
}

export async function chooseAiChatContextFolders() {
  if (!isTauriRuntime()) {
    return ["/workspace/docs/context"]
  }

  const selected = await open({
    multiple: true,
    directory: true,
  })

  if (Array.isArray(selected)) {
    return selected
  }

  return typeof selected === "string" ? [selected] : []
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
