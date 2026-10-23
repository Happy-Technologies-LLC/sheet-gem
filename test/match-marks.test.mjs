// Page-matching mark removal must clear seam letters without erasing pattern content that merely looks similar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { removeAllMatchMarks } from "../tiler/tiler.js";

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
const inkIn = ({ data, w }, x0, y0, x1, y1) => {
  let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (data[y * w + x] < 200) n++; return n;
};
const run = (img, pageNumbers = false) => removeAllMatchMarks({ ...img, data: img.data.slice() }, COLS, ROWS, W, H, DPI, pageNumbers);

test("removes the four copies of a corner letter", () => {
  const img = canvas(ctx => {
    ctx.font = `${mm(3)}px sans-serif`;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillText("B", W + dx * mm(6) - mm(1), H + dy * mm(6) + mm(1));
  });
  const { clean, removed } = run(img);
  assert.equal(removed, 4);
  assert.equal(inkIn(clean, W - mm(10), H - mm(10), W + mm(10), H + mm(10)), 0);
});

test("keeps a dashed line that crosses a seam, even with dashes mirrored about it", () => {
  const img = canvas(ctx => {
    ctx.lineWidth = mm(0.3); ctx.setLineDash([mm(3), mm(2)]); ctx.lineDashOffset = mm(1.5); // bold cut line, dash centred on the seam
    ctx.beginPath(); ctx.moveTo(W - mm(40), mm(50)); ctx.lineTo(W + mm(40), mm(50)); ctx.stroke();
  });
  const before = inkIn(img, 0, 0, img.w, img.h), { clean, removed } = run(img);
  assert.ok(before > 0);
  assert.equal(removed, 0);
  assert.equal(inkIn(clean, 0, 0, clean.w, clean.h), before);
});

test("keeps drill circles repeated at the same spot on every page unless page-number removal is asked for", () => {
  const img = canvas(ctx => {
    ctx.lineWidth = mm(0.25);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.beginPath(); ctx.arc(c * W + mm(50), r * H + mm(60), mm(1.5), 0, 2 * Math.PI); ctx.stroke(); }
  });
  const before = inkIn(img, 0, 0, img.w, img.h);
  const kept = run(img);
  assert.equal(kept.removed, 0);
  assert.equal(inkIn(kept.clean, 0, 0, kept.clean.w, kept.clean.h), before);
  assert.equal(run(img, true).removed, 4); // the opt-in pass cannot tell them from page numbers: that's why it is opt-in
});

test("page-number removal leaves marks that are cut by a page edge", () => {
  const img = canvas(ctx => { // a small notch shape straddling every vertical page edge at the same height
    for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS; c++) ctx.fillRect(c * W - mm(1.5), r * H + mm(30), mm(3), mm(3));
  });
  const before = inkIn(img, 0, 0, img.w, img.h), { clean } = run(img, true);
  assert.equal(inkIn(clean, 0, 0, clean.w, clean.h), before);
});
