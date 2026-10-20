// Minimal grayscale / binary image ops on typed arrays (row-major).
export const INK = 51;

export function dilate1D(src, w, h, r, horizontal) {
  // binary max filter (square, separable) – O(n) sliding window
  const out = new Uint8Array(w * h);
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let cnt = 0;
      for (let x = 0; x < Math.min(r, w); x++) cnt += src[o + x];
      for (let x = 0; x < w; x++) {
        if (x + r < w) cnt += src[o + x + r];
        if (x - r - 1 >= 0) cnt -= src[o + x - r - 1];
        out[o + x] = cnt > 0 ? 1 : 0;
      }
    }
  } else {
    const cnt = new Int32Array(w);
    for (let y = 0; y < Math.min(r, h); y++) for (let x = 0; x < w; x++) cnt[x] += src[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) { const o = (y + r) * w; for (let x = 0; x < w; x++) cnt[x] += src[o + x]; }
      if (y - r - 1 >= 0) { const o = (y - r - 1) * w; for (let x = 0; x < w; x++) cnt[x] -= src[o + x]; }
      const o = y * w; for (let x = 0; x < w; x++) out[o + x] = cnt[x] > 0 ? 1 : 0;
    }
  }
  return out;
}
export const dilate = (m, w, h, r) => dilate1D(dilate1D(m, w, h, r, true), w, h, r, false);
export function erode(m, w, h, r) {
  const inv = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) inv[i] = 1 - m[i];
  const d = dilate(inv, w, h, r); for (let i = 0; i < d.length; i++) d[i] = 1 - d[i]; return d;
}

export function label(m, w, h) {
  // 4-connected components. Returns {lab, n, boxes:[{y0,y1,x0,x1,size}]} (1-based labels)
  const lab = new Int32Array(w * h); const boxes = [null]; const stack = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i]) continue;
    n++; let sp = 0; stack[sp++] = i; lab[i] = n;
    const b = { y0: h, y1: 0, x0: w, x1: 0, size: 0 };
    while (sp) {
      const p = stack[--sp]; const y = (p / w) | 0, x = p - y * w; b.size++;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack[sp++] = p - 1; }
      if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack[sp++] = p + 1; }
      if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = n; stack[sp++] = p - w; }
      if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = n; stack[sp++] = p + w; }
    }
    b.y1++; b.x1++; boxes.push(b);
  }
  return { lab, n, boxes };
}

export function fillHoles(m, w, h) {
  // flood background from the border; everything not reached is foreground/hole
  const out = new Uint8Array(w * h).fill(1); const stack = new Int32Array(w * h); let sp = 0;
  const push = p => { if (!m[p] && out[p]) { out[p] = 0; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp]; const y = (p / w) | 0, x = p - y * w;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  return out;
}

export function transpose(a, w, h) {
  const t = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) t[x * h + y] = a[o + x]; }
  return t;
}

export function rot90(img) { // counter-clockwise, like numpy.rot90
  const { data, w, h } = img; const out = new Uint8Array(w * h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out[i * h + j] = data[j * w + (w - 1 - i)];
  return { data: out, w: h, h: w };
}
