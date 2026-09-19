// Shared shape of window.eraserDesktop, the narrow IPC bridge exposed by
// desktop/preload.cjs. Declared once here so every component referencing it
// (app-shell.tsx, desktop-titlebar.tsx, ...) sees the same ambient type
// instead of each redeclaring a conflicting `declare global` block.

export type UpdateCheckResult = {
  status: "available" | "not-available" | "error" | "timeout" | "unavailable"
  version: string
  updateVersion?: string
  message?: string
}

export type DesktopWindowState = {
  isMaximized: boolean
  isPinned: boolean
  isCollapsed: boolean
}

export type EraserDesktopBridge = {
  checkForUpdates: () => Promise<UpdateCheckResult>
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
