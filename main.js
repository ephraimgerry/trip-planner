// Electron main process — opens the trip planner in a desktop window.
// The UI is plain web files; all user data lives in the backend database, so
// this process only owns the window, the menu and the display zoom.
const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const path = require("path");

// Display size. Zoom steps rather than free-form: every stop is a size the
// layout was actually looked at, and +/- always lands somewhere sensible.
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];
const clampZoom = f => Math.min(2, Math.max(0.8, Number(f) || 1));
function setZoom(win, factor) {
  if (!win || win.isDestroyed()) return 1;
  const f = clampZoom(factor);
  win.webContents.setZoomFactor(f);
  win.webContents.send("zoom:changed", f);   // keep Settings and the pref in step
  return f;
}
function stepZoom(win, dir) {
  if (!win || win.isDestroyed()) return;
  const now = win.webContents.getZoomFactor();
  // nearest stop, then move one along — so a factor set from Settings still steps cleanly
  let i = ZOOM_STEPS.reduce((best, v, n) =>
    Math.abs(v - now) < Math.abs(ZOOM_STEPS[best] - now) ? n : best, 0);
  i = Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir));
  setZoom(win, ZOOM_STEPS[i]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Trip Planner",
    backgroundColor: "#f7f7f5",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // enables the in-app mini browser (<webview>) in the extended sidebar
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // pinch-to-zoom on the trackpad, which Chromium allows and Electron does not
  // until you say so
  win.webContents.setVisualZoomLevelLimits(1, 3);

  // Tell the renderer where the API actually is. Hardcoding a port meant the app
  // broke the moment the backend ran anywhere else — on another machine, or
  // because something local already had 4177.
  const apiPort = process.env.PORT || process.env.API_PORT || 4177;
  win.loadFile(path.join(__dirname, "frontend", "index.html"), {
    search: "api=" + encodeURIComponent(`http://127.0.0.1:${apiPort}`),
  });

  // surface renderer errors on the terminal — silent failures in the UI are
  // otherwise invisible when running from the CLI
  win.webContents.on("console-message", (e) => {
    const level = e && e.level, message = (e && e.message) || "";
    if (level !== "error" && level !== "warning") return;
    if (/Electron Security Warning/.test(message)) return;
    const src = String((e && e.sourceId) || "").split("/").pop();
    console.error(`[renderer] ${message}${src ? ` (${src}:${e.lineNumber})` : ""}`);
  });

  // open external links (booking sites, RED, maps) in the real browser, not in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

const focused = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

app.whenReady().then(() => {
  // the renderer restores the saved display size on boot, and Settings uses this too
  ipcMain.handle("zoom:set", (e, factor) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const f = clampZoom(factor);
    if (win && !win.isDestroyed()) win.webContents.setZoomFactor(f);
    return f;
  });

  // a minimal app menu (keeps copy/paste, devtools, reload working)
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
        { type: "separator" },
        // The stock viewMenu binds zoom in to Cmd+Plus only, which a Mac
        // keyboard never sends — you press Cmd+=, and nothing happens.
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => setZoom(focused(), 1) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => stepZoom(focused(), +1) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", visible: false, click: () => stepZoom(focused(), +1) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+numadd", visible: false, click: () => stepZoom(focused(), +1) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => stepZoom(focused(), -1) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+numsub", visible: false, click: () => stepZoom(focused(), -1) },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]));

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
