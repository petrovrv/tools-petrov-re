/* tools.petrov.re — shared tool runtime
 * ---------------------------------------------------------------------------
 * Framework file. Loaded by every tool alongside site-disclaimer.js:
 *
 *     <script src="diagram-core.js" defer></script>
 *     <script src="site-disclaimer.js" defer></script>
 *
 * Provides the five things tool-manifest/v2 requires of every listed tool:
 *
 *   1. permalink   — the full input state encoded into the URL, so a result can
 *                    be shared and reopened exactly as it was computed
 *   2. record      — a machine-readable calculation record (JSON / CSV)
 *   3. pdf         — a report whose provenance block always names tools.petrov.re
 *   4. python      — a single-file, stdlib-only Python script reproducing the run
 *   5. handoff     — a common envelope for passing results between tools
 *
 * Nothing here computes physics. A tool registers callbacks; the runtime owns
 * serialisation, provenance and the UI.
 *
 * Revision: 2026-08-12
 */
(() => {
  "use strict";

  const SITE = "https://tools.petrov.re";
  const CORE_REVISION = "2026-08-12";
  const HANDOFF_SCHEMA = "tools.petrov.re/handoff/v1";
  const RECORD_SCHEMA = "tools.petrov.re/calculation-record/v1";

  // ---------------------------------------------------------------- manifest

  function readManifest() {
    const el = document.getElementById("diagram-tool-manifest");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  }
  const manifest = readManifest() || {};
  const toolId = manifest.id || (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  const toolFile = manifest.file || (location.pathname.split("/").pop() || "");

  const langOf = () => {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q) return q.slice(0, 2).toLowerCase();
    } catch { /* ignore */ }
    try { return localStorage.getItem("diagram_lang") || "en"; } catch { return "en"; }
  };

  const titleOf = () => {
    const t = manifest.title;
    if (!t) return document.title || toolId;
    return t[langOf()] || t.en || toolId;
  };

  // ------------------------------------------------------------ state codec
  // JSON -> UTF-8 -> deflate-raw (when available) -> base64url. The prefix marks
  // which path produced the payload so an old link keeps working after a change.

  const b64urlEncode = (bytes) => {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64urlDecode = (str) => {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  async function encodeState(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "function") {
      try {
        const cs = new CompressionStream("deflate-raw");
        const buf = await new Response(
          new Blob([bytes]).stream().pipeThrough(cs)
        ).arrayBuffer();
        return "z" + b64urlEncode(new Uint8Array(buf));
      } catch { /* fall through to the uncompressed path */ }
    }
    return "u" + b64urlEncode(bytes);
  }

  async function decodeState(str) {
    if (!str) return null;
    const kind = str[0], body = str.slice(1);
    try {
      let bytes = b64urlDecode(body);
      if (kind === "z") {
        const ds = new DecompressionStream("deflate-raw");
        const buf = await new Response(
          new Blob([bytes]).stream().pipeThrough(ds)
        ).arrayBuffer();
        bytes = new Uint8Array(buf);
      } else if (kind !== "u") {
        return null;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  // ------------------------------------------------------------- provenance

  function nowISO() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

  /** The block that must appear on every exported artefact. */
  function provenance(permalink) {
    const bench = manifest.benchmarks || null;
    return {
      source: SITE,
      tool: { id: toolId, file: toolFile, title: titleOf() },
      tool_revision: manifest.manifest_revision || null,
      core_revision: CORE_REVISION,
      status: manifest.status || "prototype",
      independent_validation: manifest.independent_validation === true,
      benchmark: bench ? {
        status: bench.status || "not_run",
        suite: bench.suite || null,
        passed: bench.passed ?? null,
        total: bench.total ?? null,
        run: bench.run || null,
        register: SITE + "/validation.html#" + toolId
      } : { status: "not_run", register: SITE + "/validation.html#" + toolId },
      generated: nowISO(),
      permalink: permalink || null
    };
  }

  /** Human-readable one-block version, used in PDF footers and Python headers. */
  function provenanceLines(permalink) {
    const p = provenance(permalink);
    const b = p.benchmark;
    const benchLine = b.status === "benchmarked"
      ? `Benchmarks: ${b.passed}/${b.total} passed against published reference values (${b.run}). Register: ${b.register}`
      : `Benchmarks: ${b.status}. Register: ${b.register}`;
    return [
      `Produced by ${p.tool.title} — ${SITE}/${p.tool.file}`,
      `Source: ${SITE}`,
      `Tool revision ${p.tool_revision || "n/a"} · runtime ${p.core_revision} · generated ${p.generated}`,
      benchLine,
      `Status: ${p.status}${p.independent_validation ? "" : " · no independent validation claim is made"}`,
      p.permalink ? `Reproduce: ${p.permalink}` : null,
      `Results are the user's own. This is an engineering model, not a design or compliance approval.`
    ].filter(Boolean);
  }

  // ------------------------------------------------------------------ tools

  let reg = null;   // whatever the tool passed to DiagramCore.register()

  const need = (name) => {
    if (!reg) throw new Error("diagram-core: tool did not call DiagramCore.register()");
    if (typeof reg[name] !== "function") throw new Error(`diagram-core: tool did not provide ${name}()`);
    return reg[name];
  };

  async function permalink() {
    const state = need("getState")();
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("lang", langOf());
    url.searchParams.set("s", await encodeState(state));
    return url.toString();
  }

  async function record() {
    const state = need("getState")();
    const results = typeof reg.getResults === "function" ? reg.getResults() : null;
    return {
      schema: RECORD_SCHEMA,
      provenance: provenance(await permalink()),
      inputs: state,
      results,
      quantities: typeof reg.getQuantities === "function" ? reg.getQuantities() : null
    };
  }

  const download = (name, mime, text) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const stamp = () => nowISO().replace(/[:T]/g, "-").replace("Z", "");

  async function exportJSON() {
    download(`${toolId}-${stamp()}.json`, "application/json",
             JSON.stringify(await record(), null, 2));
  }

  async function exportCSV() {
    const r = await record();
    const rows = [["section", "key", "value", "unit"]];
    const walk = (section, obj) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (v && typeof v === "object" && !Array.isArray(v) && "value" in v)
          rows.push([section, k, v.value, v.unit || ""]);
        else if (v && typeof v === "object") walk(section + "." + k, v);
        else rows.push([section, k, v, ""]);
      }
    };
    walk("input", r.inputs); walk("result", r.results);
    const esc = (s) => /[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
    const provCsv = provenanceLines(r.provenance.permalink).map(l => "# " + l).join("\n");
    download(`${toolId}-${stamp()}.csv`, "text/csv",
             provCsv + "\n" + rows.map(r2 => r2.map(esc).join(",")).join("\n"));
  }

  // -------------------------------------------------------------------- PDF
  // Report is built as a print-only DOM and handed to the browser's PDF writer,
  // so it stays vector, needs no library, and adds nothing to page weight.
  // Tools that already ship a jsPDF exporter should call DiagramCore.provenanceLines()
  // and print those lines into their own footer rather than duplicating this.

  async function exportPDF() {
    const link = await permalink();
    const sections = typeof reg.getReport === "function" ? reg.getReport() : [];
    const host = document.createElement("div");
    host.id = "diagram-core-report";
    host.innerHTML = `
      <style>
        @media screen { #diagram-core-report { display:none } }
        @media print {
          body > *:not(#diagram-core-report) { display:none !important }
          #diagram-core-report { display:block; font:11pt/1.45 Georgia,serif; color:#000 }
          #diagram-core-report h1 { font-size:17pt; margin:0 0 2mm }
          #diagram-core-report h2 { font-size:12pt; margin:6mm 0 2mm; border-bottom:1px solid #999; padding-bottom:1mm }
          #diagram-core-report table { border-collapse:collapse; width:100%; font-size:10pt }
          #diagram-core-report td, #diagram-core-report th { border:1px solid #bbb; padding:1.5mm 2mm; text-align:left }
          #diagram-core-report img, #diagram-core-report canvas { max-width:100%; page-break-inside:avoid }
          #diagram-core-report .prov { margin-top:8mm; padding-top:2mm; border-top:2px solid #000;
                                       font:8.5pt/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#222 }
          #diagram-core-report .prov b { font-size:9.5pt }
          @page { margin:16mm 14mm 14mm }
        }
      </style>
      <h1></h1>
      <div class="body"></div>
      <div class="prov"></div>`;
    host.querySelector("h1").textContent = titleOf();

    const body = host.querySelector(".body");
    for (const s of sections) {
      if (s.heading) { const h = document.createElement("h2"); h.textContent = s.heading; body.appendChild(h); }
      if (s.text) { const p = document.createElement("p"); p.textContent = s.text; body.appendChild(p); }
      if (s.table) {
        const t = document.createElement("table");
        t.innerHTML = s.table.map((row, i) =>
          "<tr>" + row.map(c => `<${i === 0 ? "th" : "td"}>${String(c)}</${i === 0 ? "th" : "td"}>`).join("") + "</tr>"
        ).join("");
        body.appendChild(t);
      }
      if (s.canvas) {
        const img = document.createElement("img");
        try { img.src = s.canvas.toDataURL("image/png"); body.appendChild(img); } catch { /* tainted canvas */ }
      }
    }

    const prov = host.querySelector(".prov");
    prov.innerHTML = "<b>Provenance</b><br>" +
      provenanceLines(link).map(l => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");

    document.body.appendChild(host);
    const cleanup = () => { host.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 60000);
  }

  // ------------------------------------------------------- jsPDF attribution
  // Several tools predate this runtime and build their PDF with their own jsPDF
  // code, in their own units (pt, mm) and their own layout. Rather than editing
  // each exporter — and having to re-edit it whenever the layout changes — the
  // runtime wraps jsPDF's output methods and stamps the provenance footer on
  // every page just before the document is written. One hook, every report.

  let lastPermalink = null;
  const PDF_STAMPED = Symbol.for("diagram.provenanceStamped");

  function stampPdf(doc) {
    if (doc[PDF_STAMPED]) return;
    doc[PDF_STAMPED] = true;
    const sf = (doc.internal && doc.internal.scaleFactor) || 1;
    const u = (pt) => pt / sf;                       // points -> the document's own unit
    const page = doc.internal.pageSize;
    const W = (typeof page.getWidth === "function") ? page.getWidth() : page.width;
    const H = (typeof page.getHeight === "function") ? page.getHeight() : page.height;
    const lines = provenanceLines(lastPermalink);

    const n = doc.internal.getNumberOfPages();
    const prevSize = doc.getFontSize ? doc.getFontSize() : 10;
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      if (doc.setTextColor) doc.setTextColor(115);
      const bottom = H - u(8);
      const top = bottom - u(7.6) * (lines.length - 1);
      if (doc.setDrawColor) doc.setDrawColor(180);
      if (doc.line) doc.line(u(28), top - u(6), W - u(28), top - u(6));
      lines.forEach((ln, k) => {
        const text = doc.splitTextToSize ? doc.splitTextToSize(ln, W - u(56))[0] : ln;
        doc.text(String(text), u(28), top + u(7.6) * k);
      });
      if (n > 1) doc.text(`${i} / ${n}`, W - u(28), bottom, { align: "right" });
    }
    doc.setFontSize(prevSize);
    if (doc.setTextColor) doc.setTextColor(0);
  }

  function hookJsPDF() {
    const ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!ctor || !ctor.prototype || ctor.prototype[PDF_STAMPED]) return;
    ctor.prototype[PDF_STAMPED] = true;   // mark the prototype so we wrap only once
    for (const method of ["save", "output"]) {
      const original = ctor.prototype[method];
      if (typeof original !== "function") continue;
      ctor.prototype[method] = function (...args) {
        try { stampPdf(this); } catch { /* never block the user's export */ }
        return original.apply(this, args);
      };
    }
  }

  // jsPDF is usually loaded from a CDN with `defer`, so it may not exist yet.
  // Poll briefly, then give up quietly — a tool with no PDF export needs no hook.
  (function waitForJsPDF(tries = 0) {
    if ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF) { hookJsPDF(); return; }
    if (tries < 40) setTimeout(() => waitForJsPDF(tries + 1), 250);
  })();

  // Keep a permalink warm so the footer can carry it without making the
  // synchronous save() path wait on compression.
  function refreshPermalink() {
    if (!reg || typeof reg.getState !== "function") return;
    permalink().then(l => { lastPermalink = l; }).catch(() => {});
  }

  // ----------------------------------------------------------------- Python
  // Single file, standard library only, no pip install. The tool supplies the body;
  // the runtime supplies the provenance header and the input block, so every
  // generated script says where it came from and how to get back to the run.

  async function pythonSource() {
    const state = need("getState")();
    const link = await permalink();
    const body = typeof reg.getPython === "function" ? reg.getPython(state) : null;
    if (!body) return null;
    const header = [
      '"""',
      ...provenanceLines(link),
      "",
      "This script is self-contained and uses only the Python standard library.",
      "It reproduces the calculation shown in the browser; it does not re-derive the",
      "underlying correlations, whose sources are named in the tool's validation entry.",
      '"""',
      "",
      "# --- inputs, exactly as entered in the browser -----------------------------",
      "INPUTS = " + pyLiteral(state),
      ""
    ].join("\n");
    return header + body.trimEnd() + "\n";
  }

  function pyLiteral(v, indent = 0) {
    const pad = " ".repeat(indent);
    if (v === null || v === undefined) return "None";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "float('nan')";
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return "[\n" + v.map(x => pad + "    " + pyLiteral(x, indent + 4)).join(",\n") + "\n" + pad + "]";
    }
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return "{\n" + keys.map(k => pad + "    " + JSON.stringify(k) + ": " + pyLiteral(v[k], indent + 4)).join(",\n") +
           "\n" + pad + "}";
  }

  async function exportPython() {
    const src = await pythonSource();
    if (!src) { alert("This tool does not provide a Python export."); return; }
    download(`${toolId}-${stamp()}.py`, "text/x-python", src);
  }

  // ---------------------------------------------------------------- handoff
  // A tool publishes results as unit-tagged quantities under a shared vocabulary,
  // so the receiving tool reads physics rather than another tool's field names.

  const HANDOFF_KEY = "diagram_handoff";

  function sendTo(targetFile, quantities, note) {
    const envelope = {
      schema: HANDOFF_SCHEMA,
      from: { id: toolId, file: toolFile, title: titleOf() },
      to: targetFile,
      created: nowISO(),
      note: note || null,
      quantities
    };
    try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(envelope)); }
    catch { /* private mode: fall back to the URL only */ }
    const url = new URL(targetFile, location.href);
    url.searchParams.set("lang", langOf());
    url.searchParams.set("from", toolId);
    location.href = url.toString();
  }

  /** Returns the envelope addressed to this tool, or null. Consumes it. */
  function received() {
    let raw = null;
    try { raw = sessionStorage.getItem(HANDOFF_KEY); } catch { return null; }
    if (!raw) return null;
    let env;
    try { env = JSON.parse(raw); } catch { return null; }
    if (env.schema !== HANDOFF_SCHEMA) return null;
    if (env.to && env.to !== toolFile) return null;
    try { sessionStorage.removeItem(HANDOFF_KEY); } catch { /* ignore */ }
    return env;
  }

  // -------------------------------------------------------------------- API

  async function restore() {
    let s = null;
    try { s = new URLSearchParams(location.search).get("s"); } catch { /* ignore */ }
    if (!s || !reg || typeof reg.setState !== "function") return false;
    const state = await decodeState(s);
    if (!state) return false;
    try { reg.setState(state); return true; } catch { return false; }
  }

  async function copyPermalink() {
    const link = await permalink();
    try { await navigator.clipboard.writeText(link); return link; }
    catch { prompt("Copy this link:", link); return link; }
  }

  const API = {
    revision: CORE_REVISION,
    site: SITE,
    manifest, toolId, toolFile,
    register(r) {
      reg = r;
      document.dispatchEvent(new CustomEvent("diagram-core:ready"));
      restore().then(refreshPermalink);
      document.addEventListener("input", refreshPermalink, { passive: true });
      document.addEventListener("change", refreshPermalink, { passive: true });
    },
    permalink, copyPermalink,
    record, exportJSON, exportCSV, exportPDF,
    pythonSource, exportPython,
    provenance, provenanceLines,
    sendTo, received,
    encodeState, decodeState
  };

  Object.defineProperty(window, "DiagramCore", { value: Object.freeze(API), writable: false });
})();
