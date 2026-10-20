import { useEffect, useRef } from "react";
import { makeFlake, drawFlake, drawFlare } from "./glitter.js";

// Procedural gold glitter lettering: the text is filled with tiny angled metal flakes (see glitter.js),
// lit by a light centred over the lettering. A few four-point star flares
// bloom on random flakes. Adapted from a standalone "gold glitter canvas" demo; sized for a small wordmark.

const PAD = 14;         // CSS px around the text so star flares aren't clipped
const FLAKE = 1.15;     // flake radius, CSS px
const STEP = 1.0;       // flake spacing, CSS px
const FLARES = 5;

export default function GlitterText({ text, font, size }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2), css = `700 ${size}px ${font}`;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let flakes = [], flares = [], raf = 0, t = 0, W = 0, H = 0, base = null;
    const light = { x: 0, y: 0, z: 0 };

    const build = () => {
      ctx.font = css;
      const m = ctx.measureText(text), w = Math.ceil(m.width + 2 * PAD), h = Math.ceil(size * 1.35 + 2 * PAD);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      canvas.style.margin = `${-PAD}px`; // the padding hangs outside the layout box
      W = canvas.width = Math.round(w * dpr); H = canvas.height = Math.round(h * dpr);
      const mask = new OffscreenCanvas(W, H), mc = mask.getContext("2d");
      mc.font = `700 ${size * dpr}px ${font}`; mc.textBaseline = "middle"; mc.fillText(text, PAD * dpr, H / 2);
      // Burnished gold underlayer so the gaps between flakes read as metal, not background.
      base = new OffscreenCanvas(W, H); const bc = base.getContext("2d"), grad = bc.createLinearGradient(0, PAD * dpr, 0, H - PAD * dpr);
      grad.addColorStop(0, "#C4952F"); grad.addColorStop(0.5, "#8A6514"); grad.addColorStop(1, "#5E430C");
      bc.font = mc.font; bc.textBaseline = "middle"; bc.fillStyle = grad; bc.fillText(text, PAD * dpr, H / 2);
      const a = mc.getImageData(0, 0, W, H).data, step = STEP * dpr;
      flakes = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const sx = Math.round(Math.min(W - 1, Math.max(0, x + (Math.random() - 0.5) * step * 0.95)));
        const sy = Math.round(Math.min(H - 1, Math.max(0, y + (Math.random() - 0.5) * step * 0.95)));
        const al = a[(sy * W + sx) * 4 + 3];
        if (al > 80) flakes.push(makeFlake(sx, sy, FLAKE * dpr * (al < 200 ? 0.75 : 1)));
      }
      flares = [...Array(FLARES)].map(() => ({ i: 0, phase: Math.random() * Math.PI, speed: 0, size: 0, rot: Math.random() * Math.PI }));
      flares.forEach(resetFlare);
    };
    const resetFlare = fl => {
      fl.i = (Math.random() * flakes.length) | 0; fl.speed = 0.035 + Math.random() * 0.045; fl.size = 6 + Math.random() * 8;
    };

    const frame = () => {
      t += 0.018;
      // The light hangs over the centre of the lettering; it only breathes up and down, so the sparkle shifts without wandering.
      light.x = W / 2; light.y = H / 2; light.z = W * (0.35 + Math.sin(t * 1.3) * 0.08);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0);
      for (const f of flakes) drawFlake(ctx, f, light.x, light.y, light.z);
      for (const fl of flares) {
        fl.phase += fl.speed; fl.rot += 0.004;
        if (fl.phase >= Math.PI) { fl.phase = 0; resetFlare(fl); }
        if (flakes[fl.i]) drawFlare(ctx, flakes[fl.i], fl, dpr);
      }
      if (!still.matches) raf = requestAnimationFrame(frame);
    };
    const restart = () => { cancelAnimationFrame(raf); frame(); };

    let alive = true;
    document.fonts.load(css).then(() => { if (alive) { build(); frame(); } });
    still.addEventListener("change", restart);
    return () => { alive = false; cancelAnimationFrame(raf); still.removeEventListener("change", restart); };
  }, [text, font, size]);

  return (
    <span className="glitter-text">
      <canvas ref={ref} aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
