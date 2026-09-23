/* eslint-disable @typescript-eslint/no-require-imports */
// The application UI talks only to Eraser's local HTTP server. The
// exceptions are this narrow set of triggers: checking for an update right
// away, answering the update announcement, and controlling the frameless window's chrome (the
// custom titlebar draws its own minimize/maximize/close/pin buttons, since
// there's no native titlebar to click).
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("eraserDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("eraser:check-for-updates"),
  getPendingUpdate: () => ipcRenderer.invoke("eraser:update-pending"),
  applyUpdate: () => ipcRenderer.invoke("eraser:update-apply"),
  dismissUpdate: () => ipcRenderer.invoke("eraser:update-dismiss"),
  onUpdateReady: (callback) => {
    const listener = (_event, update) => callback(update)
    ipcRenderer.on("eraser:update-ready", listener)
    return () => ipcRenderer.off("eraser:update-ready", listener)
  },
  windowGetState: () => ipcRenderer.invoke("eraser:window-get-state"),
  windowMinimize: () => ipcRenderer.invoke("eraser:window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("eraser:window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("eraser:window-close"),
  windowTogglePin: () => ipcRenderer.invoke("eraser:window-toggle-pin"),
  windowToggleCollapse: () => ipcRenderer.invoke("eraser:window-toggle-collapse"),
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on("eraser:window-state", listener)
    return () => ipcRenderer.off("eraser:window-state", listener)
  },
})
