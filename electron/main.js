import { app, BrowserWindow, ipcMain, dialog, utilityProcess, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
let win, worker, lastPdf;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 940, minHeight: 620, title: "Sheet Gem | Jewels by Juls", backgroundColor: "#FEF2B8",
    webPreferences: { preload: path.join(dir, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  if (process.env.VITE_DEV) win.loadURL("http://localhost:5173");
  else win.loadFile(path.join(dir, "../dist/index.html"));
}

ipcMain.handle("pick-pdf", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Pattern PDF", extensions: ["pdf"] }] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("run", (_e, { file, opts }) => new Promise((resolve, reject) => {
  worker?.kill();
  const out = path.join(os.tmpdir(), `sheet-gem-${Date.now()}.pdf`);
  const w = (worker = utilityProcess.fork(path.join(dir, "worker.js"), [], { serviceName: "Sheet Gem worker" }));
  let settled = false;
  w.on("message", m => {
    if (m.type === "log") win.webContents.send("log", m.text);
    else if (m.type === "done") { settled = true; lastPdf = m.pdfPath; resolve({ report: m.report, previews: m.previews }); w.kill(); }
    else if (m.type === "error") { settled = true; reject(new Error(m.message)); w.kill(); }
  });
  w.on("exit", code => { if (!settled) reject(new Error(code === 0 ? "Cancelled" : `Processing stopped unexpectedly (code ${code})`)); });
  w.postMessage({ file, opts, out });
}));

ipcMain.handle("cancel", () => { worker?.kill(); worker = null; });

ipcMain.handle("save", async (_e, { suggested }) => {
  if (!lastPdf) return null;
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (r.canceled) return null;
  fs.copyFileSync(lastPdf, r.filePath);
  return r.filePath;
});

ipcMain.handle("reveal", (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// Headless smoke test: PT_SMOKE=/path/pattern.pdf PT_SHOT=out.png electron .
if (process.env.PT_SMOKE) {
  ipcMain.removeHandler("pick-pdf");
  ipcMain.handle("pick-pdf", () => process.env.PT_SMOKE);
  app.whenReady().then(() => win.webContents.once("did-finish-load", async () => {
    const js = s => win.webContents.executeJavaScript(s);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(500); await js(`document.querySelector(".file").click()`);
    await wait(500); fs.writeFileSync(process.env.PT_SHOT.replace(".png", "-ready.png"), (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector(".primary").click()`);
    await wait(4000); fs.writeFileSync(process.env.PT_SHOT.replace(".png", "-running.png"), (await win.webContents.capturePage()).toPNG());
    for (let i = 0; i < 120 && !(await js(`!!document.querySelector(".done, .error")`)); i++) await wait(1000);
    await wait(2000); console.log("RESULT:", await js(`(document.querySelector(".done, .error")||{}).innerText`));
    fs.writeFileSync(process.env.PT_SHOT, (await win.webContents.capturePage()).toPNG());
    app.quit();
  }));
}
