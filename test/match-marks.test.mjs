// Clean-up must clear page furniture without erasing pattern content that merely looks similar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { removePageMarks, whitenPaper } from "../tiler/tiler.js";

const DPI = 300, mm = v => Math.round(v / 25.4 * DPI);
const W = mm(100), H = mm(100), COLS = 2, ROWS = 2; // four 100 mm tiles, one interior corner at (W, H)

// Draws on a white canvas the size of the stitched pattern and returns it as the grayscale buffer the tiler works on.
function canvas(draw) {
  const c = createCanvas(COLS * W, ROWS * H), ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = ctx.strokeStyle = "#000"; draw(ctx);
  const rgba = ctx.getImageData(0, 0, c.width, c.height).data, data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = Math.min(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
  return { data, w: c.width, h: c.height };
}
const inkIn = ({ data, w }, x0, y0, x1, y1, below = 200) => {
  let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (data[y * w + x] < below) n++; return n;
};
const all = img => inkIn(img, 0, 0, img.w, img.h);
const run = img => removePageMarks({ ...img, data: img.data.slice() }, COLS, ROWS, W, H, DPI);
const dashed = (ctx, x0, y0, x1, y1) => {
  ctx.lineWidth = mm(0.3); ctx.setLineDash([mm(3), mm(2)]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
};

test("removes the four copies of a corner letter", () => {
  const img = canvas(ctx => {
    ctx.font = `${mm(3)}px sans-serif`;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillText("B", W + dx * mm(6) - mm(1), H + dy * mm(6) + mm(1));
  });
  const { clean, removed } = run(img);
  assert.equal(removed, 4);
  assert.equal(inkIn(clean, W - mm(10), H - mm(10), W + mm(10), H + mm(10)), 0);
});

test("keeps a dashed line crossing a seam square-on next to a corner, dashes mirrored about it", () => {
  const img = canvas(ctx => { ctx.lineDashOffset = mm(1.5); dashed(ctx, W - mm(40), H - mm(8), W + mm(40), H - mm(8)); });
  const before = all(img), { clean, removed } = run(img);
  assert.ok(before > 0);
  assert.equal(removed, 0);
  assert.equal(all(clean), before);
});

test("keeps a dashed line crossing a seam at an angle next to a corner", () => { // the vest's shoulder lines: compact diagonal dashes
  const img = canvas(ctx => dashed(ctx, W - mm(40), H - mm(28), W + mm(40), H + mm(12)));
  const before = all(img), { clean } = run(img);
  assert.equal(all(clean), before);
});

test("page-number removal leaves marks that are cut by a page edge", () => {
  const img = canvas(ctx => { // a small notch shape straddling every vertical page edge at the same height
    for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS; c++) ctx.fillRect(c * W - mm(1.5), r * H + mm(30), mm(3), mm(3));
  });
  const before = all(img), { clean } = run(img);
  assert.equal(all(clean), before);
});

test("paper clean-up drops pale watermarks but keeps the faint edges of hairlines", () => {
  const img = canvas(ctx => {
    ctx.fillStyle = "#e2e2e4"; ctx.font = `${mm(60)}px sans-serif`; ctx.fillText("10", mm(20), mm(90)); // watermark page number
    ctx.strokeStyle = "#000"; ctx.lineWidth = mm(0.09); ctx.beginPath(); ctx.moveTo(mm(5), mm(150)); ctx.lineTo(mm(195), mm(160)); ctx.stroke();
  });
  const line = inkIn(img, 0, mm(140), img.w, mm(170), 246), clean = { ...img, data: img.data.slice() };
  assert.ok(inkIn(img, 0, 0, img.w, mm(100), 246) > 1000);
  whitenPaper(clean.data, clean.w, clean.h);
  assert.equal(inkIn(clean, 0, 0, clean.w, mm(100), 246), 0);
  assert.ok(inkIn(clean, 0, mm(140), clean.w, mm(170), 246) >= line * 0.95);
});
