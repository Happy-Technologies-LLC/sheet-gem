import * as THREE from "three";

// Round brilliant cut: table, star, bezel (kite), upper girdle, lower girdle, pavilion mains, culet.
export function brilliant() {
  const ring = (n, r, y, off = 0) => [...Array(n)].map((_, i) => {
    const a = (i / n) * Math.PI * 2 + off; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
  const T = ring(8, 0.57, 0.32), S = ring(8, 0.82, 0.2, Math.PI / 8), G = ring(16, 1, 0), P = ring(8, 0.46, -0.5);
  const top = new THREE.Vector3(0, 0.32, 0), C = new THREE.Vector3(0, -0.86, 0);
  const g = i => G[(i + 16) % 16], t = i => T[(i + 8) % 8], s = i => S[(i + 8) % 8], p = i => P[(i + 8) % 8];
  const tris = [];
  for (let k = 0; k < 8; k++) {
    tris.push([top, t(k), t(k + 1)], [t(k), t(k + 1), s(k)],
      [t(k), s(k - 1), g(2 * k)], [t(k), g(2 * k), s(k)],
      [s(k), g(2 * k), g(2 * k + 1)], [s(k), g(2 * k + 1), g(2 * k + 2)],
      [g(2 * k - 1), g(2 * k), p(k)], [g(2 * k), g(2 * k + 1), p(k)], [g(2 * k + 1), p(k + 1), p(k)],
      [p(k), p(k + 1), C]);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(tris.flat());
  geo.computeVertexNormals();
  return geo;
}
