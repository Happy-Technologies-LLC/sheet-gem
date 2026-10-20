const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("tiler", {
  pickPdf: () => ipcRenderer.invoke("pick-pdf"),
  pathFor: file => webUtils.getPathForFile(file),
  run: (file, opts) => ipcRenderer.invoke("run", { file, opts }),
  cancel: () => ipcRenderer.invoke("cancel"),
  save: suggested => ipcRenderer.invoke("save", { suggested }),
  reveal: p => ipcRenderer.invoke("reveal", p),
  onLog: cb => { const h = (_e, t) => cb(t); ipcRenderer.on("log", h); return () => ipcRenderer.removeListener("log", h); },
});
