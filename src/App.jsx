import { useEffect, useState, useCallback } from "react";
import Diamond from "./Diamond.jsx";
import GlitterText from "./GlitterText.jsx";
import { useSheetZoom } from "./useSheetZoom.js";

const PAPERS = [
  { id: "A0", dims: "841 × 1189 mm" }, { id: "A1", dims: "594 × 841 mm" }, { id: "A2", dims: "420 × 594 mm" },
  { id: "A3", dims: "297 × 420 mm" }, { id: "ARCH-D", dims: "24 × 36 in" }, { id: "ARCH-E", dims: "36 × 48 in" },
  { id: "ROLL", dims: "Any length" }, { id: "CUSTOM", dims: "Width × height" },
];
const api = window.tiler;
const baseName = p => p.split(/[\\/]/).pop();

export default function App() {
  const [file, setFile] = useState(null);
  const [paper, setPaper] = useState("A0");
  const [roll, setRoll] = useState(914);
  const [custom, setCustom] = useState({ w: 841, h: 1189 });
  const [margin, setMargin] = useState(10);
  const [gap, setGap] = useState(10);
  const [rotate, setRotate] = useState(true);
  const [keepSeams, setKeepSeams] = useState(false);
  const [boldLines, setBoldLines] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(false);
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [step, setStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => api?.onLog(t => setStep(t)), []);

  const choose = useCallback(path => {
    if (!path) return;
    if (!/\.pdf$/i.test(path)) { setError("That file isn’t a PDF. Choose the pattern’s PDF file."); setState("error"); return; }
    setFile({ path, name: baseName(path) }); setResult(null); setSaved(null); setError(""); setState("idle");
  }, []);

  const paperSpec = paper === "ROLL" ? `ROLL${roll}` : paper === "CUSTOM" ? `${custom.w}x${custom.h}mm` : paper;

  async function run() {
    setState("running"); setStep("Starting"); setResult(null); setSaved(null); setError("");
    try {
      const r = await api.run(file.path, { paper: paperSpec, margin: +margin, gap: +gap, rotate, keepSeams, boldLines, removePageNumbers: pageNumbers });
      setResult(r); setState("done");
    } catch (e) {
      const msg = String(e.message || e).replace(/^Error invoking remote method 'run': (Error: )?/, "");
      if (msg === "Cancelled") { setState("idle"); return; }
      setError(msg.includes("larger than the sheet")
        ? "One piece is bigger than this paper. Pick a larger size or a plotter roll."
        : msg.includes("No tile border")
        ? "No tiled pages found. This tool needs a print-at-home pattern with a border box on each page."
        : msg);
      setState("error");
    }
  }

  async function save() {
    const p = await api.save(file.name.replace(/\.pdf$/i, "") + `-${paper === "CUSTOM" ? "custom" : paperSpec}.pdf`);
    if (p) setSaved(p);
  }

  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) choose(api.pathFor(f));
  };

  const r = result?.report;
  const view = useSheetZoom(r?.paperMm ?? null);
  return (
    <div className="app" onDragOver={e => { e.preventDefault(); setDragging(true); }}
         onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={onDrop}>
      <div className="titlebar" aria-hidden="true" />
      <aside className="panel">
        <header className="brand">
          <div className="logo">
            <Diamond />
            <div className="logo-text">
              <div className="wordmark"><GlitterText text="Sheet Gem" font={'"Dancing Script", cursive'} size={40} /></div>
              <div className="tagline">Jewels by Juls · Philadelphia</div>
            </div>
          </div>
          <h1>Turn a tape-together pattern into one big <em>sheet</em></h1>
          <p>Sheet Gem lays every piece out at true scale, ready for the print shop.</p>
        </header>

        <section>
          <h2 className="eyebrow">Pattern</h2>
          <button className={"file" + (file ? " has" : "")} onClick={async () => choose(await api.pickPdf())} disabled={state === "running"}>
            <i className={"fa-regular " + (file ? "fa-file-pdf" : "fa-folder-open")} aria-hidden="true" />
            {file ? <span><strong>{file.name}</strong><small>Choose a different file</small></span>
                  : <span><strong>Choose a pattern PDF</strong><small>or drop it anywhere in this window</small></span>}
          </button>
        </section>

        <section>
          <h2 className="eyebrow">Paper</h2>
          <div className="papers" role="radiogroup" aria-label="Paper size">
            {PAPERS.map(p => (
              <label key={p.id} className={"paper" + (paper === p.id ? " on" : "")}>
                <input type="radio" name="paper" value={p.id} checked={paper === p.id} onChange={() => setPaper(p.id)} />
                <span className="pid">{p.id === "ROLL" ? "Roll" : p.id === "CUSTOM" ? "Custom" : p.id}</span>
                <span className="pdims">{p.dims}</span>
              </label>
            ))}
          </div>
          {paper === "ROLL" && (
            <div className="fields"><Num label="Roll width" value={roll} onChange={setRoll} unit="mm" /></div>
          )}
          {paper === "CUSTOM" && (
            <div className="fields">
              <Num label="Width" value={custom.w} onChange={w => setCustom({ ...custom, w })} unit="mm" />
              <Num label="Height" value={custom.h} onChange={h => setCustom({ ...custom, h })} unit="mm" />
            </div>
          )}
        </section>

        <section>
          <h2 className="eyebrow">Layout</h2>
          <div className="fields">
            <Num label="Margin" value={margin} onChange={setMargin} unit="mm" />
            <Num label="Spacing" value={gap} onChange={setGap} unit="mm" />
          </div>
          <Toggle label="Turn pieces to save paper" checked={rotate} onChange={setRotate} />
          <Toggle label="Keep the page grid lines" checked={keepSeams} onChange={setKeepSeams} />
          <Toggle label="Darken thin lines for printing" checked={boldLines} onChange={setBoldLines} />
          <Toggle label="Remove repeated page numbers (check the result)" checked={pageNumbers} onChange={setPageNumbers} />
        </section>

        <footer className="actions">
          {state === "running" ? (
            <div className="running">
              <div className="bar"><i /></div>
              <p aria-live="polite">{step}…</p>
              <button className="secondary small" onClick={() => api.cancel()}><i className="fa-solid fa-xmark" aria-hidden="true" /> Cancel</button>
            </div>
          ) : (
            <button className={result ? "secondary" : "primary"} disabled={!file} onClick={run}><i className="fa-solid fa-scissors" aria-hidden="true" /> {result ? "Combine again" : "Combine pattern"}</button>
          )}
          {state === "error" && <p className="error" role="alert">{error}</p>}
          {state === "done" && r && (
            <div className="done">
              <p className="summary">
                {r.pieces} {r.pieces === 1 ? "piece" : "pieces"} from {r.tiles} pages ({r.grid[0]} rows of {r.grid[1]}) on{" "}
                {r.sheets === 1 ? "one sheet" : `${r.sheets} sheets`}.{r.rotated ? ` ${r.rotated} turned to fit.` : ""}
                {r.matchMarks ? ` Removed ${r.matchMarks} page-matching ${r.matchMarks === 1 ? "mark" : "marks"}.` : ""}
              </p>
              <button className="primary" onClick={save}><i className="fa-solid fa-download" aria-hidden="true" /> Save PDF</button>
              {saved && <p className="saved"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Saved. <button className="link" onClick={() => api.reveal(saved)}>Show in folder</button></p>}
              <p className="hint"><i className="fa-solid fa-ruler" aria-hidden="true" /> Print at 100% (Actual Size), then measure the test square before you cut.</p>
            </div>
          )}
        </footer>
      </aside>

      <main className="board"><div className="melamine">
        <div ref={view.matRef} style={view.matStyle} className={"mat" + (dragging ? " drag" : "") + (view.matStyle ? " scaled" : "")}>
        {result ? (
          <div className="sheets">
            {result.previews.map((src, i) => (
              <figure key={i}>
                <img src={src} alt={`Sheet ${i + 1} preview`} style={{ width: view.sheetWidthPx }} onLoad={i === 0 ? view.onSheetLoad : undefined} />
                <figcaption>Sheet {i + 1} of {result.previews.length}, {r.paperMm[0]} × {r.paperMm[1]} mm</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="empty">
            <i className={"fa-solid " + (dragging ? "fa-file-arrow-down" : state === "running" ? "fa-scissors spin" : "fa-ruler-combined")} aria-hidden="true" />
            <h2>{dragging ? "Drop to load the pattern" : state === "running" ? "Laying out your pieces" : "Your layout appears here"}</h2>
            {state !== "running" && !dragging && <p>Choose a pattern PDF, pick a paper size, and press Combine pattern.</p>}
          </div>
        )}
        </div>
        {result && (
          <div className="zoombar" role="toolbar" aria-label="Zoom">
            {view.scaleLabel && <span className="scale" title="Grid squares are drawn at the sheet's true scale"><i className="fa-regular fa-square" aria-hidden="true" /> = {view.scaleLabel}</span>}
            <button onClick={view.zoomOut} aria-label="Zoom out"><i className="fa-solid fa-minus" aria-hidden="true" /></button>
            <button className="pct" onClick={view.fitView} title="Fit to mat">{view.zoom === 1 ? "Fit" : `${Math.round(view.zoom * 100)}%`}</button>
            <button onClick={view.zoomIn} aria-label="Zoom in"><i className="fa-solid fa-plus" aria-hidden="true" /></button>
          </div>
        )}
      </div></main>
    </div>
  );
}

function Num({ label, value, onChange, unit }) {
  return (
    <label className="num">
      <span>{label}</span>
      <span className="box"><input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} /><em>{unit}</em></span>
    </label>
  );
}
function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="sw" aria-hidden="true" /><span>{label}</span>
    </label>
  );
}
