import { useEffect, useLayoutEffect, useRef, useState } from "react";

const FIT = 0.95;          // at "Fit" a sheet fills 95% of the mat
const CAPTION = 40;        // px reserved under each sheet for its caption
const MIN = 0.25, MAX = 6; // zoom limits, relative to Fit
const STEPS_MM = [10, 20, 50, 100, 200, 500];
const MIN_SQUARE_PX = 14;  // smallest grid square worth drawing

const fmt = mm => mm >= 10 ? `${mm / 10} cm` : `${mm} mm`;

/**
 * Zoom for the sheet previews, plus a cutting-mat grid drawn at the sheets' true scale:
 * one grid square is a whole number of centimetres on the printed sheet, and the grid starts at the first sheet's corner.
 * `sheetMm` is the [width, height] of a sheet in millimetres, or null when nothing is shown.
 */
export function useSheetZoom(sheetMm) {
  const matRef = useRef(null), anchor = useRef(null), zoomRef = useRef(1);
  const [zoom, setZoomState] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const setZoom = (z, at) => {
    const el = matRef.current; z = Math.min(MAX, Math.max(MIN, z));
    if (!el || z === zoomRef.current) return;
    const px = at?.x ?? el.clientWidth / 2, py = at?.y ?? el.clientHeight / 2;
    anchor.current = { px, py, sx: el.scrollLeft + px, sy: el.scrollTop + py, ratio: z / zoomRef.current };
    zoomRef.current = z; setZoomState(z);
  };

  useEffect(() => {
    const el = matRef.current;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    // Trackpad pinch and Ctrl/⌘-scroll arrive as wheel events with ctrlKey set.
    const onWheel = e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", onWheel); };
  }, []);

  // A new layout starts at Fit.
  const key = sheetMm?.join("x");
  useEffect(() => { zoomRef.current = 1; setZoomState(1); anchor.current = null; }, [key]);

  const fit = sheetMm && box.w ? FIT * Math.min(box.w / sheetMm[0], (box.h - CAPTION) / sheetMm[1]) : 0;
  const pxPerMm = fit * zoom;
  const stepMm = pxPerMm ? STEPS_MM.find(s => s * pxPerMm >= MIN_SQUARE_PX) ?? STEPS_MM.at(-1) : 0;
  // After layout: keep the point under the cursor still while zooming, and pin the grid to the first sheet's corner.
  const pinGrid = () => {
    const img = matRef.current?.querySelector(".sheets img");
    if (img) setOrigin({ x: img.offsetLeft, y: img.offsetTop });
  };
  useLayoutEffect(() => {
    const el = matRef.current, a = anchor.current;
    if (a) { el.scrollLeft = a.sx * a.ratio - a.px; el.scrollTop = a.sy * a.ratio - a.py; anchor.current = null; }
    pinGrid();
  }, [pxPerMm, box.w, box.h]);

  const matStyle = stepMm ? { "--u": `${stepMm * pxPerMm}px`, "--ox": `${origin.x}px`, "--oy": `${origin.y}px` } : undefined;
  return {
    matRef, matStyle, zoom, sheetWidthPx: sheetMm ? sheetMm[0] * pxPerMm : undefined, onSheetLoad: pinGrid,
    scaleLabel: stepMm ? fmt(stepMm) : "",
    zoomIn: () => setZoom(zoomRef.current * 1.25), zoomOut: () => setZoom(zoomRef.current / 1.25), fitView: () => setZoom(1),
  };
}
