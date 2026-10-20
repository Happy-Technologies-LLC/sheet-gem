// MaxRects bin packing, best-short-side-fit, 90° rotation allowed.
export class MaxRects {
  constructor(w, h) { this.free = [[0, 0, w, h]]; }
  insert(w, h, rot = true) {
    let best = null;
    for (const [fx, fy, fw, fh] of this.free)
      for (const [rw, rh, r] of rot ? [[w, h, false], [h, w, true]] : [[w, h, false]])
        if (rw <= fw && rh <= fh) {
          const sc = [Math.min(fw - rw, fh - rh), Math.max(fw - rw, fh - rh)];
          if (!best || sc[0] < best.sc[0] || (sc[0] === best.sc[0] && sc[1] < best.sc[1]))
            best = { sc, x: fx, y: fy, w: rw, h: rh, r };
        }
    if (!best) return null;
    const { x, y } = best; w = best.w; h = best.h;
    const nf = [];
    for (const f of this.free) {
      const [fx, fy, fw, fh] = f;
      if (x >= fx + fw || x + w <= fx || y >= fy + fh || y + h <= fy) { nf.push(f); continue; }
      if (x > fx) nf.push([fx, fy, x - fx, fh]);
      if (x + w < fx + fw) nf.push([x + w, fy, fx + fw - x - w, fh]);
      if (y > fy) nf.push([fx, fy, fw, y - fy]);
      if (y + h < fy + fh) nf.push([fx, y + h, fw, fy + fh - y - h]);
    }
    const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
    this.free = nf.filter((a, i) => !nf.some((b, j) => i !== j && inside(a, b) && !(inside(b, a) && j > i)));
    return { x, y, r: best.r };
  }
}

export function pack(items, W, H, gap, rotate = true) {
  const order = items.map((_, i) => i).sort((a, b) => items[b][0] * items[b][1] - items[a][0] * items[a][1]);
  const sheets = []; const place = new Array(items.length);
  for (const i of order) {
    const w = items[i][0] + gap, h = items[i][1] + gap; let done = false;
    for (let s = 0; s < sheets.length && !done; s++) {
      const p = sheets[s].insert(w, h, rotate); if (p) { place[i] = { sheet: s, ...p }; done = true; }
    }
    if (!done) {
      const mr = new MaxRects(W, H); const p = mr.insert(w, h, rotate);
      if (!p) throw new Error(`Piece ${i} (${items[i][0]}x${items[i][1]}px) is larger than the sheet`);
      sheets.push(mr); place[i] = { sheet: sheets.length - 1, ...p };
    }
  }
  return { place, count: sheets.length };
}
