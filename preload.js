// The only bridge between the renderer and Electron. Everything else in this
// app is plain web code, so the surface stays deliberately tiny: display zoom.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  // set the window's zoom factor (1 = 100%); returns the factor actually applied
  setZoom: (factor) => ipcRenderer.invoke("zoom:set", factor),
  // the View menu and its keyboard shortcuts change zoom too — this keeps the
  // Settings drawer and the saved preference in step with them
  onZoom: (cb) => ipcRenderer.on("zoom:changed", (_e, factor) => cb(factor)),
});
