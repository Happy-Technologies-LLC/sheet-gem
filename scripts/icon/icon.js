// Sheet Gem app icon: a Big Sur grid squircle faced with the app's gold glitter, with the app's 3D diamond on top.
// Loaded by scripts/render-icon.mjs, which calls window.renderIcon() and saves the returned PNG data URL.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makeFlake, drawFlake, drawFlare } from "../../src/glitter.js";
import { brilliant } from "../../src/gem.js";

const SIZE = 1024, X = 100, Y = 100, W = 824, R = 185; // macOS Big Sur icon grid
const CX = SIZE / 2, CY = SIZE / 2;
const FLAKE = 6.5, STEP = 6;        // glitter flake radius and spacing, px at 1024
const LIGHT = { x: CX, y: 300, z: 470 };
const GEM = 560;                    // gem canvas size; the stone spans ~87% of it (~60% of the squircle)
const GEM_Y = CY + 10;
// The app's spin angle and light clock, frozen at a flattering moment. A still frame needs a lower exposure and
// stronger coloured lights than the animated app gem, or the facets wash out to flat white.
const SPIN = 0.45, LIGHT_T = 4, EXPOSURE = 0.55, LIGHT_POWER = 150;

// mulberry32: small seedable RNG so every run produces the same flakes.
function seeded(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(0x5EE76E3);

const squircle = (ctx, inset = 0) => {
  ctx.beginPath(); ctx.roundRect(X + inset, Y + inset, W - 2 * inset, W - 2 * inset, R - inset);
};

function glitterFace() {
  const c = new OffscreenCanvas(SIZE, SIZE), ctx = c.getContext("2d");
  squircle(ctx); ctx.clip();
  // Burnished gold underlayer so the gaps between flakes read as metal.
  const base = ctx.createLinearGradient(0, Y, 0, Y + W);
  base.addColorStop(0, "#C4952F"); base.addColorStop(0.5, "#8A6514"); base.addColorStop(1, "#5E430C");
  ctx.fillStyle = base; ctx.fillRect(X, Y, W, W);
  const flakes = [];
  for (let y = Y - STEP; y < Y + W + STEP; y += STEP) for (let x = X - STEP; x < X + W + STEP; x += STEP) {
    flakes.push(makeFlake(x + (rand() - 0.5) * STEP * 0.95, y + (rand() - 0.5) * STEP * 0.95, FLAKE, rand));
  }
  for (const f of flakes) drawFlake(ctx, f, LIGHT.x, LIGHT.y, LIGHT.z);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Warm the pale flakes toward gold: at icon sizes the cream/white tones otherwise average out to beige.
  ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "#D4AF37"; ctx.fillRect(X, Y, W, W);
  ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "#F4D36A"; ctx.fillRect(X, Y, W, W);
  // Bright hotspot under the light, falling off toward the rim so the face reads as a lit plate.
  ctx.globalCompositeOperation = "screen";
  const hot = ctx.createRadialGradient(LIGHT.x, LIGHT.y, 0, LIGHT.x, LIGHT.y, W * 0.55);
  hot.addColorStop(0, "rgba(255, 236, 160, 0.7)"); hot.addColorStop(0.5, "rgba(255, 220, 120, 0.22)"); hot.addColorStop(1, "rgba(255, 220, 120, 0)");
  ctx.fillStyle = hot; ctx.fillRect(X, Y, W, W);
  ctx.globalCompositeOperation = "source-over";
  const v = ctx.createRadialGradient(LIGHT.x, LIGHT.y, W * 0.25, CX, CY, W * 0.75);
  v.addColorStop(0, "rgba(60, 34, 4, 0)"); v.addColorStop(1, "rgba(60, 34, 4, 0.6)");
  ctx.fillStyle = v; ctx.fillRect(X, Y, W, W);
  return c;
}

function gemImage(px) {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(px, px, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = EXPOSURE;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20); camera.position.set(0, 0.2, 4.3); camera.lookAt(0, -0.27, 0);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.04, flatShading: true,
    side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 1.6 });
  const gem = new THREE.Mesh(brilliant(), mat), tilt = new THREE.Group();
  gem.position.y = 0.27; tilt.add(gem); tilt.position.y = -0.27; tilt.rotation.set(0.14, 0, -0.22); scene.add(tilt);
  gem.rotation.y = SPIN;
  [0xD4AF37, 0xA892B8, 0x50B28E].forEach((c, i) => {
    const l = new THREE.PointLight(c, LIGHT_POWER, 8), a = (i / 3) * Math.PI * 2 + LIGHT_T * 0.6;
    l.position.set(Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2); scene.add(l);
  });
  renderer.render(scene, camera);
  return canvas;
}

window.renderIcon = async () => {
  const out = document.createElement("canvas"); out.width = out.height = SIZE;
  const ctx = out.getContext("2d");

  // Soft drop shadow under the plate.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.32)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
  squircle(ctx); ctx.fillStyle = "#5E430C"; ctx.fill();
  ctx.restore();
  ctx.drawImage(glitterFace(), 0, 0);

  ctx.save();
  squircle(ctx); ctx.clip();
  // Thin bevel: bright upper rim, darker lower rim.
  const rim = ctx.createLinearGradient(0, Y, 0, Y + W);
  rim.addColorStop(0, "rgba(255, 250, 220, 0.75)"); rim.addColorStop(0.45, "rgba(255, 250, 220, 0)");
  rim.addColorStop(0.6, "rgba(50, 28, 2, 0)"); rim.addColorStop(1, "rgba(50, 28, 2, 0.6)");
  ctx.strokeStyle = rim; ctx.lineWidth = 12; squircle(ctx); ctx.stroke();
  // Dark oval halo so the white stone stands off the gold.
  ctx.translate(CX, GEM_Y); ctx.scale(1, 0.72);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, GEM * 0.66);
  halo.addColorStop(0, "rgba(40, 20, 0, 0.85)"); halo.addColorStop(0.55, "rgba(40, 20, 0, 0.6)"); halo.addColorStop(1, "rgba(40, 20, 0, 0)");
  ctx.fillStyle = halo; ctx.fillRect(-GEM, -GEM, 2 * GEM, 2 * GEM);
  ctx.restore();

  // The diamond, supersampled 2× and dropped onto the plate with a soft shadow.
  const gem = gemImage(GEM * 2);
  ctx.save();
  ctx.shadowColor = "rgba(30, 14, 0, 0.85)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 24;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(gem, CX - GEM / 2, GEM_Y - GEM / 2, GEM, GEM);
  ctx.restore();

  // A few star flares: on the open gold and one on the stone's crown.
  const flares = [[262, 262, 40], [800, 300, 28], [258, 742, 24], [770, 790, 34], [404, 372, 48]];
  for (const [x, y, size] of flares) drawFlare(ctx, { x, y }, { phase: Math.PI / 2, size, rot: rand() * Math.PI }, 2.2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return out.toDataURL("image/png");
};
