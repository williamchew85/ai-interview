import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import { join } from "node:path";

/**
 * Phase 20 — optional Electron overlay. The headline capability over the
 * browser extension is the TRUE SHIELD: setContentProtection(true) excludes the
 * window from screen captures/recordings (D8) — a content script cannot do this.
 * Also: frameless + transparent + always-on-top, click-through, multi-display
 * move, keyboard nudge. System-audio loopback (20.4) is a follow-up capability
 * stubbed here behind a clear availability check.
 */

let win: BrowserWindow | null = null;
let shieldOn = true;
let clickThrough = false;

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: 340,
    height: 480,
    x: workArea.x + workArea.width - 364,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  // THE SHIELD: exclude the overlay from screen capture/recording.
  win.setContentProtection(shieldOn);

  win.loadFile(join(__dirname, "renderer", "index.html"));
}

function registerShortcuts(): void {
  const send = (action: string) => win?.webContents.send("shortcut:action", action);
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    if (!win) return;
    win.isVisible() ? win.hide() : win.show();
  });
  globalShortcut.register("CommandOrControl+Shift+A", () => send("ask"));
  globalShortcut.register("CommandOrControl+Shift+E", () => toggleShield());
  globalShortcut.register("CommandOrControl+Shift+X", () => toggleClickThrough());
  for (const [key, dir] of [
    ["Up", [0, -40]], ["Down", [0, 40]], ["Left", [-40, 0]], ["Right", [40, 0]],
  ] as const) {
    globalShortcut.register(`CommandOrControl+Shift+${key}`, () => nudge(dir[0], dir[1]));
  }
}

function toggleShield(): boolean {
  shieldOn = !shieldOn;
  win?.setContentProtection(shieldOn);
  win?.webContents.send("shield:status", shieldOn);
  return shieldOn;
}

function toggleClickThrough(): boolean {
  clickThrough = !clickThrough;
  win?.setIgnoreMouseEvents(clickThrough, { forward: true });
  win?.webContents.send("clickthrough:status", clickThrough);
  return clickThrough;
}

function nudge(dx: number, dy: number): void {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();

  ipcMain.handle("shield:toggle", () => toggleShield());
  ipcMain.handle("shield:get", () => shieldOn);
  ipcMain.handle("clickthrough:toggle", () => toggleClickThrough());
  ipcMain.handle("window:hide", () => win?.hide());
  ipcMain.handle("window:set-always-on-top", (_e, on: boolean) => win?.setAlwaysOnTop(!!on, "screen-saver"));
  ipcMain.handle("display:next", () => moveToNextDisplay());
  // System-audio loopback availability (20.4): wired to a real capturer later.
  ipcMain.handle("system-audio:available", () => process.platform === "win32");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function moveToNextDisplay(): void {
  if (!win) return;
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return;
  const cur = screen.getDisplayNearestPoint({ x: win.getPosition()[0], y: win.getPosition()[1] });
  const idx = displays.findIndex((d) => d.id === cur.id);
  const next = displays[(idx + 1) % displays.length]!;
  win.setPosition(next.workArea.x + 24, next.workArea.y + 24);
}

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
