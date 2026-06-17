import { appVersion } from "@/core/build-info"
import { isTauriRuntime } from "@/core/desktop/bridge"

export async function getRunningAppVersion() {
  if (!isTauriRuntime()) {
    return appVersion
  }

  try {
    const { getVersion } = await import("@tauri-apps/api/app")
    return await getVersion()
  } catch {
    return appVersion
  }
}
