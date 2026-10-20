// Procedural gold glitter: tiny angled metal flakes, each with its own surface normal, lit Blinn-Phong style,
// plus four-point star flares. Pure canvas math shared by GlitterText and the app-icon renderer.
// `rand` defaults to Math.random; pass a seeded generator for reproducible output.

export const GOLD = {
  tones: [[255, 246, 196], [243, 202, 101], [212, 153, 45], [145, 94, 21], [82, 49, 10], [255, 255, 240]],
  specular: [255, 255, 245],
  flare: "rgba(255, 240, 180, ",
};
const SHININESS = 45;

export function makeFlake(x, y, r, rand = Math.random) {
  const sides = rand() > 0.4 ? 6 : rand() > 0.5 ? 5 : 4;
  const rx = r * (0.75 + rand() * 0.55), ry = r * (0.65 + rand() * 0.55);
  const poly = [...Array(sides)].map((_, i) => {
    const a = (i / sides) * Math.PI * 2, w = 0.8 + rand() * 0.4;
    return [Math.cos(a) * rx * w, Math.sin(a) * ry * w];
  });
  const theta = rand() * Math.PI * 2, phi = rand() * 0.68; // tilt up to ~39°
  return {
    x, y, r, poly, rot: rand() * Math.PI * 2,
    nx: Math.sin(phi) * Math.cos(theta), ny: Math.sin(phi) * Math.sin(theta), nz: Math.cos(phi),
    base: GOLD.tones[(rand() * GOLD.tones.length) | 0], refl: 0.75 + rand() * 0.5,
  };
}

export function drawFlake(ctx, f, lx, ly, lz) {
  const dx = lx - f.x, dy = ly - f.y, d = Math.hypot(dx, dy, lz) || 1;
  const Lx = dx / d, Ly = dy / d, Lz = lz / d;
  const hl = Math.hypot(Lx, Ly, Lz + 1) || 1; // halfway vector between light and a straight-on viewer
  const ndl = Math.max(0, f.nx * Lx + f.ny * Ly + f.nz * Lz);
  const spec = Math.pow(Math.max(0, (f.nx * Lx + f.ny * Ly + f.nz * (Lz + 1)) / hl), SHININESS) * f.refl;
  const lit = Math.min(1, 0.45 + ndl * 0.6); // brighter ambient than the dark-background original: this sits on cream
  const c = i => Math.min(255, (f.base[i] * lit + spec * GOLD.specular[i]) | 0);
  ctx.setTransform(1, 0, 0, 1, f.x, f.y); ctx.rotate(f.rot);
  ctx.fillStyle = `rgb(${c(0)},${c(1)},${c(2)})`;
  ctx.beginPath(); f.poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  if (spec > 0.65) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, f.r * 0.45, 0, Math.PI * 2); ctx.fill(); }
}

// Draws a flare `fl` ({ phase, size, rot }) centred on flake `f`; `dpr` scales its size and ray widths.
export function drawFlare(ctx, f, fl, dpr) {
  const k = Math.sin(fl.phase); if (k <= 0.01) return;
  const s = fl.size * k * dpr, ray = (len, w) => {
    ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(0, -w, len, 0); ctx.quadraticCurveTo(0, w, -len, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -len); ctx.quadraticCurveTo(-w, 0, 0, len); ctx.quadraticCurveTo(w, 0, 0, -len); ctx.fill();
  };
  ctx.setTransform(1, 0, 0, 1, f.x, f.y); ctx.rotate(fl.rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.28);
  g.addColorStop(0, "#fff"); g.addColorStop(0.3, GOLD.flare + 0.95 * k + ")"); g.addColorStop(1, GOLD.flare + "0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GOLD.flare + 0.85 * k + ")"; ray(s, 0.9 * dpr);
  ctx.rotate(Math.PI / 4); ray(s * 0.45, 0.5 * dpr);
}
