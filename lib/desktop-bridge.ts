// Shared shape of window.eraserDesktop, the narrow IPC bridge exposed by
// desktop/preload.cjs. Declared once here so every component referencing it
// (app-shell.tsx, desktop-titlebar.tsx, ...) sees the same ambient type
// instead of each redeclaring a conflicting `declare global` block.

export type UpdateCheckResult = {
  /** `ready` : le nouveau serveur est téléchargé et s'applique sans réinstallation. */
  status: "ready" | "available" | "not-available" | "error" | "timeout" | "unavailable"
  version: string
  updateVersion?: string
  message?: string
}

/** Une mise à jour téléchargée qui attend « Oui » (rester) ou « Non » (l'appliquer). */
export type PendingUpdate = { kind: "hot" | "full"; version: string }

export type DesktopWindowState = {
  isMaximized: boolean
  isPinned: boolean
  isCollapsed: boolean
}

export type EraserDesktopBridge = {
  checkForUpdates: () => Promise<UpdateCheckResult>
  /** Absents des enveloppes d'avant alpha.56 : l'annonce restait une boîte de dialogue. */
  getPendingUpdate?: () => Promise<PendingUpdate | null>
  applyUpdate?: () => Promise<void>
  dismissUpdate?: () => Promise<void>
  onUpdateReady?: (callback: (update: PendingUpdate) => void) => () => void
  windowGetState: () => Promise<DesktopWindowState>
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowTogglePin: () => Promise<{ isPinned: boolean }>
  windowToggleCollapse: () => Promise<{ isCollapsed: boolean }>
  onWindowStateChange: (callback: (state: DesktopWindowState) => void) => () => void
}

declare global {
  interface Window {
    eraserDesktop?: EraserDesktopBridge
  }
}
