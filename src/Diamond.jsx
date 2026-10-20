import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { brilliant } from "./gem.js";

export default function Diamond({ size = 76 }) {
  const ref = useRef();
  const [noGL, setNoGL] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch { setNoGL(true); return; } // no WebGL: show the static gem instead
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6; // bright enough to sparkle on cream, no dark backdrop
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    // Seen almost side-on so the crown and the pavilion point both show, like a classic gem silhouette.
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20); camera.position.set(0, 0.2, 4.3); camera.lookAt(0, -0.27, 0);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.04, flatShading: true,
      side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 1.6 });
    // The gem spins about its own axis, and that axis leans (toward the viewer and to one side) so the culet stays visible.
    const gem = new THREE.Mesh(brilliant(), mat), tilt = new THREE.Group();
    gem.position.y = 0.27; tilt.add(gem); tilt.position.y = -0.27; tilt.rotation.set(0.14, 0, -0.22); scene.add(tilt);
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
