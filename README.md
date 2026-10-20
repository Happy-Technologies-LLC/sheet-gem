# Sheet Gem (desktop) — Jewels by Juls

This Electron + React app combines tiled print-at-home sewing pattern PDFs onto A0 or large-format sheets at true scale.
The processing pipeline lives in `tiler/`. It runs in an Electron utility process, so the window stays responsive.

```bash
npm install
node node_modules/electron/install.js   # only if npm blocked Electron's install script
npm start          # build UI + launch
npm run dev        # Vite hot reload + Electron
npm run dist:mac   # .dmg   (run on a Mac)
npm run dist:win   # .exe   (run on Windows)
```

Installers land in `release/`. Builds are unsigned by default. Add `CSC_LINK`/`CSC_KEY_PASSWORD` (and Apple notarization env vars on macOS) to sign.

## Layout
- `electron/main.js` handles the window, file dialogs, IPC, and launching the worker.
- `electron/worker.js` runs `tile()` in a utility process and streams progress messages.
- `electron/preload.cjs` exposes a small `window.tiler` API to the UI (context-isolated and sandboxed).
- `src/` holds the React UI: file picker or drag-drop, paper presets, roll, custom size, margin and spacing, rotation and grid-line toggles, preview, and save.
- `tiler/` holds the shared processing code: tile detection, seam removal, piece segmentation, and MaxRects packing. Pages are rendered with pdf.js (`pdfjs-dist` + `@napi-rs/canvas`) and the output PDF is written with `pdf-lib`.

## Smoke test
```bash
PT_SMOKE=/path/pattern.pdf PT_SHOT=/tmp/shot.png npx electron .                    # macOS / Windows
PT_SMOKE=/path/pattern.pdf PT_SHOT=/tmp/shot.png xvfb-run electron . --no-sandbox  # headless Linux
```

## License
MIT, see `LICENSE`. Bundled third-party pieces keep their own licenses: Mirza and Lexend Mega fonts (SIL OFL 1.1), Font Awesome Free icons (CC BY 4.0) and fonts (OFL 1.1), libvips via sharp (LGPL-3.0, dynamically linked), pdf.js and sharp (Apache-2.0).
