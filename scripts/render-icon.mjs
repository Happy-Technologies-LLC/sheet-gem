// Renders build/icon.png (1024×1024, transparent corners) from scripts/icon/: the app's gold glitter and 3D diamond.
// Run: npm run icon   (npx electron scripts/render-icon.mjs)
import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../build/icon.png");

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, transparent: true, frame: false,
    webPreferences: { backgroundThrottling: false },
  });
  try {
    await win.loadFile(path.join(here, "icon/index.html"));
    const dataUrl = await win.webContents.executeJavaScript("window.renderIcon()", true);
    await writeFile(out, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
