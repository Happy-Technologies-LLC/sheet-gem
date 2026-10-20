// Runs in an Electron utility process so the window stays responsive.
import fs from "node:fs";

// pdf.js treats any Electron process whose process.type isn't "browser" as a web page and reaches for `document`.
// A utility process is plain Node, so hide process.type while pdf.js (and its in-process worker) evaluate that check.
const tiler = (async () => {
  const type = Object.getOwnPropertyDescriptor(process, "type");
  delete process.type;
  try {
    globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return await import("../tiler/tiler.js");
  } finally {
    Object.defineProperty(process, "type", type);
  }
})();

// Registered synchronously so the job message main.js posts right after fork() is never missed.
process.parentPort.on("message", async ({ data }) => {
  const send = m => process.parentPort.postMessage(m);
  try {
    const { tile } = await tiler;
    const { pdf, previews, report } = await tile(fs.readFileSync(data.file), {
      ...data.opts, previewScale: 6, log: text => send({ type: "log", text }),
    });
    fs.writeFileSync(data.out, pdf);
    send({ type: "done", report, pdfPath: data.out, previews: previews.map(p => "data:image/png;base64," + p.toString("base64")) });
  } catch (e) {
    send({ type: "error", message: e.message });
  }
});
