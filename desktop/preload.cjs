/* eslint-disable @typescript-eslint/no-require-imports */
// The application UI talks only to Eraser's local HTTP server. The only
// exception is this single one-way trigger, used by the administration menu
// to ask the desktop shell to check for an update right away instead of
// waiting for its periodic check.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("eraserDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("eraser:check-for-updates"),
})
