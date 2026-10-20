import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Round brilliant cut: table, star, bezel (kite), upper girdle, lower girdle, pavilion mains, culet.
function brilliant() {
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

export default function Diamond({ size = 76 }) {
  const ref = useRef();
  const [noGL, setNoGL] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch { setNoGL(true); return; } // no WebGL: show the static gem instead
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20); camera.position.set(0, 2.1, 4.9); camera.lookAt(0, -0.12, 0);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.04, flatShading: true,
      side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 1.6 });
    const gem = new THREE.Mesh(brilliant(), mat); gem.rotation.x = 0.28; scene.add(gem);
    const lights = [0xD4AF37, 0xA892B8, 0x50B28E].map((c, i) => {
      const l = new THREE.PointLight(c, 6, 8); l.userData.a = (i / 3) * Math.PI * 2; scene.add(l); return l;
    });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf, t0 = performance.now();
    const frame = now => {
      const t = (now - t0) / 1000;
      gem.rotation.y = t * 0.35;
      lights.forEach(l => { const a = l.userData.a + t * 0.6; l.position.set(Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2); });
      renderer.render(scene, camera);
      if (!still.matches) raf = requestAnimationFrame(frame);
    };
    frame(t0);
    const onChange = () => { cancelAnimationFrame(raf); frame(performance.now()); };
    still.addEventListener("change", onChange);
    return () => { cancelAnimationFrame(raf); still.removeEventListener("change", onChange); renderer.dispose(); pm.dispose(); };
  }, [size]);
  return (
    <div className="stage" style={{ width: size, height: size }}>
      {noGL ? <i className="fa-regular fa-gem gem-fallback" aria-hidden="true" /> : <canvas ref={ref} width={size} height={size} aria-hidden="true" />}
    </div>
  );
}
