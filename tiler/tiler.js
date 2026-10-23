import { createRequire } from "node:module";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { INK, dilate, dilate1D, erode, label, fillHoles, transpose, rot90 } from "./image.js";
import { pack } from "./pack.js";

export const PAPERS = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], "ARCH-E": [914, 1219], "ARCH-D": [610, 914] };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const groups = idx => { const g = []; for (const i of idx) { if (g.length && i - g.at(-1).at(-1) === 1) g.at(-1).push(i); else g.push([i]); } return g; };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
// pdf.js in Node hands these straight to fs.readFile after appending a filename, so they must be plain paths ending in a separator.
const asset = d => path.join(pdfjsDir, d) + path.sep;

async function render(page, dpi) {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const w = Math.round(viewport.width), h = Math.round(viewport.height);
  const canvas = createCanvas(w, h), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const rgba = ctx.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
  // Ink darkness = darkest channel, so pale coloured size lines (yellow, pink, cyan) come through as dark lines instead of
  // turning near-white the way plain luminance makes them.
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = Math.min(rgba[j], rgba[j + 1], rgba[j + 2]);
  page.cleanup();
  return { data, w, h };
}

function borderBox({ data, w, h }) {
  const cs = new Int32Array(w), rs = new Int32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x] < 110) { cs[x]++; rs[y]++; }
  const gx = groups([...cs.keys()].filter(x => cs[x] > h * 0.6)), gy = groups([...rs.keys()].filter(y => rs[y] > w * 0.6));
  if (gx.length < 2 || gy.length < 2) return null;
  return { x0: mean(gx[0]), x1: mean(gx.at(-1)), y0: mean(gy[0]), y1: mean(gy.at(-1)), lw: gx[0].length };
}

async function loadTiles(buf, dpi, pages, log) {
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), standardFontDataUrl: asset("standard_fonts"), cMapUrl: asset("cmaps"),
    wasmUrl: asset("wasm"), isEvalSupported: false });
  const doc = await task.promise;
  const idx = pages ?? [...Array(doc.numPages).keys()];
  const found = [];
  for (const [k, i] of idx.entries()) { log(`Reading page ${k + 1} of ${idx.length}`); const img = await render(await doc.getPage(i + 1), dpi); const b = borderBox(img); if (b) found.push({ i, img, b }); else log(`page ${i + 1}: no tile border`); }
  await task.destroy();
  if (!found.length) throw new Error("No tile border boxes found");
  const W = median(found.map(t => t.b.x1 - t.b.x0)), H = median(found.map(t => t.b.y1 - t.b.y0));
  const tiles = found.filter(t => Math.abs(t.b.x1 - t.b.x0 - W) < W * 0.02 && Math.abs(t.b.y1 - t.b.y0 - H) < H * 0.02);
  const skipped = idx.filter(i => !tiles.some(t => t.i === i));
  return { tiles, W: Math.round(W), H: Math.round(H), lw: median(tiles.map(t => t.b.lw)), skipped };
}

function stitch(tiles, cols, W, H) {
  const rows = Math.ceil(tiles.length / cols), cw = cols * W + 1, ch = rows * H + 1;
  const data = new Uint8Array(cw * ch).fill(255);
  tiles.forEach((t, k) => {
    const r = Math.floor(k / cols), c = k % cols, xs = Math.round(t.b.x0), ys = Math.round(t.b.y0);
    for (let y = 0; y <= H; y++) {
      const sy = ys + y; if (sy >= t.img.h) break;
      const so = sy * t.img.w, d = (r * H + y) * cw + c * W;
      for (let x = 0; x <= W && xs + x < t.img.w; x++) { const v = t.img.data[so + xs + x]; if (v < data[d + x]) data[d + x] = v; }
    }
  });
  return { data, w: cw, h: ch, rows };
}

function seamScore(tiles, cols, W, H) {
  const cv = stitch(tiles, cols, W, H); const { data, w, h, rows } = cv;
  let hit = 0, tot = 0;
  const cmp = (a, b) => { const n = a.length, da = dilate1D(a, n, 1, 20, true), db = dilate1D(b, n, 1, 20, true);
    for (let i = 0; i < n; i++) { tot += a[i] + b[i]; hit += (b[i] & da[i]) + (a[i] & db[i]); } };
  for (let r = 1; r < rows; r++) { const y = r * H, a = new Uint8Array(w), b = new Uint8Array(w);
    for (let x = 0; x < w; x++) { a[x] = data[(y - 14) * w + x] < 128; b[x] = data[(y + 14) * w + x] < 128; } cmp(a, b); }
  for (let c = 1; c < cols; c++) { const x = c * W, a = new Uint8Array(h), b = new Uint8Array(h);
    for (let y = 0; y < h; y++) { a[y] = data[y * w + x - 14] < 128; b[y] = data[y * w + x + 14] < 128; } cmp(a, b); }
  return hit / Math.max(tot, 1);
}

function runs(data, w, y) {
  const out = []; let s = -1; const o = y * w;
  for (let x = 0; x <= w; x++) { const d = x < w && data[o + x] < 128; if (d && s < 0) s = x; if (!d && s >= 0) { out.push([s, x - 1]); s = -1; } }
  return out;
}
function bridge(data, w, h, seams, hw) {
  const ctr = r => (r[0] + r[1]) / 2;
  for (const s of seams) {
    const a = s - hw - 1, b = s + hw + 1; if (a - 6 < 0 || b + 6 >= h) continue;
    const T = runs(data, w, a), B = runs(data, w, b), Ta = runs(data, w, a - 6); const used = new Set();
    for (const t of T) {
      if (t[1] - t[0] > 80) continue;
      let slope = 0;
      if (Ta.length) { const o = Ta.reduce((p, q) => Math.abs(ctr(q) - ctr(t)) < Math.abs(ctr(p) - ctr(t)) ? q : p);
        if (Math.abs(ctr(o) - ctr(t)) < 40) slope = (ctr(t) - ctr(o)) / 6; }
      const pred = ctr(t) + slope * (b - a); let best = null;
      B.forEach((q, j) => { if (used.has(j) || q[1] - q[0] > 80) return; const d = Math.abs(ctr(q) - pred); if (!best || d < best.d) best = { d, j }; });
      if (!best || best.d > 12) continue;
      used.add(best.j); const q = B[best.j];
      for (let y = a; y <= b; y++) { const f = (y - a) / (b - a);
        const l = Math.round(t[0] + (q[0] - t[0]) * f), r = Math.round(t[1] + (q[1] - t[1]) * f);
        for (let x = Math.max(l, 0); x <= Math.min(r, w - 1); x++) data[y * w + x] = INK; }
    }
  }
}
function removeSeams(cv, cols, W, H, lw) {
  const { w, h, rows } = cv; let data = cv.data.slice(); const hw = (lw >> 1) + 2;
  for (let i = 0; i < data.length; i++) if (data[i] > PAPER) data[i] = 255;
  for (let i = 0; i <= cols; i++) { const x = i * W; for (let y = 0; y < h; y++) for (let xx = Math.max(x - hw, 0); xx <= Math.min(x + hw, w - 1); xx++) data[y * w + xx] = 255; }
  for (let i = 0; i <= rows; i++) { const y = i * H; for (let yy = Math.max(y - hw, 0); yy <= Math.min(y + hw, h - 1); yy++) data.fill(255, yy * w, yy * w + w); }
  bridge(data, w, h, [...Array(rows - 1)].map((_, i) => (i + 1) * H), hw);
  let t = transpose(data, w, h); bridge(t, h, w, [...Array(cols - 1)].map((_, i) => (i + 1) * W), hw);
  return { data: transpose(t, h, w), w, h };
}

// Anything lighter than this is paper. Hairlines (0.25 pt is ~1 px at 300 dpi) anti-alias to light greys, so the cut-off
// sits close to white; a lower one erases thin lines and leaves gaps in piece outlines.
const PAPER = 245;

// Print-at-home patterns put matching letters/numbers beside each tile seam, one copy on each side ("B | B"), and at
// tile corners four copies. Once the seams are gone they are clutter, so remove small compact marks that have a
// same-sized twin mirrored across an interior seam. Works on vertical seams; horizontal seams go through transpose().
// Sizes are judged on the ink itself (the grown box minus the growth), so dashes and dots of size lines, which are
// at most ~0.35 mm thick, never qualify. Known gap: genuine pattern marks drawn mirror-image across a seam would go too.
function removeMatchMarks(data, w, h, seams, dpi) {
  const mm = v => Math.round(v / 25.4 * dpi), D = mm(16), tol = mm(3), lo = mm(0.8), hi = mm(12), r = mm(0.5);
  let removed = 0;
  for (const sx of seams) {
    const x0 = Math.max(sx - D, 0), x1 = Math.min(sx + D, w), bw = x1 - x0, band = new Uint8Array(bw * h);
    for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < bw; x++) band[y * bw + x] = data[o + x0 + x] < PAPER ? 1 : 0; }
    const grown = dilate(band, bw, h, r), { lab, boxes } = label(grown, bw, h);
    const marks = [];
    for (let id = 1; id < boxes.length; id++) {
      const b = boxes[id], bwid = b.x1 - b.x0 - 2 * r, bht = b.y1 - b.y0 - 2 * r;
      if (bwid < lo || bht < lo || bwid > hi || bht > hi) continue;           // dots/dashes are thinner, labels and pieces bigger
      if (b.x0 === 0 || b.x1 === bw || bwid > 3 * bht || bht > 3 * bwid) continue; // must sit inside the band and be compact
      const cx = x0 + (b.x0 + b.x1) / 2 - sx;
      if (Math.abs(cx) < mm(0.5)) continue;                                   // straddles the seam: no twin to compare
      marks.push({ id, cx, cy: (b.y0 + b.y1) / 2, bwid, bht, hit: false });
    }
    const like = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.3 + 2;
    for (const a of marks) for (const b of marks) {
      if (a === b || Math.sign(a.cx) === Math.sign(b.cx)) continue;
      if (Math.abs(a.cx + b.cx) <= tol && Math.abs(a.cy - b.cy) <= tol && like(a.bwid, b.bwid) && like(a.bht, b.bht)) a.hit = b.hit = true;
    }
    const kill = new Set(marks.filter(m => m.hit).map(m => m.id)); removed += kill.size;
    if (kill.size) for (let y = 0; y < h; y++) for (let x = 0; x < bw; x++) if (kill.has(lab[y * bw + x])) data[y * w + x0 + x] = 255;
  }
  return removed;
}
export function removeAllMatchMarks(clean, cols, rows, W, H, dpi, pageNumbers) {
  const { w, h } = clean; let data = clean.data;
  let n = removeMatchMarks(data, w, h, [...Array(cols - 1)].map((_, i) => (i + 1) * W), dpi);
  const t = transpose(data, w, h); n += removeMatchMarks(t, h, w, [...Array(rows - 1)].map((_, i) => (i + 1) * H), dpi);
  data = transpose(t, h, w);
  if (pageNumbers) n += removeTileFurniture(data, w, h, cols, rows, W, H, dpi);
  return { clean: { data, w, h }, removed: n };
}

// Opt-in: page numbers sit at the same spot on every page, so remove small marks found at the same tile-relative
// position and height on at least half the pages. This can also catch genuine pattern marks that happen to repeat
// at the page pitch (quilting guides, button or drill marks), which is why it is off unless the user asks for it.
function removeTileFurniture(data, w, h, cols, rows, W, H, dpi) {
  const mm = v => Math.round(v / 25.4 * dpi), tol = mm(2.5), lo = mm(0.8), hi = mm(15), r = mm(0.5), tiles = [];
  for (let tr = 0; tr < rows; tr++) for (let tc = 0; tc < cols; tc++) {
    const x0 = tc * W, y0 = tr * H, tw = Math.min(W, w - x0), th = Math.min(H, h - y0); if (tw <= 0 || th <= 0) continue;
    const m = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) { const o = (y0 + y) * w + x0; for (let x = 0; x < tw; x++) m[y * tw + x] = data[o + x] < PAPER ? 1 : 0; }
    const { lab, boxes } = label(dilate(m, tw, th, r), tw, th), marks = [];
    for (let id = 1; id < boxes.length; id++) {
      const b = boxes[id], bw = b.x1 - b.x0 - 2 * r, bh = b.y1 - b.y0 - 2 * r;
      if (b.x0 === 0 || b.y0 === 0 || b.x1 === tw || b.y1 === th) continue;    // cut by the page edge: part of something larger
      if (bw < lo || bh < lo || bw > hi || bh > hi || bw > 5 * bh || bh > 5 * bw) continue;
      marks.push({ id, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, bh, hits: 0 });
    }
    tiles.push({ x0, y0, tw, th, lab, marks });
  }
  if (tiles.length < 3) return 0;
  const need = Math.max(3, Math.ceil(tiles.length / 2));
  for (const t of tiles) for (const a of t.marks) for (const u of tiles) {
    if (u.marks.some(b => Math.abs(a.cx - b.cx) <= tol && Math.abs(a.cy - b.cy) <= tol && Math.abs(a.bh - b.bh) <= Math.max(a.bh, b.bh) * 0.3 + 2)) a.hits++;
  }
  let removed = 0;
  for (const t of tiles) {
    const kill = new Set(t.marks.filter(a => a.hits >= need).map(a => a.id)); removed += kill.size; if (!kill.size) continue;
    for (let y = 0; y < t.th; y++) for (let x = 0; x < t.tw; x++) if (kill.has(t.lab[y * t.tw + x])) data[(t.y0 + y) * w + t.x0 + x] = 255;
  }
  return removed;
}

// Copy-shop plotters print 1-pixel hairlines faint and broken. Darken anti-aliased greys and thicken every line by one
// pixel (0.085 mm at 300 dpi: far below cutting accuracy) so dashed size lines stay readable.
function boldLines(data, w, h) {
  const lut = new Uint8Array(256); for (let v = 0; v < 256; v++) lut[v] = v > PAPER ? 255 : Math.round(255 * (v / 255) ** 2.2);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = data[i];
    if (x > 0 && data[i - 1] < v) v = data[i - 1];
    if (y > 0) { if (data[i - w] < v) v = data[i - w]; if (x > 0 && data[i - w - 1] < v) v = data[i - w - 1]; }
    data[i] = lut[v];
  }
}

function segment(clean, dpi) {
  const f = 4, s = dpi / f, sw = Math.floor(clean.w / f), sh = Math.floor(clean.h / f);
  let sm = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let min = 255; for (let dy = 0; dy < f; dy++) { const o = (y * f + dy) * clean.w + x * f; for (let dx = 0; dx < f; dx++) if (clean.data[o + dx] < min) min = clean.data[o + dx]; }
    sm[y * sw + x] = min < 200 ? 1 : 0; } // any ink in the block counts: averaging erased hairlines and split pieces apart
  sm = dilate(sm, sw, sh, 2);
  const { lab, n, boxes } = label(sm, sw, sh);
  const area = b => (b.y1 - b.y0) * (b.x1 - b.x0);
  const order = [...Array(n).keys()].map(i => i + 1).sort((a, b) => area(boxes[b]) - area(boxes[a]));
  const pieces = [], orphans = []; const closeR = Math.round(0.25 * s), bigThr = (4 * s) ** 2;
  for (const id of order) {
    const b = boxes[id]; let host = null;
    for (const p of pieces) {
      if (b.x0 < p.x0 || b.y0 < p.y0 || b.x1 > p.x0 + p.w || b.y1 > p.y0 + p.h) continue;
      let inside = 0, tot = 0;
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (lab[y * sw + x] === id) { tot++; inside += p.fill[(y - p.y0) * p.w + x - p.x0]; }
      if (inside / tot > 0.9) { host = p; break; }
    }
    if (host) { host.ids.push(id); continue; }
    if (area(b) > bigThr) {
      const pad = closeR + 2, x0 = Math.max(b.x0 - pad, 0), y0 = Math.max(b.y0 - pad, 0), x1 = Math.min(b.x1 + pad, sw), y1 = Math.min(b.y1 + pad, sh);
      const pw = x1 - x0, ph = y1 - y0, m = new Uint8Array(pw * ph);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) m[y * pw + x] = lab[(y + y0) * sw + x + x0] === id ? 1 : 0;
      const closed = erode(dilate(m, pw, ph, closeR), pw, ph, closeR);
      const fill = fillHoles(closed, pw, ph); for (let i = 0; i < m.length; i++) fill[i] |= m[i];
      pieces.push({ x0, y0, w: pw, h: ph, fill, ids: [id] });
    } else orphans.push(id);
  }
  const parts = [];
  for (const p of pieces) { // full-size mask at 1/4 res
    const mask = new Uint8Array(sw * sh); const ids = new Set(p.ids);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const g = (y + p.y0) * sw + x + p.x0; if (p.fill[y * p.w + x] || ids.has(lab[g])) mask[g] = 1; }
    parts.push({ kind: "piece", mask });
  }
  const keep = new Set(orphans.filter(id => boxes[id].size > 60));
  const om = new Uint8Array(sw * sh); for (let i = 0; i < om.length; i++) if (keep.has(lab[i])) om[i] = 1;
  const cl = label(dilate(om, sw, sh, Math.round(0.6 * s)), sw, sh);
  const blocks = new Map();
  for (let i = 0; i < om.length; i++) if (om[i]) { const c = cl.lab[i]; if (!blocks.has(c)) blocks.set(c, new Uint8Array(sw * sh)); blocks.get(c)[i] = 1; }
  for (const m of blocks.values()) { let c = 0; for (const v of m) c += v; if (c > 150) parts.push({ kind: "info", mask: m }); }
  return { parts, f, sw, sh };
}

function extract(clean, mask, f, sw, sh) {
  const m = dilate(mask, sw, sh, 3); let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (m[y * sw + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x1++; y1++; const w = (x1 - x0) * f, h = (y1 - y0) * f; const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) { const my = y0 + ((y / f) | 0); for (let x = 0; x < w; x++) {
    if (m[my * sw + x0 + ((x / f) | 0)]) { const sy = y0 * f + y, sx = x0 * f + x; if (sy < clean.h && sx < clean.w) out[y * w + x] = clean.data[sy * clean.w + sx]; } } }
  return { data: out, w, h };
}

export function paperPx(spec, dpi) {
  const s = spec.toUpperCase(); const px = mm => Math.round(mm / 25.4 * dpi);
  if (s.startsWith("ROLL")) return [px(parseFloat(s.slice(4))), null];
  if (PAPERS[s]) return PAPERS[s].map(px);
  const m = s.match(/^([\d.]+)X([\d.]+)(MM)?$/); if (!m) throw new Error(`Unknown paper "${spec}"`);
  return [px(+m[1]), px(+m[2])];
}

export async function tile(buf, opts = {}) {
  const { paper = "A0", dpi = 300, previewScale = 10, margin = 10, gap = 10, keepSeams = false, rotate = true, boldLines: bold = true,
    removePageNumbers = false, log = () => {} } = opts;
  const mm = v => Math.round(v / 25.4 * dpi);
  const { tiles, W, H, lw, skipped } = await loadTiles(buf, dpi, opts.pages, log);
  const n = tiles.length;
  log(`${n} tiles, tile ${(W / dpi * 25.4).toFixed(1)}x${(H / dpi * 25.4).toFixed(1)}mm, skipped pages [${skipped.map(i => i + 1)}]`);
  let cols = opts.cols;
  if (!cols) {
    let cands = [...Array(n).keys()].filter(c => c >= 2 && Math.ceil(n / c) > 1);
    const exact = cands.filter(c => n % c === 0); if (exact.length) cands = exact;
    const scores = Object.fromEntries(cands.map(c => [c, seamScore(tiles, c, W, H)]));
    cols = +Object.keys(scores).reduce((a, b) => scores[a] >= scores[b] ? a : b);
    log("grid scores: " + JSON.stringify(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, +v.toFixed(3)]))));
  }
  log("Stitching tiles");
  const cv = stitch(tiles, cols, W, H); tiles.length = 0;
  log(`grid ${cv.rows}x${cols}, assembled ${(cv.w / dpi * 25.4).toFixed(0)}x${(cv.h / dpi * 25.4).toFixed(0)}mm`);
  log(keepSeams ? "Cleaning page numbers" : "Removing tile seams");
  let clean;
  if (keepSeams) { clean = { data: cv.data, w: cv.w, h: cv.h }; for (let i = 0; i < clean.data.length; i++) if (clean.data[i] > PAPER) clean.data[i] = 255; }
  else clean = removeSeams(cv, cols, W, H, lw);
  let marks = 0;
  if (!keepSeams) { log("Removing page-matching marks"); ({ clean, removed: marks } = removeAllMatchMarks(clean, cols, cv.rows, W, H, dpi, removePageNumbers)); }
  log("Finding pattern pieces");
  const { parts, f, sw, sh } = segment(clean, dpi);
  const imgs = parts.map(p => ({ kind: p.kind, ...extract(clean, p.mask, f, sw, sh) }));
  let [SW, SH] = paperPx(paper, dpi); const roll = SH == null;
  const m = mm(margin), g = mm(gap);
  if (roll) SH = imgs.reduce((s, i) => s + Math.max(i.w, i.h), 0) + 10 * g;
  log(`Packing ${imgs.length} pieces`);
  const { place, count } = pack(imgs.map(i => [i.w, i.h]), SW - 2 * m + g, SH - 2 * m + g, g, rotate);
  const sheets = [...Array(count)].map(() => ({ data: new Uint8Array(SW * SH).fill(255), w: SW, h: SH, used: 0 }));
  imgs.forEach((im, i) => {
    const p = place[i]; const img = p.r ? rot90(im) : im; const S = sheets[p.sheet]; const X = p.x + m, Y = p.y + m;
    for (let y = 0; y < img.h; y++) { const so = y * img.w, d = (Y + y) * SW + X; for (let x = 0; x < img.w; x++) { const v = img.data[so + x]; if (v < S.data[d + x]) S.data[d + x] = v; } }
    S.used = Math.max(S.used, Y + img.h);
  });
  if (roll) for (const S of sheets) { S.h = Math.min(S.used + m + mm(8), SH); S.data = S.data.subarray(0, S.w * S.h); }
  if (bold) for (const S of sheets) boldLines(S.data, S.w, S.h);
  log("Writing PDF");
  const out = await PDFDocument.create(); const previews = [];
  for (const [si, S] of sheets.entries()) {
    const fs = Math.round(dpi * 0.2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S.w}" height="${fs * 2}"><text x="${m}" y="${fs * 1.2}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fs}" fill="#000">Sheet ${si + 1}/${count} - print at 100% / Actual Size. Verify the test square before cutting.</text></svg>`;
    const base = sharp(Buffer.from(S.data.buffer, S.data.byteOffset, S.w * S.h), { raw: { width: S.w, height: S.h, channels: 1 }, limitInputPixels: false });
    const png = await base.composite([{ input: Buffer.from(svg), top: S.h - m - fs * 2, left: 0 }]).toColourspace("b-w").png({ compressionLevel: 9 }).toBuffer();
    const wpt = S.w * 72 / dpi, hpt = S.h * 72 / dpi;
    out.addPage([wpt, hpt]).drawImage(await out.embedPng(png), { x: 0, y: 0, width: wpt, height: hpt });
    previews.push(await sharp(png, { limitInputPixels: false }).resize(Math.round(S.w / previewScale)).png().toBuffer());
  }
  const pdf = await out.save();
  const report = { sheets: count, paperMm: [Math.round(SW / dpi * 25.4), Math.round(sheets[0].h / dpi * 25.4)], grid: [cv.rows, cols], tiles: n,
    skippedPages: skipped.map(i => i + 1), pieces: imgs.filter(i => i.kind === "piece").length, infoBlocks: imgs.filter(i => i.kind === "info").length,
    rotated: place.filter(p => p.r).length, matchMarks: marks };
  return { pdf, previews, report };
}
