import { contextBridge, ipcRenderer } from "electron";

/** Minimal, safe IPC surface for the overlay renderer (Phase 20). */
contextBridge.exposeInMainWorld("desktopAPI", {
  shield: {
    toggle: (): Promise<boolean> => ipcRenderer.invoke("shield:toggle"),
    get: (): Promise<boolean> => ipcRenderer.invoke("shield:get"),
    onStatus: (cb: (on: boolean) => void) => {
      const h = (_e: unknown, on: boolean) => cb(on);
      ipcRenderer.on("shield:status", h);
      return () => ipcRenderer.removeListener("shield:status", h);
    },
  },
  clickThrough: {
    toggle: (): Promise<boolean> => ipcRenderer.invoke("clickthrough:toggle"),
  },
  window: {
    hide: () => ipcRenderer.invoke("window:hide"),
    setAlwaysOnTop: (on: boolean) => ipcRenderer.invoke("window:set-always-on-top", on),
    nextDisplay: () => ipcRenderer.invoke("display:next"),
  },
  systemAudio: {
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke("system-audio:available"),
  },
  onShortcut: (cb: (action: string) => void) => {
    const h = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on("shortcut:action", h);
    return () => ipcRenderer.removeListener("shortcut:action", h);
  },
});
