/* tools.petrov.re — shared UI runtime
 * API: tools.petrov.re/ui/v1
 *
 * Third shared file, loaded after site-disclaimer.js and diagram-common.js.
 * It owns the screen: design tokens, theme, the app shell and its placement law,
 * panels, fields, results, states, learn mode, stage sizing, units and shortcuts.
 *
 * It owns no domain state and no data contract. The manifest, the calculation
 * record, the PDF attribution, the Python export and the handoff vocabulary stay
 * with diagram-common.js.
 *
 * Dependency-free. Side-effect-safe: a page that never calls DiagramUI.app() gets
 * the token layer, the focus styles and the shared-chrome safe-area repair, and
 * nothing else. Every callback a tool supplies is wrapped; an exception inside one
 * is logged, never propagated.
 *
 * Normative spec: UI_FRAMEWORK_SPEC.md (framework v3).
 *
 * v3.2 (2026-08-18) adds two things, both traced to the five-tool pilot and its
 * independent verdict: the region placement wrapper that stops a sticky region
 * escaping its grid row and stops a scrolling pane clipping its own splitter
 * handle (spec 17.9), and the repeating list field, `type:'list'` (spec 6.4).
 *
 * v3.2.1 (2026-08-18) repairs one thing v3.2 broke: below md the mobile result
 * strip must be the grid item to be able to travel (R3 `mobile-strip-overflow`,
 * spec 17.9). Its wrapper now steps out of the way with `display:contents`
 * below md; above md nothing changes and the wrapper keeps both v3.2 repairs.
 */
(function (global) {
  'use strict';
  if (global.DiagramUI) return;

  var API = 'tools.petrov.re/ui/v1';
  var VERSION = '2026-11-06.v3.7.11-toggle-label-for-box';
  var doc = global.document;

  /* ---------------------------------------------------------------- utilities */

  var mixed = typeof Symbol === 'function' ? Symbol('DiagramUI.mixed') : ' mixed ';

  function isFn(x) { return typeof x === 'function'; }
  function warn() {
    if (!global.console) return;
    try { console.warn.apply(console, ['[diagram-ui]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function guard(fn, label) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { warn((label || 'callback') + ' failed:', e); return undefined; }
    };
  }
  function call(fn, args, label) {
    if (!isFn(fn)) return undefined;
    try { return fn.apply(null, args || []); }
    catch (e) { warn((label || 'callback') + ' failed:', e); return undefined; }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function asLabel(v, fallback) {
    if (isFn(v)) { var r = call(v, [], 'label'); return r == null ? (fallback || '') : r; }
    return v == null ? (fallback || '') : v;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function debounce(fn, ms) {
    var t = null;
    var d = function () {
      var a = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, a); }, ms);
    };
    d.cancel = function () { if (t) { clearTimeout(t); t = null; } };
    return d;
  }
  function pathGet(obj, path) {
    if (!obj || !path) return undefined;
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function pathSet(obj, path, value) {
    if (!obj || !path) return obj;
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }
  function commonFieldValue(objects, field) {
    if (!objects || !objects.length) return undefined;
    var eq = field && isFn(field.equal) ? field.equal : function (a, b) { return a === b; };
    var read = field && isFn(field.get)
      ? function (o) { return field.get(o); }
      : function (o) { return pathGet(o, field.key); };
    var first = read(objects[0]);
    for (var i = 1; i < objects.length; i++) if (!eq(read(objects[i]), first)) return mixed;
    return first;
  }
  function resolveHost(host) {
    if (!host) return null;
    if (typeof host === 'string') return doc ? doc.querySelector(host) : null;
    return host.nodeType === 1 ? host : null;
  }
  function el(tag, attrs, children) {
    var n = doc.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'dataset') { for (var d in v) if (v[d] != null) n.dataset[d] = v[d]; }
      else if (k === 'style' && typeof v === 'object') { for (var s in v) n.style.setProperty(s, v[s]); }
      else if (k.slice(0, 2) === 'on' && isFn(v)) n.addEventListener(k.slice(2), guard(v, k));
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function on(target, type, fn, opts) {
    var h = guard(fn, type);
    target.addEventListener(type, h, opts);
    return function () { target.removeEventListener(type, h, opts); };
  }
  var uidN = 0;
  function uid(p) { uidN += 1; return (p || 'dgu') + '-' + uidN; }
  function store(key, value) {
    try {
      if (arguments.length === 1) return global.localStorage.getItem(key);
      if (value == null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  /* --------------------------------------------- remembered-layout namespace */
  /* Every tool that remembered a layout invented its own global key, and they
     were already colliding in shape: decayheat `sfst.panel` / `sfst.collapsed`,
     nuclideatlas `nuclideatlas_top_ratio` / `nuclideatlas_detail_width`,
     roofstormwater `roof_left_w` / `roof_right_w` / `roof_chart_h`,
     neutron_transport `nsim.w.left` / `nsim.w.right` / `nsim.h.chart`,
     cfd `cfd.leftW` / `cfd.rightW` / `cfd.bottomH` / `cfd.resultLogW`
     (PORT_REPORTS.json, `deleted`, all five tools). The framework now owns one
     namespace so a remembered size can never collide between tools:

         dgu.<toolId>.<facet>.<name>

     `toolId` is the manifest id (the same string the permalink and every export
     signs itself with), `facet` is the framework part that owns the value —
     reserved: `layout` (splitter sizes), `panel` (collapsed flags), `notice`
     (dismissals). Tool code should use its own `facet`, never one of these.
     The existing site-wide singletons (`diagram_theme`, `diagram_lang`,
     `diagram_units`) are deliberately NOT moved: they are cross-tool by design
     and 52 pages already read them. */
  var NS = 'dgu';
  function toolIdOf(app) {
    if (app && app.id) return app.id;
    if (App.current && App.current.id) return App.current.id;
    try {
      if (global.Diagram && isFn(global.Diagram.manifest)) {
        var m = global.Diagram.manifest();
        if (m && m.id) return m.id;
      }
    } catch (e) {}
    try {
      var f = String(global.location.pathname).split('/').pop().replace(/\.html?$/i, '');
      if (f) return f;
    } catch (e) {}
    return 'tool';
  }
  function nsKey(facet, name, app) {
    return NS + '.' + toolIdOf(app) + '.' + String(facet) + '.' + String(name);
  }
  function nsGet(facet, name, app) { return store(nsKey(facet, name, app)); }
  function nsSet(facet, name, value, app) { store(nsKey(facet, name, app), value == null ? null : String(value)); }

  /* ------------------------------------------------------------- token layer */

  var TOKENS = [
    ':root{',
    '--bg:#f6f8fb;--panel:#fff;--panel-2:#f9fafc;',
    '--ink:#12161d;--muted:#5b6675;--line:#e2e7ee;',
    '--accent:#3763e6;--accent-ink:#fff;--weak:rgba(55,99,230,.10);',
    '--ok:#1f6f34;--ok-bg:rgba(31,111,52,.10);',
    '--warn:#9a5a00;--warn-bg:rgba(154,90,0,.10);',
    '--bad:#a5261f;--bad-bg:rgba(165,38,31,.10);',
    '--shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);',
    '--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;',
    '--font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
    '--fs-title:clamp(20px,2.4vw,26px);--fs-section:13px;--fs-body:15px;',
    '--fs-label:13px;--fs-small:12px;--fs-micro:11px;',
    '--sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;--sp-5:24px;--sp-6:32px;--sp-7:48px;',
    '--radius-sm:8px;--radius-md:14px;--radius-pill:999px;',
    '--motion-fast:120ms;--motion:200ms;--ease:cubic-bezier(.2,.6,.2,1);',
    '--bp-sm:480px;--bp-md:768px;--bp-lg:1120px;--bp-xl:1440px;',
    '--z-base:0;--z-sticky:100;--z-dock:200;--z-popover:700;--z-dialog:800;--z-tour:850;',
    '--ctl-h:36px;--tap:44px;',
    '--dgu-safe-bottom:0px;--dgu-safe-bottom-left:0px;--dgu-safe-bottom-right:0px;',
    /* Chart-series ramp. spectrum.html: "The framework is missing a chart-series
       ramp; this is the third tool to want one" — decayheat and moodydiagram had
       already declared namespaced literals of their own, so their series lost
       theme-awareness. The values are decayheat's, the deployed precedent that
       spectrum cites ("following the decayheat precedent for series colours"),
       chosen there "for separability in both themes".
       The framework name is `--dgu-series-N`, NOT `--series-N`: this sheet is
       appended to <head> and therefore lands after a tool's own inline style,
       so publishing `--series-N` here would silently overwrite the ramps that
       decayheat, solargaincalculator, gesloten-atmosfeer, neutron_transport and
       ontvochtiging already ship. `DiagramUI.series()` reads `--series-N` first
       and falls back to this one, so a tool that solved it its own way wins. */
    '--dgu-series-1:#2a78d6;--dgu-series-2:#eb6834;--dgu-series-3:#1baf7a;',
    '--dgu-series-4:#eda100;--dgu-series-5:#e87ba4;--dgu-series-6:#008300;',
    '--dgu-series-7:#4a3aa7;--dgu-series-8:#e34948;',
    '--good:var(--ok);--acc:var(--accent);--accent2:var(--accent);--acc2:var(--accent);',
    '--border:var(--line);--text-muted:var(--muted);--surface-1:var(--panel);--r:var(--radius-md);',
    '}',
    'html[data-theme="dark"]{',
    '--bg:#0d1117;--panel:#161b22;--panel-2:#1b222c;',
    '--ink:#e6edf3;--muted:#9aa7b4;--line:#293240;',
    '--accent:#6f98ff;--accent-ink:#0d1117;--weak:rgba(111,152,255,.12);',
    '--ok:#5fb87a;--ok-bg:rgba(95,184,122,.13);',
    '--warn:#d0a24a;--warn-bg:rgba(208,162,74,.13);',
    '--bad:#e08a83;--bad-bg:rgba(224,138,131,.13);',
    '--shadow:0 1px 2px rgba(0,0,0,.28),0 10px 30px rgba(0,0,0,.36);',
    '--dgu-series-1:#5b8cff;--dgu-series-2:#d95926;--dgu-series-3:#199e70;',
    '--dgu-series-4:#c98500;--dgu-series-5:#d55181;--dgu-series-6:#21a121;',
    '--dgu-series-7:#9085e9;--dgu-series-8:#e66767;',
    '}',
    'html[data-density="compact"]{--ctl-h:30px}',
    '.dgu-app :focus-visible,.dgu-pop :focus-visible,.dgu-dialog :focus-visible{',
    'outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--radius-sm)}',
    '@media(prefers-reduced-motion:reduce){.dgu-app *,.dgu-pop *,.dgu-dialog *{',
    'animation-duration:.001ms!important;transition-duration:.001ms!important}}'
  ].join('');

  /* Until diagram-common.js and site-disclaimer.js read [data-theme], keep the
     shared chrome in step with the tool rather than with the operating system.
     Spec v3 section 14.3; UI_AUDIT.md S-4. */
  var CHROME_COMPAT = [
    /* v3.2 P9a — the shared bar is a transparent flex box, 560x67 px on a
       1440 px screen, whose two rows of pills leave most of that box empty.
       With pointer-events:auto on the container, every one of those empty
       pixels swallows a click meant for the tool underneath: measured on
       normenwijzer, a `.dgu-q` help button sitting under the bar's empty second
       row could not be hit at all (elementFromPoint returned DIV#dgc-bar).
       The container reserves no space and paints nothing, so it must not take
       pointer input either; its children still do. */
    '#dgc-bar{pointer-events:none}#dgc-bar>*{pointer-events:auto}',
    'html[data-theme="dark"] #dgc-bar button,html[data-theme="dark"] #dgc-bar a.dgc-home{',
    'background:#161b22;color:#e6edf3;border-color:#293240}',
    'html[data-theme="dark"] #dgc-menu,html[data-theme="dark"] #dgc-notes{',
    'background:#161b22;color:#e6edf3;border-color:#293240}',
    'html[data-theme="light"] #dgc-bar button{background:#fff;color:#1d2733;border-color:#c9d2dd}',
    'html[data-theme="light"] #dgc-menu,html[data-theme="light"] #dgc-notes{background:#fff;color:#16202c}'
  ].join('');

  var stylesInstalled = {};
  function ensureStyle(id, css) {
    if (!doc || stylesInstalled[id]) return;
    if (doc.getElementById(id)) { stylesInstalled[id] = true; return; }
    var s = doc.createElement('style');
    s.id = id;
    s.textContent = css;
    (doc.head || doc.documentElement).appendChild(s);
    stylesInstalled[id] = true;
  }

  /* ------------------------------------------------------------------- theme */

  var themeListeners = [];
  var mql = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function themePref() {
    var v = store('diagram_theme');
    return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'auto';
  }
  function themeResolved() {
    var p = themePref();
    if (p !== 'auto') return p;
    return mql && mql.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    if (!doc) return;
    var r = themeResolved();
    if (doc.documentElement.getAttribute('data-theme') !== r) {
      doc.documentElement.setAttribute('data-theme', r);
    }
    doc.documentElement.setAttribute('data-theme-pref', themePref());
    var meta = doc.querySelector('meta[name="color-scheme"]');
    if (!meta && doc.head) {
      meta = doc.createElement('meta');
      meta.name = 'color-scheme';
      doc.head.appendChild(meta);
    }
    if (meta) meta.content = r === 'dark' ? 'dark light' : 'light dark';
    seriesCache = null;            /* the chart-series ramp is theme-dependent */
    themeListeners.forEach(function (f) { call(f, [r, themePref()], 'theme listener'); });
    try {
      doc.dispatchEvent(new CustomEvent('diagram-ui:theme', { detail: { theme: r, pref: themePref() } }));
    } catch (e) {}
  }
  var theme = {
    get: themeResolved,
    pref: themePref,
    set: function (v) {
      store('diagram_theme', (v === 'light' || v === 'dark') ? v : null);
      applyTheme();
      return themeResolved();
    },
    cycle: function () {
      var order = ['auto', 'light', 'dark'];
      var next = order[(order.indexOf(themePref()) + 1) % order.length];
      store('diagram_theme', next === 'auto' ? null : next);
      applyTheme();
      return themePref();
    },
    watch: function (fn) {
      themeListeners.push(fn);
      return function () {
        var i = themeListeners.indexOf(fn);
        if (i >= 0) themeListeners.splice(i, 1);
      };
    }
  };

  /* --------------------------------------------------- shared-chrome safe area
   * UI_AUDIT.md S-1: #dgc-bar and #eng-disc-badge are fixed to the bottom
   * corners and reserve no space, so on every tool they sit on top of live
   * controls. Measure the real furniture and publish it; the document and the
   * shell then keep clear. This runs on every page that loads this file,
   * whether or not it ever calls app().
   */

  var safeState = { bottom: 0, left: 0, right: 0, target: null, ro: null, mo: null, dock: null, flow: false };

  /* Flow docking. Below md the shared bar and badge together cover the whole
     bottom band of a 390px viewport (measured: 67px + 31px), so no amount of
     padding keeps a mid-scroll control clear of them. There the framework takes
     them out of fixed positioning and puts them in the document flow at the end
     of the shell, where they cannot overlap anything. Above md they stay docked
     and the safe area keeps the document clear. Removed once v2 owns this. */
  var CHROME_FLOW_CSS = [
    'html[data-dgu-chrome="flow"] #dgc-bar,html[data-dgu-chrome="flow"] #eng-disc-badge{',
    'position:static!important;left:auto!important;right:auto!important;bottom:auto!important;',
    'max-width:100%!important;box-shadow:none!important}',
    '.dgu-chromedock{display:flex;flex-wrap:wrap;gap:8px;align-items:center;',
    'padding:var(--sp-3) var(--sp-4) var(--sp-5);border-top:1px solid var(--line)}'
  ].join('');

  function chromeNodes() {
    return [doc.getElementById('dgc-bar'), doc.getElementById('eng-disc-badge')].filter(Boolean);
  }

  function setChromeFlow(flow) {
    if (!doc || !doc.body || safeState.flow === flow) return;
    safeState.flow = flow;
    ensureStyle('dgu-chrome-flow', CHROME_FLOW_CSS);
    if (flow) {
      if (!safeState.dock) return;               /* no shell to dock into */
      doc.documentElement.setAttribute('data-dgu-chrome', 'flow');
      chromeNodes().forEach(function (n) { safeState.dock.appendChild(n); });
      safeState.dock.hidden = false;
    } else {
      doc.documentElement.removeAttribute('data-dgu-chrome');
      chromeNodes().forEach(function (n) { doc.body.appendChild(n); });
      if (safeState.dock) safeState.dock.hidden = true;
    }
    measureChrome();
  }

  function visibleBox(node) {
    if (!node) return null;
    var cs = global.getComputedStyle(node);
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return null;
    var r = node.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? r : null;
  }

  function measureChrome() {
    if (!doc || !doc.body) return;
    if (safeState.dock) {
      var wantFlow = global.innerWidth < 768;
      if (wantFlow !== safeState.flow) { setChromeFlow(wantFlow); return; }
    }
    if (safeState.flow) {
      var st0 = doc.documentElement.style;
      st0.setProperty('--dgu-safe-bottom', '0px');
      st0.setProperty('--dgu-safe-bottom-left', '0px');
      st0.setProperty('--dgu-safe-bottom-right', '0px');
      safeState.bottom = safeState.left = safeState.right = 0;
      var tgt0 = safeState.target || doc.body;
      if (tgt0 && tgt0.nodeType === 1) tgt0.style.removeProperty('padding-bottom');
      return;
    }
    var rb = visibleBox(doc.getElementById('dgc-bar'));
    var rg = visibleBox(doc.getElementById('eng-disc-badge'));
    var bh = rb ? rb.height : 0, bw = rb ? rb.width : 0;
    var gh = rg ? rg.height : 0, gw = rg ? rg.width : 0;
    var bottom = Math.round(Math.max(bh, gh));
    if (bottom > 0) {
      bottom += 12;
      /* below 640px diagram-common.js lifts the bar above the badge row */
      if (bh && gh && global.innerWidth <= 640) bottom += Math.round(gh) + 12;
    }
    var st = doc.documentElement.style;
    st.setProperty('--dgu-safe-bottom', bottom + 'px');
    st.setProperty('--dgu-safe-bottom-left', (bw ? Math.round(bw) + 20 : 0) + 'px');
    st.setProperty('--dgu-safe-bottom-right', (gw ? Math.round(gw) + 20 : 0) + 'px');
    safeState.bottom = bottom;
    safeState.left = bw ? Math.round(bw) + 20 : 0;
    safeState.right = gw ? Math.round(gw) + 20 : 0;
    var target = safeState.target || doc.body;
    if (target && target.nodeType === 1) {
      target.style.setProperty('padding-bottom',
        'calc(var(--dgu-safe-bottom) + env(safe-area-inset-bottom, 0px))');
    }
  }

  var measureSoon = debounce(measureChrome, 60);

  function documentScrolls() {
    try {
      var he = global.getComputedStyle(doc.documentElement).overflowY;
      var be = global.getComputedStyle(doc.body).overflowY;
      if (he === 'hidden' || be === 'hidden') return false;
      return doc.body.scrollHeight > global.innerHeight + 40;
    } catch (e) { return false; }
  }

  /* Level 0 adoption: a tool with no shell still gets the flow dock below md,
     but only when the document really scrolls. An app-shell tool with
     overflow:hidden would lose its chrome off the bottom of a page that cannot
     scroll, so there the framework leaves the chrome alone and DiagramUI.check()
     reports the overlap instead. The full repair is level 2. */
  function ensureL0Dock() {
    if (safeState.dock) return;
    if (!documentScrolls()) return;
    var d = el('div', { class: 'dgu-chromedock', hidden: true });
    doc.body.appendChild(d);
    safeState.dock = d;
  }

  function startSafeArea() {
    if (!doc || !doc.body) return;
    ensureStyle('dgu-chrome-flow', CHROME_FLOW_CSS);
    setTimeout(ensureL0Dock, 300);
    setTimeout(function () { ensureL0Dock(); measureChrome(); }, 1200);
    measureChrome();
    if (global.ResizeObserver) {
      safeState.ro = new global.ResizeObserver(measureSoon);
      ['dgc-bar', 'eng-disc-badge'].forEach(function (id) {
        var n = doc.getElementById(id);
        if (n) { try { safeState.ro.observe(n); } catch (e) {} }
      });
    }
    if (global.MutationObserver) {
      safeState.mo = new global.MutationObserver(function (recs) {
        var relevant = false;
        for (var i = 0; i < recs.length; i++) {
          var added = recs[i].addedNodes || [];
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.id === 'dgc-bar' || n.id === 'eng-disc-badge') {
              if (safeState.ro) { try { safeState.ro.observe(n); } catch (e) {} }
              relevant = true;
            }
          }
          if (recs[i].target && recs[i].target.id === 'dgc-bar') relevant = true;
        }
        if (relevant || recs.length) measureSoon();
      });
      safeState.mo.observe(doc.body, { childList: true });
      var bar = doc.getElementById('dgc-bar');
      if (bar) safeState.mo.observe(bar, { childList: true, subtree: true, characterData: true });
      var lo = new global.MutationObserver(measureSoon);
      lo.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });
    }
    on(global, 'resize', measureSoon);
    on(global, 'orientationchange', measureSoon);
    setTimeout(measureChrome, 400);
    setTimeout(measureChrome, 1600);
  }

  /* ------------------------------------------------------------------- i18n */

  var SITE_LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
  var LANG_NATIVE = {
    en: 'English', uk: 'Українська', de: 'Deutsch',
    nl: 'Nederlands', fr: 'Français', es: 'Español', pl: 'Polski'
  };
  /* Framework strings. A tool's dictionary is consulted first. */
  var UI_STRINGS = {
    learn:      { en: 'Learn', uk: 'Пояснення', de: 'Erklären', nl: 'Uitleg', fr: 'Comprendre', es: 'Explicar' ,pl:"Nauka"},
    learn_on:   { en: 'Learn mode is on', uk: 'Режим пояснень увімкнено', de: 'Erklärmodus aktiv', nl: 'Uitlegmodus aan', fr: 'Mode explication actif', es: 'Modo explicación activo' ,pl:"Tryb nauki włączony"},
    language:   { en: 'Language', uk: 'Мова', de: 'Sprache', nl: 'Taal', fr: 'Langue', es: 'Idioma' ,pl:"Język"},
    theme:      { en: 'Theme', uk: 'Тема', de: 'Design', nl: 'Thema', fr: 'Thème', es: 'Tema' ,pl:"Motyw"},
    theme_auto: { en: 'Theme: system', uk: 'Тема: системна', de: 'Design: System', nl: 'Thema: systeem', fr: 'Thème : système', es: 'Tema: sistema' ,pl:"Motyw: systemowy"},
    theme_light:{ en: 'Theme: light', uk: 'Тема: світла', de: 'Design: hell', nl: 'Thema: licht', fr: 'Thème : clair', es: 'Tema: claro' ,pl:"Motyw: jasny"},
    theme_dark: { en: 'Theme: dark', uk: 'Тема: темна', de: 'Design: dunkel', nl: 'Thema: donker', fr: 'Thème : sombre', es: 'Tema: oscuro' ,pl:"Motyw: ciemny"},
    units:      { en: 'Units', uk: 'Одиниці', de: 'Einheiten', nl: 'Eenheden', fr: 'Unités', es: 'Unidades' ,pl:"Jednostki"},
    examples:   { en: 'Examples', uk: 'Приклади', de: 'Beispiele', nl: 'Voorbeelden', fr: 'Exemples', es: 'Ejemplos' ,pl:"Przykłady"},
    reset:      { en: 'Reset', uk: 'Скинути', de: 'Zurücksetzen', nl: 'Herstellen', fr: 'Réinitialiser', es: 'Restablecer' ,pl:"Resetuj"},
    run:        { en: 'Calculate', uk: 'Обчислити', de: 'Berechnen', nl: 'Berekenen', fr: 'Calculer', es: 'Calcular' ,pl:"Oblicz"},
    recompute:  { en: 'Recompute', uk: 'Перерахувати', de: 'Neu berechnen', nl: 'Herberekenen', fr: 'Recalculer', es: 'Recalcular' ,pl:"Przelicz"},
    live:       { en: 'Live', uk: 'Наживо', de: 'Live', nl: 'Live', fr: 'En direct', es: 'En vivo' ,pl:"Na żywo"},
    computing:  { en: 'Computing…', uk: 'Обчислення…', de: 'Berechnung…', nl: 'Berekenen…', fr: 'Calcul…', es: 'Calculando…' ,pl:"Obliczanie…"},
    stale:      { en: 'Inputs changed since this result', uk: 'Дані змінилися після розрахунку', de: 'Eingaben seit diesem Ergebnis geändert', nl: 'Invoer gewijzigd na dit resultaat', fr: 'Les entrées ont changé depuis ce résultat', es: 'Las entradas cambiaron tras este resultado' ,pl:"Dane wejściowe uległy zmianie od czasu uzyskania tego wyniku"},
    pending_run:{ en: 'Set the inputs, then press Calculate.', uk: 'Задайте вхідні дані та натисніть «Обчислити».', de: 'Eingaben setzen, dann Berechnen drücken.', nl: 'Vul de invoer in en druk op Berekenen.', fr: 'Renseignez les entrées, puis appuyez sur Calculer.', es: 'Introduzca los datos y pulse Calcular.' ,pl:"Ustaw dane wejściowe i naciśnij Oblicz."},
    pending_live:{ en: 'Adjust an input to see the result.', uk: 'Змініть будь-який параметр, щоб побачити результат.', de: 'Eine Eingabe ändern, um das Ergebnis zu sehen.', nl: 'Wijzig een invoer om het resultaat te zien.', fr: 'Modifiez une entrée pour voir le résultat.', es: 'Cambie un dato para ver el resultado.' ,pl:"Zmień dane wejściowe, aby zobaczyć wynik."},
    no_result:  { en: 'Not computed yet', uk: 'Ще не обчислено', de: 'Noch nicht berechnet', nl: 'Nog niet berekend', fr: 'Pas encore calculé', es: 'Aún sin calcular' ,pl:"Jeszcze nie obliczono"},
    /* v3.4 §19 — the reference archetype's answer surface. A lookup's answer
       is the selected entry and the state of the filtering, so it needs its
       own pending line, its own no-match line and its own panel heading:
       "Adjust an input to see the result" is not what a catalogue does. */
    selection:  { en: 'Selection', uk: 'Вибране', de: 'Auswahl', nl: 'Selectie', fr: 'Sélection', es: 'Selección' ,pl:"Wybór"},
    pending_lookup:{ en: 'Choose an entry to see it here.', uk: 'Оберіть запис, щоб побачити його тут.', de: 'Einen Eintrag wählen, um ihn hier zu sehen.', nl: 'Kies een item om het hier te zien.', fr: 'Choisissez une fiche pour la voir ici.', es: 'Elija una ficha para verla aquí.' ,pl:"Wybierz wpis, aby go tutaj zobaczyć."},
    no_match:   { en: 'Nothing matches these filters.', uk: 'Нічого не відповідає цим фільтрам.', de: 'Nichts entspricht diesen Filtern.', nl: 'Niets voldoet aan deze filters.', fr: 'Rien ne correspond à ces filtres.', es: 'Nada coincide con estos filtros.' ,pl:"Nic nie pasuje do tych filtrów."},
    showing:    { en: 'Showing', uk: 'Показано', de: 'Angezeigt', nl: 'Getoond', fr: 'Affichés', es: 'Mostrados' ,pl:"Wyświetlanie"},
    clear_filters:{ en: 'Clear filters', uk: 'Очистити фільтри', de: 'Filter zurücksetzen', nl: 'Filters wissen', fr: 'Effacer les filtres', es: 'Borrar filtros' ,pl:"Wyczyść filtry"},
    remove_filter:{ en: 'Remove this filter', uk: 'Прибрати цей фільтр', de: 'Diesen Filter entfernen', nl: 'Dit filter verwijderen', fr: 'Retirer ce filtre', es: 'Quitar este filtro' ,pl:"Usuń ten filtr"},
    failed:     { en: 'This tool could not load its data.', uk: 'Інструмент не зміг завантажити свої дані.', de: 'Dieses Werkzeug konnte seine Daten nicht laden.', nl: 'Deze tool kon zijn gegevens niet laden.', fr: 'Cet outil n’a pas pu charger ses données.', es: 'Esta herramienta no pudo cargar sus datos.' ,pl:"To narzędzie nie mogło załadować danych."},
    close:      { en: 'Close', uk: 'Закрити', de: 'Schließen', nl: 'Sluiten', fr: 'Fermer', es: 'Cerrar' ,pl:"Zamknij"},
    back:       { en: 'Back', uk: 'Назад', de: 'Zurück', nl: 'Terug', fr: 'Retour', es: 'Atrás' ,pl:"Wstecz"},
    next:       { en: 'Next', uk: 'Далі', de: 'Weiter', nl: 'Volgende', fr: 'Suivant', es: 'Siguiente' ,pl:"Dalej"},
    skip:       { en: 'Skip', uk: 'Пропустити', de: 'Überspringen', nl: 'Overslaan', fr: 'Passer', es: 'Omitir' ,pl:"Pomiń"},
    done:       { en: 'Done', uk: 'Готово', de: 'Fertig', nl: 'Klaar', fr: 'Terminé', es: 'Listo' ,pl:"Gotowe"},
    tour:       { en: 'Take the tour', uk: 'Пройти тур', de: 'Rundgang starten', nl: 'Rondleiding', fr: 'Visite guidée', es: 'Recorrido' ,pl:"Uruchom przewodnik"},
    step:       { en: 'Step', uk: 'Крок', de: 'Schritt', nl: 'Stap', fr: 'Étape', es: 'Paso' ,pl:"Krok"},
    of:         { en: 'of', uk: 'з', de: 'von', nl: 'van', fr: 'sur', es: 'de' ,pl:"z"},
    shortcuts:  { en: 'Keyboard shortcuts', uk: 'Гарячі клавіші', de: 'Tastenkürzel', nl: 'Sneltoetsen', fr: 'Raccourcis clavier', es: 'Atajos de teclado' ,pl:"Skróty klawiaturowe"},
    undo:       { en: 'Undo', uk: 'Скасувати', de: 'Rückgängig', nl: 'Ongedaan maken', fr: 'Annuler', es: 'Deshacer' ,pl:"Cofnij"},
    redo:       { en: 'Redo', uk: 'Повторити', de: 'Wiederholen', nl: 'Opnieuw', fr: 'Rétablir', es: 'Rehacer' ,pl:"Ponów"},
    fit:        { en: 'Fit', uk: 'Вмістити', de: 'Einpassen', nl: 'Passend', fr: 'Ajuster', es: 'Ajustar' ,pl:"Dopasuj"},
    required:   { en: 'required', uk: 'обовʼязково', de: 'erforderlich', nl: 'verplicht', fr: 'requis', es: 'obligatorio' ,pl:"wymagany"},
    mixed:      { en: 'mixed', uk: 'різні', de: 'gemischt', nl: 'gemengd', fr: 'multiple', es: 'variado' ,pl:"różne"},
    invalid:    { en: 'Value is not valid', uk: 'Некоректне значення', de: 'Ungültiger Wert', nl: 'Ongeldige waarde', fr: 'Valeur non valide', es: 'Valor no válido' ,pl:"Wartość jest nieprawidłowa"},
    clamped:    { en: 'Value was limited to the allowed range', uk: 'Значення обмежено допустимим діапазоном', de: 'Wert auf den zulässigen Bereich begrenzt', nl: 'Waarde beperkt tot het toegestane bereik', fr: 'Valeur ramenée à la plage autorisée', es: 'Valor limitado al rango permitido' ,pl:"Wartość została ograniczona do dozwolonego zakresu"},
    results:    { en: 'Results', uk: 'Результати', de: 'Ergebnisse', nl: 'Resultaten', fr: 'Résultats', es: 'Resultados' ,pl:"Wyniki"},
    inputs:     { en: 'Inputs', uk: 'Вхідні дані', de: 'Eingaben', nl: 'Invoer', fr: 'Entrées', es: 'Datos' ,pl:"Wejścia"},
    menu:       { en: 'Menu', uk: 'Меню', de: 'Menü', nl: 'Menu', fr: 'Menu', es: 'Menú', pl: 'Menu' },
    tools:      { en: 'Tools', uk: 'Інструменти', de: 'Werkzeuge', nl: 'Hulpmiddelen', fr: 'Outils', es: 'Herramientas', pl: 'Narzędzia' },

    /* ---- v3.5 §21 one path to paper ---- */
    print:      { en: 'Print', uk: 'Друк', de: 'Drucken', nl: 'Afdrukken', fr: 'Imprimer', es: 'Imprimir' ,pl:"Drukuj"},
    print_report:{ en: 'Print the calculation record',
                  uk: 'Надрукувати протокол розрахунку',
                  de: 'Berechnungsprotokoll drucken',
                  nl: 'Berekeningsrapport afdrukken',
                  fr: 'Imprimer le relevé de calcul',
                  es: 'Imprimir el registro de cálculo',
                  pl: 'Drukuj rekord obliczeń' },
    /* the running header of the FALLBACK sheet says what that sheet is, so it
       can never be mistaken for the record: the record's own head reads
       "Calculation record · <tool>" and is paginated. */
    /* printed where a URL would go when the document has no address a reader
       could use — a file:// copy, a blob:, a sandboxed frame */
    site_local:{ en: 'local copy', uk: 'локальна копія', de: 'lokale Kopie',
                  nl: 'lokale kopie', fr: 'copie locale', es: 'copia local', pl: 'kopia lokalna' },
    print_screen:{ en: 'Screen printout', uk: 'Роздруківка екрана', de: 'Bildschirmausdruck',
                  nl: 'Schermafdruk', fr: 'Impression de l’écran', es: 'Impresión de pantalla', pl: 'Wydruk ekranu' },
    print_use_report:{
      en: 'This is the tool’s screen as the browser prints it. The paginated calculation record, with page numbers, is the Report entry on the toolbar.',
      uk: 'Це екран інструмента в тому вигляді, як його друкує браузер. Посторінковий протокол розрахунку з нумерацією сторінок — це пункт «Звіт» на панелі.',
      de: 'Dies ist der Bildschirm des Werkzeugs, wie ihn der Browser druckt. Das seitenweise Berechnungsprotokoll mit Seitenzahlen ist der Eintrag „Bericht“ in der Leiste.',
      nl: 'Dit is het scherm van de tool zoals de browser het afdrukt. Het gepagineerde berekeningsrapport met paginanummers is de knop “Rapport” op de balk.',
      fr: 'Ceci est l’écran de l’outil tel que le navigateur l’imprime. Le relevé de calcul paginé, avec numéros de page, est l’entrée « Rapport » de la barre.',
      es: 'Esta es la pantalla de la herramienta tal como la imprime el navegador. El registro de cálculo paginado, con números de página, es la entrada «Informe» de la barra.',
      pl: 'To jest ekran narzędzia w postaci drukowanej przez przeglądarkę. Stronicowany rekord obliczeń z numerami stron jest dostępny jako pozycja „Raport” na pasku narzędzi.' },
    /* kept byte-for-byte in step with diagram-common.js `rPage`, because the
       fallback sheet and the report must number their pages with one phrase */
    page_n_of_m:{ en: 'page %n of %m', uk: 'сторінка %n з %m', de: 'Seite %n von %m',
                  nl: 'pagina %n van %m', fr: 'page %n sur %m', es: 'página %n de %m', pl: 'strona %n z %m' },
    /* Used ONLY by the footer's last-resort attribution, on a page that has no
       diagram-common.js to ask — the site shell pages that call printStyles()
       for the sheet alone (benchmark, disclaimer, validation, smr-changes).
       Copied verbatim from diagram-common.js `rSource` so the two documents
       cannot drift apart in any of the seven site languages. */
    print_source:{ en: 'Source', uk: 'Джерело', de: 'Quelle',
                  nl: 'Bron', fr: 'Source', es: 'Fuente', pl: 'Źródło' },

    /* ---- v3.3 §18 the scene primitive: ONE keyboard scheme, site-wide ---- */
    scene_none: { en: 'Nothing selected', uk: 'Нічого не вибрано', de: 'Nichts ausgewählt', nl: 'Niets geselecteerd', fr: 'Rien de sélectionné', es: 'Nada seleccionado' ,pl:"Nic nie wybrano"},
    scene_sel:  { en: 'Selection', uk: 'Вибране', de: 'Auswahl', nl: 'Selectie', fr: 'Sélection', es: 'Selección' ,pl:"Wybór"},
    scene_help: { en: 'Drawing. Enter or Space selects the next object, the arrow keys move it by one step (Shift: four), Delete removes it, Escape clears the selection.',
                  uk: 'Креслення. Enter або пробіл вибирає наступний об’єкт, стрілки зсувають його на крок (Shift — на чотири), Delete видаляє, Escape знімає вибір.',
                  de: 'Zeichnung. Enter oder Leertaste wählt das nächste Objekt, die Pfeiltasten verschieben es um einen Schritt (Umschalt: vier), Entf löscht es, Esc hebt die Auswahl auf.',
                  nl: 'Tekening. Enter of spatie selecteert het volgende object, de pijltoetsen verplaatsen het één stap (Shift: vier), Delete verwijdert het, Escape heft de selectie op.',
                  fr: 'Dessin. Entrée ou Espace sélectionne l’objet suivant, les flèches le déplacent d’un pas (Maj : quatre), Suppr le supprime, Échap annule la sélection.',
                  es: 'Dibujo. Entrar o Espacio selecciona el objeto siguiente, las flechas lo mueven un paso (Mayús: cuatro), Supr lo elimina, Escape anula la selección.',
                  pl: 'Rysunek. Enter lub Spacja wybiera następny obiekt, klawisze strzałek przesuwają go o jeden krok (Shift: cztery), Delete usuwa go, Escape czyści zaznaczenie.' },
    scene_lib:  { en: 'The 3D scene editor could not start: diagram-scene3d.js is not loaded on this page.',
                  uk: 'Редактор 3D-сцени не запустився: diagram-scene3d.js не завантажено на цій сторінці.',
                  de: 'Der 3D-Szeneneditor konnte nicht starten: diagram-scene3d.js ist auf dieser Seite nicht geladen.',
                  nl: 'De 3D-scene-editor kon niet starten: diagram-scene3d.js is op deze pagina niet geladen.',
                  fr: 'L’éditeur de scène 3D n’a pas pu démarrer : diagram-scene3d.js n’est pas chargé sur cette page.',
                  es: 'El editor de escena 3D no pudo iniciarse: diagram-scene3d.js no está cargado en esta página.',
                  pl: 'Edytor sceny 3D nie mógł się uruchomić: diagram-scene3d.js nie jest załadowany na tej stronie.' },

    /* ---- §5 collapsible panels and the §4.4 layout furniture below ---- */
    expand:     { en: 'Expand', uk: 'Розгорнути', de: 'Ausklappen', nl: 'Uitklappen', fr: 'Déplier', es: 'Desplegar' ,pl:"Rozwiń"},
    collapse:   { en: 'Collapse', uk: 'Згорнути', de: 'Einklappen', nl: 'Inklappen', fr: 'Replier', es: 'Plegar' ,pl:"Zwiń"},
    more:       { en: 'Show more', uk: 'Показати більше', de: 'Mehr anzeigen', nl: 'Meer tonen', fr: 'Afficher plus', es: 'Mostrar más' ,pl:"Pokaż więcej"},
    less:       { en: 'Show less', uk: 'Показати менше', de: 'Weniger anzeigen', nl: 'Minder tonen', fr: 'Afficher moins', es: 'Mostrar menos' ,pl:"Pokaż mniej"},
    dismiss:    { en: 'Dismiss', uk: 'Приховати', de: 'Ausblenden', nl: 'Verbergen', fr: 'Masquer', es: 'Ocultar' ,pl:"Zamknij"},
    resize:     { en: 'Resize', uk: 'Змінити розмір', de: 'Größe ändern', nl: 'Formaat wijzigen', fr: 'Redimensionner', es: 'Redimensionar' ,pl:"Zmień rozmiar"},
    resize_help:{ en: 'Drag to resize. Arrow keys adjust, Home resets, double-click resets.',
                  uk: 'Тягніть, щоб змінити розмір. Стрілки — крок, Home — скинути, подвійний клік — скинути.',
                  de: 'Zum Ändern ziehen. Pfeiltasten verstellen, Pos1 setzt zurück, Doppelklick setzt zurück.',
                  nl: 'Sleep om te wijzigen. Pijltoetsen verstellen, Home herstelt, dubbelklik herstelt.',
                  fr: 'Faites glisser pour redimensionner. Les flèches ajustent, Home réinitialise, double-clic réinitialise.',
                  es: 'Arrastre para redimensionar. Las flechas ajustan, Inicio restablece, doble clic restablece.',
                  pl: 'Przeciągnij, aby zmienić rozmiar. Klawisze strzałek regulują rozmiar, Home resetuje, podwójne kliknięcie resetuje.' },
    run_verbs:  { en: 'calculate|compute|run|solve|simulate', uk: 'розрахувати|обчислити|запустити|порахувати',
                  de: 'berechnen|rechnen|starten|ausf\u00fchren', nl: 'berekenen|uitvoeren|starten',
                  fr: 'calculer|lancer|ex\u00e9cuter', es: 'calcular|ejecutar|iniciar',
                  pl: 'oblicz|przelicz|uruchom|rozwiąż|symuluj' },
    region_inputs:{ en: 'Inputs', uk: 'Вхідні дані', de: 'Eingaben', nl: 'Invoer', fr: 'Entrées', es: 'Entradas' ,pl:"Wejścia"},
    region_detail:{ en: 'Detail', uk: 'Деталі', de: 'Details', nl: 'Details', fr: 'Détails', es: 'Detalles' ,pl:"Szczegóły"},
    region_results:{ en: 'Results', uk: 'Результати', de: 'Ergebnisse', nl: 'Resultaten', fr: 'Résultats', es: 'Resultados' ,pl:"Wyniki"},
    region_nav:  { en: 'Filters', uk: 'Фільтри', de: 'Filter', nl: 'Filters', fr: 'Filtres', es: 'Filtros' ,pl:"Filtry"},
    fold:       { en: 'Collapse panel', uk: 'Згорнути панель', de: 'Bereich einklappen',
                  nl: 'Paneel inklappen', fr: 'Replier le panneau', es: 'Contraer el panel', pl: 'Zwiń panel' },
    unfold:     { en: 'Expand panel', uk: 'Розгорнути панель', de: 'Bereich ausklappen',
                  nl: 'Paneel uitklappen', fr: 'Déplier le panneau', es: 'Expandir el panel', pl: 'Rozwiń panel' },
    fold_help:  { en: 'Collapse this panel out of the way. Click again to bring it back.',
                  uk: 'Згорнути цю панель. Клацніть ще раз, щоб повернути.',
                  de: 'Diesen Bereich einklappen. Erneut klicken, um ihn zurückzuholen.',
                  nl: 'Klap dit paneel weg. Klik nogmaals om het terug te halen.',
                  fr: 'Replier ce panneau. Cliquez de nouveau pour le ramener.',
                  es: 'Contraer este panel. Haga clic de nuevo para recuperarlo.',
                  pl: 'Zwiń ten panel, aby go schować. Kliknij ponownie, aby go przywrócić.' },
    width:      { en: 'Width', uk: 'Ширина', de: 'Breite', nl: 'Breedte', fr: 'Largeur', es: 'Anchura' ,pl:"Szerokość"},
    height:     { en: 'Height', uk: 'Висота', de: 'Höhe', nl: 'Hoogte', fr: 'Hauteur', es: 'Altura' ,pl:"Wysokość"},
    notice:     { en: 'Notice', uk: 'Зауваження', de: 'Hinweis', nl: 'Let op', fr: 'Avertissement', es: 'Aviso' ,pl:"Informacja"},

    /* ---- §6.4 the repeating list field ---- */
    add_row:    { en: 'Add row', uk: 'Додати рядок', de: 'Zeile hinzufügen', nl: 'Rij toevoegen', fr: 'Ajouter une ligne', es: 'Añadir fila' ,pl:"Dodaj wiersz"},
    remove_row: { en: 'Remove row', uk: 'Вилучити рядок', de: 'Zeile entfernen', nl: 'Rij verwijderen', fr: 'Supprimer la ligne', es: 'Eliminar fila' ,pl:"Usuń wiersz"},
    move_up:    { en: 'Move up', uk: 'Вгору', de: 'Nach oben', nl: 'Omhoog', fr: 'Monter', es: 'Subir' ,pl:"Przenieś w górę"},
    move_down:  { en: 'Move down', uk: 'Вниз', de: 'Nach unten', nl: 'Omlaag', fr: 'Descendre', es: 'Bajar' ,pl:"Przenieś w dół"},
    row:        { en: 'Row', uk: 'Рядок', de: 'Zeile', nl: 'Rij', fr: 'Ligne', es: 'Fila' ,pl:"Wiersz"},
    list_empty: { en: 'No rows yet — add one.', uk: 'Рядків ще немає — додайте один.', de: 'Noch keine Zeilen — fügen Sie eine hinzu.', nl: 'Nog geen rijen — voeg er een toe.', fr: 'Aucune ligne — ajoutez-en une.', es: 'Aún no hay filas: añada una.' ,pl:"Nie ma jeszcze wierszy — dodaj jeden."},
    list_full:  { en: 'The list is full', uk: 'Список заповнено', de: 'Die Liste ist voll', nl: 'De lijst is vol', fr: 'La liste est pleine', es: 'La lista está llena' ,pl:"Lista jest pełna"},
    row_added:  { en: 'Row added', uk: 'Рядок додано', de: 'Zeile hinzugefügt', nl: 'Rij toegevoegd', fr: 'Ligne ajoutée', es: 'Fila añadida' ,pl:"Dodano wiersz"},
    row_removed:{ en: 'Row removed', uk: 'Рядок вилучено', de: 'Zeile entfernt', nl: 'Rij verwijderd', fr: 'Ligne supprimée', es: 'Fila eliminada' ,pl:"Usunięto wiersz"},
    row_moved:  { en: 'Row moved', uk: 'Рядок переміщено', de: 'Zeile verschoben', nl: 'Rij verplaatst', fr: 'Ligne déplacée', es: 'Fila movida' ,pl:"Przeniesiono wiersz"},

    /* ---- content components: tables, meters, transport, import, examples ---- */
    reason:     { en: 'Reason', uk: 'Причина', de: 'Grund', nl: 'Reden', fr: 'Motif', es: 'Motivo' ,pl:"Powód"},
    table_wide: { en: 'This table is wider than the screen — scroll it sideways.',
                  uk: 'Таблиця ширша за екран — гортайте вбік.',
                  de: 'Diese Tabelle ist breiter als der Bildschirm — seitwärts scrollen.',
                  nl: 'Deze tabel is breder dan het scherm — scroll zijwaarts.',
                  fr: 'Ce tableau est plus large que l’écran — faites défiler latéralement.',
                  es: 'Esta tabla es más ancha que la pantalla — desplácela lateralmente.',
                  pl: 'Ta tabela jest szersza niż ekran — przewiń ją poziomo.' },
    of_limit:   { en: 'of the limit', uk: 'від межі', de: 'des Grenzwerts', nl: 'van de limiet', fr: 'de la limite', es: 'del límite' ,pl:"limitu"},
    play:       { en: 'Play', uk: 'Пуск', de: 'Abspielen', nl: 'Afspelen', fr: 'Lecture', es: 'Reproducir' ,pl:"Odtwórz"},
    pause:      { en: 'Pause', uk: 'Пауза', de: 'Pause', nl: 'Pauze', fr: 'Pause', es: 'Pausa' ,pl:"Pauza"},
    speed:      { en: 'Speed', uk: 'Швидкість', de: 'Tempo', nl: 'Snelheid', fr: 'Vitesse', es: 'Velocidad' ,pl:"Prędkość"},
    frame:      { en: 'Frame', uk: 'Кадр', de: 'Bild', nl: 'Frame', fr: 'Image', es: 'Fotograma' ,pl:"Klatka"},
    prev_frame: { en: 'Previous frame', uk: 'Попередній кадр', de: 'Vorheriges Bild', nl: 'Vorig frame', fr: 'Image précédente', es: 'Fotograma anterior' ,pl:"Poprzednia klatka"},
    next_frame: { en: 'Next frame', uk: 'Наступний кадр', de: 'Nächstes Bild', nl: 'Volgend frame', fr: 'Image suivante', es: 'Fotograma siguiente' ,pl:"Następna klatka"},
    no_frames:  { en: 'Nothing to play yet', uk: 'Ще нема чого відтворювати', de: 'Noch nichts abzuspielen', nl: 'Nog niets af te spelen', fr: 'Rien à lire pour l’instant', es: 'Nada que reproducir aún' ,pl:"Nie ma jeszcze nic do odtworzenia"},
    import:     { en: 'Open a file…', uk: 'Відкрити файл…', de: 'Datei öffnen…', nl: 'Bestand openen…', fr: 'Ouvrir un fichier…', es: 'Abrir un archivo…' ,pl:"Otwórz plik…"},
    import_bad: { en: 'That file could not be read.', uk: 'Не вдалося прочитати цей файл.', de: 'Diese Datei konnte nicht gelesen werden.', nl: 'Dit bestand kon niet worden gelezen.', fr: 'Ce fichier n’a pas pu être lu.', es: 'No se pudo leer ese archivo.' ,pl:"Nie udało się odczytać tego pliku."},
    import_ok:  { en: 'File loaded', uk: 'Файл завантажено', de: 'Datei geladen', nl: 'Bestand geladen', fr: 'Fichier chargé', es: 'Archivo cargado' ,pl:"Plik załadowany"},
    load:       { en: 'Load', uk: 'Завантажити', de: 'Laden', nl: 'Laden', fr: 'Charger', es: 'Cargar' ,pl:"Wczytaj"},
    choose:     { en: 'Choose an example', uk: 'Оберіть приклад', de: 'Beispiel wählen', nl: 'Kies een voorbeeld', fr: 'Choisissez un exemple', es: 'Elija un ejemplo' ,pl:"Wybierz przykład"}
  };

  function siteLang() {
    /* Site language: navigation/chrome. It may be newer than a tool's own translations. */
    var l = null;
    try {
      var q = new global.URLSearchParams(global.location.search).get('lang');
      if (q) l = q;
    } catch (e) {}
    if (!l) l = store('diagram_site_lang');
    if (!l) l = store('diagram_lang');
    if (!l && doc && doc.documentElement.lang) l = doc.documentElement.lang;
    if (!l && global.navigator) l = global.navigator.language || global.navigator.userLanguage;
    l = String(l || 'en').toLowerCase().split('-')[0];
    return SITE_LANGS.indexOf(l) >= 0 ? l : 'en';
  }
  function domainLang(m, requested) {
    var langs = m && Array.isArray(m.tool_languages) && m.tool_languages.length ? m.tool_languages : SITE_LANGS;
    var l = String(requested || siteLang() || 'en').toLowerCase().split('-')[0];
    if (langs.indexOf(l) >= 0) return l;
    if (langs.indexOf('en') >= 0) return 'en';
    return langs.length ? langs[0] : 'en';
  }
  function currentLang() { return domainLang(readManifest(), siteLang()); }
  /* ------------------------------------------------------------ site resolver
     A namespace is not an address: the API constant at the top of this file names
     this contract and never moves, while everything that LOCATES a page follows
     the host the document was served from.

     diagram-common.js owns the resolution order (see its § site resolver). This
     is a mirror, not a second implementation: whenever diagram-common.js is on
     the page every call is delegated to it, so the two runtimes cannot drift.
     The local copy below exists only for a page that loads the UI framework
     alone, and repeats the same order:
       1. <meta name="diagram-site">  2. http(s) document directory
       3. file: directory, host ""    4. a real http(s) origin
       5. last resort SITE_FALLBACK, host "".
     host === "" means "no address a reader could use". */
  var SITE_FALLBACK = 'https://tools.petrov.re/';
  var siteMemo = null;
  function siteOwn() {
    if (siteMemo) return siteMemo;
    var mk = function (b, h) { return { base: b, host: h || '' }; };
    var dir = function (u) { return u.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); };
    var loc = global.location, r = null, u;
    try {
      var el = doc && doc.querySelector('meta[name="diagram-site"]');
      var mv = el && (el.getAttribute('content') || '').replace(/^\s+|\s+$/g, '');
      if (mv) {
        u = new global.URL(mv, loc.href);
        r = mk(u.href.replace(/[?#].*$/, '').replace(/\/*$/, '/'),
               /^https?:$/.test(u.protocol) ? u.host : '');
      }
    } catch (e) {}
    if (!r) try {
      u = new global.URL(loc.href);
      if (/^https?:$/.test(u.protocol)) r = mk(u.origin + dir(u.pathname), u.host);
      else if (u.protocol === 'file:') r = mk(dir(u.href), '');
    } catch (e) {}
    if (!r) try {
      var o = loc && loc.origin;
      if (o && /^https?:\/\//.test(o)) r = mk(o.replace(/\/*$/, '/'), new global.URL(o).host);
    } catch (e) {}
    if (!r) r = mk(SITE_FALLBACK, '');
    siteMemo = r;
    return r;
  }
  function commonSite() {
    var D = global.Diagram;
    return (D && D.site && isFn(D.site.base)) ? D.site : null;
  }
  /* absolute, always one trailing slash */
  function siteBase() { var c = commonSite(); return c ? c.base() : siteOwn().base; }
  /* host only, no scheme, no path — for brand prose and running headers */
  function siteName(lang) {
    var c = commonSite();
    if (c) return c.name(lang);
    return siteOwn().host || pick(UI_STRINGS.site_local, lang);
  }
  function siteIsLocal() { var c = commonSite(); return c ? !!c.isLocal() : siteOwn().host === ''; }
  /* "where this came from", for a human: an absolute URL when one exists,
     otherwise `decayheat.html (local copy)` rather than a raw disk path */
  function siteSourceRef(lang, file) {
    var c = commonSite();
    if (c) return c.sourceRef(lang, file);
    var n = file || (doc && doc.location ? String(doc.location.pathname).split('/').pop() : '') || 'index.html';
    return siteIsLocal() ? n + ' (' + pick(UI_STRINGS.site_local, lang) + ')' : siteBase() + n;
  }
  /* Static markup cannot be dynamic, so a page carrying a hard-coded
     <title>Tool \u2014 tools.petrov.re</title> has its trailing (or, on the index,
     leading) canonical name rewritten to the live one at boot. diagram-common.js
     does this for the tool pages; this copy is what reaches a page that loads the
     UI framework ALONE (benchmark.html is one). Idempotent, so both may run.
     Exact and anchored only: never truncate a title that merely has an em-dash. */
  function siteFixTitle() {
    try {
      var c = commonSite();
      if (c && isFn(c.fixTitle)) return c.fixTitle();
      if (!doc) return '';
      var canon = 'tools.petrov.re', live = siteName();
      if (live === canon) return doc.title;
      var t = doc.title;
      if (t.length > canon.length + 3 && t.slice(-(canon.length + 3)) === ' \u2014 ' + canon)
        doc.title = t.slice(0, -canon.length) + live;
      else if (t.length > canon.length + 3 && t.slice(0, canon.length + 3) === canon + ' \u2014 ')
        doc.title = live + t.slice(canon.length);
      return doc.title;
    } catch (e) { return doc ? doc.title : ''; }
  }

  function pick(v, lang) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (isFn(v)) return String(asLabel(v));
    return v[lang] != null ? v[lang] : (v.en != null ? v.en : '');
  }

  /* CLOSE-THE-LOOP 1. A six-key language object IS a label, everywhere.
     Three of four independent new tools shipped an em dash into a results table
     because `tableCell` could not tell `T('Wall material', …)` from a cell
     descriptor. damperselect.html: "an object with no `text`/`value`/`node` key
     falls through to `String(c.value)` -> '—'. `pick()` is never reached … the
     shipped template's own table is broken today."  flangejoint.html: "Three of
     the four places a tool writes table content (rows, foot) reject the very
     object the rest of the framework accepts everywhere."  trussframe.html
     shipped it into the State column of every row and "caught it only by
     looking at a screenshot. No gate anywhere catches this."
     Measured before the fix: NEW_TOOL_TEMPLATE.html printed
     '— | 0.130 | 25.8 | 7.7' in all seven site languages.
     A label is recognised structurally — no cell key, at least one site
     language present — so a real cell descriptor can never be mistaken for one. */
  function looksLikeLabel(v) {
    if (!v || typeof v !== 'object' || v.nodeType === 1 || Array.isArray(v)) return false;
    if (v.text != null || v.node != null || 'value' in v) return false;
    for (var i = 0; i < SITE_LANGS.length; i++) if (typeof v[SITE_LANGS[i]] === 'string') return true;
    return false;
  }

  /* ------------------------------------------------------------------ units */

  var UNIT_TABLE = {
    /* SI base -> alternatives. factor converts SI value into the display unit. */
    'Pa':      [{ u: 'Pa', f: 1 }, { u: 'kPa', f: 1e-3 }, { u: 'MPa', f: 1e-6 }, { u: 'bar', f: 1e-5 }, { u: 'mbar', f: 1e-2 }, { u: 'psi', f: 1 / 6894.757 }],
    'K':       [{ u: 'K', f: 1 }, { u: 'degC', f: 1, off: -273.15, label: '°C' }, { u: 'degF', f: 1.8, off: -459.67, label: '°F' }],
    'W':       [{ u: 'W', f: 1 }, { u: 'kW', f: 1e-3 }, { u: 'MW', f: 1e-6 }],
    'm':       [{ u: 'm', f: 1 }, { u: 'mm', f: 1e3 }, { u: 'cm', f: 1e2 }, { u: 'km', f: 1e-3 }, { u: 'ft', f: 3.280840 }],
    'm3/s':    [{ u: 'm3/s', f: 1, label: 'm³/s' }, { u: 'm3/h', f: 3600, label: 'm³/h' }, { u: 'l/s', f: 1e3 }],
    'kg/s':    [{ u: 'kg/s', f: 1 }, { u: 'kg/h', f: 3600 }, { u: 't/h', f: 3.6 }],
    'J/kg':    [{ u: 'J/kg', f: 1 }, { u: 'kJ/kg', f: 1e-3 }],
    's':       [{ u: 's', f: 1 }, { u: 'min', f: 1 / 60 }, { u: 'h', f: 1 / 3600 }],
    'kg/m3':   [{ u: 'kg/m3', f: 1, label: 'kg/m³' }]
  };
  var SYSTEM_PREF = {
    si:        {},
    practical: { 'Pa': 'kPa', 'K': 'degC', 'W': 'kW', 'm3/s': 'm3/h', 'm': 'mm', 'J/kg': 'kJ/kg' },
    us:        { 'Pa': 'psi', 'K': 'degF', 'm': 'ft' }
  };

  function unitSystem() {
    var v = store('diagram_units');
    return (v === 'si' || v === 'practical' || v === 'us') ? v : 'practical';
  }
  function unitEntry(si, target) {
    var row = UNIT_TABLE[si];
    if (!row) return null;
    for (var i = 0; i < row.length; i++) if (row[i].u === target) return row[i];
    return null;
  }
  function unitFor(field, overrides) {
    var si = field && field.unit;
    if (!si) return null;
    if (field.display) return unitEntry(si, field.display) || { u: field.display, f: 1 };
    if (overrides && overrides[si]) return unitEntry(si, overrides[si]);
    var pref = SYSTEM_PREF[unitSystem()][si];
    if (pref) return unitEntry(si, pref);
    var row = UNIT_TABLE[si];
    return row ? row[0] : { u: si, f: 1 };
  }
  function unitLabel(entry, si) {
    if (!entry) return si || '';
    return entry.label || entry.u;
  }
  function toDisplay(v, entry) {
    if (v == null || !isFinite(v) || !entry) return v;
    return v * (entry.f == null ? 1 : entry.f) + (entry.off || 0);
  }
  function fromDisplay(v, entry) {
    if (v == null || !isFinite(v) || !entry) return v;
    return (v - (entry.off || 0)) / (entry.f == null ? 1 : entry.f);
  }
  /* ================================================================ numbers
     AGENTS §0.1 ("Number formatting needs a locale map covering all seven"),
     §2.2.1 ("one locale map and one set of defaults for the on-screen chart and
     the report figure"), §2.3 (the machine form is never localised).

     ONE locale map, read by all three places that print a number on this site:
       1. this file -- framework tiles, tables, gauges, chart labels;
       2. a tool's own drawing and table code, through DiagramUI.num;
       3. the report engine in diagram-common.js, which takes its separators
          from Intl.NumberFormat(<report language>). The map below is resolved
          from that same Intl data at first use, so place 3 cannot disagree with
          places 1 and 2 by construction; the literals are the documented
          fallback for an engine that carries no locale data.

     What this map does NOT decide: how many digits a number carries. That stays
     with the caller (`precision`, `sig`) or with the digit rule it asks for
     (`digits`). A separator change must never move a graded value.

     English is pinned. Every benchmark driver on this site reads printed text at
     ?lang=en, so the English rendering of a number stays byte for byte what it
     was before this map existed: decimal point, groups of three separated by
     U+2009 THIN SPACE (ISO 80000-1 §7.3.1 grouping; the character this file has
     used since v3.0), grouping from four integer digits. `grpLocale` records the
     CLDR character for English (a comma) that the report sheet uses, so the one
     remaining screen/sheet divergence is written down rather than rediscovered.

     The language is siteLang() for the screen and the report language for the
     report (AGENTS §0): a number is not a word, so a Polish shell around an
     English-only tool still writes Polish numbers. {lang:'xx'} overrides. */
  var NUM_MAP = {
    /* dec  decimal separator        grp  group separator
       min  minimum integer digits before grouping applies, CLDR
            minimumGroupingDigits: 1 = group from four digits, 2 = from five
       list separator between the items of an enumerated list of values */
    en: { dec: '.', grp: ' ', grpLocale: ',',      min: 1, list: ', ' },
    uk: { dec: ',', grp: ' ', grpLocale: ' ', min: 1, list: '; ' },
    de: { dec: ',', grp: '.',      grpLocale: '.',      min: 1, list: '; ' },
    nl: { dec: ',', grp: '.',      grpLocale: '.',      min: 1, list: '; ' },
    fr: { dec: ',', grp: ' ', grpLocale: ' ', min: 1, list: ' ; ' },
    es: { dec: ',', grp: '.',      grpLocale: '.',      min: 2, list: '; ' },
    pl: { dec: ',', grp: ' ', grpLocale: ' ', min: 2, list: '; ' }
  };
  var NUM_PINNED = { en: true };            /* rule: English output does not move */
  var NUM_RESOLVED = {};
  /* Read the separators the report engine will use for this language, so the two
     documents cannot disagree. A pinned language keeps its literals and records
     what Intl said in `grpLocale`. */
  function numLocale(lang) {
    var l = String(lang == null ? '' : lang).toLowerCase().split('-')[0];
    if (!NUM_MAP[l]) l = 'en';
    if (NUM_RESOLVED[l]) return NUM_RESOLVED[l];
    var m = NUM_MAP[l];
    var out = { lang: l, dec: m.dec, grp: m.grp, grpLocale: m.grpLocale,
                min: m.min, list: m.list, source: 'literal' };
    try {
      var nf = new global.Intl.NumberFormat(l);
      var parts = nf.formatToParts(1234567.5), i, d = null, g = null;
      for (i = 0; i < parts.length; i++) {
        if (parts[i].type === 'decimal') d = parts[i].value;
        if (parts[i].type === 'group' && g === null) g = parts[i].value;
      }
      if (d || g) {
        out.source = NUM_PINNED[l] ? 'pinned' : 'intl';
        if (g) out.grpLocale = g;
        /* A pinned language takes nothing from Intl but the record of what Intl
           would have said: its printed form may not move. */
        if (!NUM_PINNED[l]) {
          if (d) out.dec = d;
          if (g) out.grp = g;
          out.min = /[^0-9]/.test(nf.format(1000)) ? 1 : 2;
        }
      }
    } catch (e) {}
    NUM_RESOLVED[l] = out;
    return out;
  }
  /* siteLang() parses the query string and reads storage, and a formatter runs
     once per table cell, so the resolved map is held until <html lang> changes --
     the one event that follows a language switch, written by
     Diagram.setDocumentLang(). The attribute is the cache key and never the
     answer: a page carries the static lang="en" of its source until the
     framework sets it, so the answer is still siteLang(). */
  var NUM_CUR = { key: null, loc: null };
  function numLocaleCurrent() {
    var k = '';
    try { k = (doc && doc.documentElement && doc.documentElement.lang) || ''; } catch (e) {}
    if (NUM_CUR.key === k && NUM_CUR.loc) return NUM_CUR.loc;
    NUM_CUR.loc = numLocale(siteLang());
    NUM_CUR.key = k;
    return NUM_CUR.loc;
  }
  function numLocaleFor(opts) {
    return (opts && opts.lang) ? numLocale(opts.lang) : numLocaleCurrent();
  }
  /* The separator step, and the only place on this site that writes a decimal or
     a group separator. It re-separates a string that already carries the digits
     someone else chose, in the machine form (dot, no grouping), and it never
     re-rounds: a precision a tool asked for survives untouched. A mantissa is
     not grouped, which is what the report engine does for its own exponential
     branch. */
  function numSep(str, opts) {
    opts = opts || {};
    var loc = numLocaleFor(opts);
    var s = String(str), exp = '';
    var e = s.search(/[eE]/);
    if (e >= 0) { exp = s.slice(e); s = s.slice(0, e); }
    var sign = '';
    if (s.charAt(0) === '-' || s.charAt(0) === '+') { sign = s.charAt(0); s = s.slice(1); }
    var dot = s.indexOf('.');
    var whole = dot < 0 ? s : s.slice(0, dot);
    var frac = dot < 0 ? '' : s.slice(dot + 1);
    var g = opts.group;
    var doGroup = g === true ||
      (g !== false && !exp && (loc.min <= 1 || whole.length >= 3 + loc.min));
    if (doGroup && loc.grp && /^\d+$/.test(whole)) {
      whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, loc.grp);
    }
    return sign + whole + (frac ? loc.dec + frac : '') + exp;
  }
  /* The digit rules, each named and each exactly the one its place already used.
       'ui'     this file since v3.0: fixed decimals by magnitude.
       'report' diagram-common.js reportNumber(): four significant digits, a
                whole number whole, a wider exponential window.
     A caller that has its own digits passes digits:'raw' and a string. */
  function numDigits(value, opts) {
    var p = opts.precision;
    if (p != null) return Number(value).toFixed(p);
    if (opts.sig != null) return String(Number(Number(value).toPrecision(opts.sig)));
    var a = Math.abs(value);
    if (opts.digits === 'report') {
      if (value === 0) return '0';
      if (a < 1e-6 || a >= 1e9) {
        var ex = value.toExponential(3).split('e');
        return String(Number(Number(ex[0]).toPrecision(4))) + 'e' + ex[1];
      }
      if (value % 1 === 0) return value.toFixed(0);
      return String(Number(value.toPrecision(4)));
    }
    if (a !== 0 && (a < 1e-3 || a >= 1e6)) return value.toExponential(3);
    if (a >= 1000) return value.toFixed(0);
    if (a >= 100) return value.toFixed(1);
    if (a >= 1) return value.toFixed(3);
    return value.toPrecision(3);
  }
  /* The canonical human-facing formatter. Non-finite and empty behave as fmt()
     has always behaved, because 99 pages depend on it: null and '' print the em
     dash, NaN and Infinity print themselves, a non-number prints as itself. */
  function numFormat(value, opts) {
    opts = opts || {};
    if (opts.digits === 'raw') return numSep(value, opts);
    if (value == null || value === '') return '—';
    if (typeof value !== 'number') return String(value);
    if (!isFinite(value)) return String(value);
    return numSep(numDigits(value, opts), opts);
  }
  /* AGENTS §2.3: the machine form is never localised. A dot, no grouping, no
     locale -- for the Python export, a CSV, a JSON record, a permalink, a
     data- attribute and every other value a script reads back. */
  function numMachine(value, opts) {
    opts = opts || {};
    if (value == null || value === '') return '';
    if (typeof value !== 'number') return String(value);
    if (!isFinite(value)) return String(value);
    if (opts.digits === 'raw') return String(value);
    return numDigits(value, opts);
  }
  /* The list separator is a locale decision exactly as the decimal separator is,
     and for the same reason: where the comma is the decimal marker it cannot
     also separate items, so "1,5, 2,5" becomes "1,5; 2,5". One place owns it. */
  function numList(items, opts) {
    opts = opts || {};
    var loc = numLocaleFor(opts);
    var a = Array.isArray(items) ? items : [items];
    var out = [], i;
    for (i = 0; i < a.length; i++) {
      out.push(typeof a[i] === 'number' ? numFormat(a[i], opts) : String(a[i]));
    }
    return out.join(opts.sep || loc.list);
  }
  /* Read a localised number back -- an input a user typed, a cell being parsed.
     The locale decides: its own group separator is dropped, its own decimal
     separator becomes a dot. Both of '.' and ',' are then still accepted,
     because a user types what their keyboard offers; when a single separator
     could be either -- "1,234" in a comma-decimal locale -- the locale's own
     reading wins, and a caller that cannot afford that ambiguity should read the
     machine form instead. Returns NaN for anything it cannot read. */
  function numParse(str, opts) {
    var loc = numLocaleFor(opts || {});
    var s = String(str == null ? '' : str).trim();
    if (!s) return NaN;
    /* every space-class and apostrophe group separator in use in the seven */
    s = s.replace(/[\u00A0\u202F\u2009\u2007\u2008\u0020'\u2019]/g, '');
    var dec = loc.dec, grp = (loc.grp === '.' || loc.grp === ',') ? loc.grp : null;
    if (grp && grp !== dec) s = s.split(grp).join('');
    var other = dec === ',' ? '.' : ',';
    if (s.indexOf(dec) >= 0) {
      if (s.indexOf(other) >= 0) s = s.split(other).join('');
      s = s.replace(dec, '.');
    } else if (s.indexOf(other) >= 0) {
      /* the other separator, alone: read it as a decimal mark, which is what a
         user who typed it meant on every keyboard that offers only one */
      if (s.split(other).length === 2) s = s.replace(other, '.');
      else s = s.split(other).join('');
    }
    return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN;
  }

  /* fmt() keeps its name, its arguments and its English output; it is the same
     function with the separator step moved into the map above. 99 pages call it.
     Additions are additions. */
  function fmt(value, opts) {
    return numFormat(value, opts);
  }

  /* ------------------------------------------------------- chart-series scale
     spectrum.html, couldNotMap: "The framework is missing a chart-series ramp;
     this is the third tool to want one." decayheat.html kept `--series-1..8`
     as tool-owned custom properties ("Spec section 16 forbids custom properties
     outside the section 2 set, but these encode data series"), moodydiagram
     declared namespaced literals for the same reason, and solargaincalculator,
     gesloten-atmosfeer, neutron_transport and ontvochtiging all consume the
     same `--series-N` spelling. So the spelling stays the site's; the framework
     only supplies the missing default and one resolver.

     PRECEDENCE, deliberately: a tool's own `--series-N` wins over the
     framework's `--dgu-series-N`. Five deployed tools already picked their
     ramp and their drawings are compared byte-for-byte against a baseline. */

  var SERIES_N = 8;
  var SERIES_FALLBACK = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100',
                         '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  var seriesCache = null;

  function seriesIndex(i) {
    var n = Math.floor(Number(i) || 0) % SERIES_N;
    if (n < 0) n += SERIES_N;
    return n;                                   /* 0-based, cycles */
  }
  function cssVar(name, root) {
    if (!doc || !global.getComputedStyle) return '';
    try {
      return String(global.getComputedStyle(root || doc.documentElement).getPropertyValue(name) || '').trim();
    } catch (e) { return ''; }
  }
  /* Resolved against the shell when there is one: solargaincalculator.html
     scopes its ramp to `html[data-theme] .dgu-app`, not to :root, so reading
     documentElement alone would miss a tool's own choice. */
  function seriesRoot() {
    return (App.current && App.current.node && App.current.node.isConnected !== false)
      ? App.current.node
      : (doc ? (doc.querySelector('.dgu-app') || doc.documentElement) : null);
  }
  /* The resolved colour, for canvas and for anything that needs a real string.
     Cached per theme and per root because getComputedStyle is a layout read. */
  function series(i) {
    var n = seriesIndex(i);
    var root = seriesRoot();
    if (!seriesCache || seriesCache.root !== root) seriesCache = { root: root, v: [] };
    if (seriesCache.v[n]) return seriesCache.v[n];
    var v = cssVar('--series-' + (n + 1), root)
         || cssVar('--dgu-series-' + (n + 1), root)
         || SERIES_FALLBACK[n];
    seriesCache.v[n] = v;
    return v;
  }
  /* The unresolved reference, for CSS, SVG attributes and gradients: it keeps
     following the theme without a redraw. */
  series.css = function (i) {
    var n = seriesIndex(i) + 1;
    return 'var(--series-' + n + ',var(--dgu-series-' + n + '))';
  };
  series.count = SERIES_N;
  series.refresh = function () { seriesCache = null; return series; };
  series.list = function (k) {
    var out = [], n = k == null ? SERIES_N : k;
    for (var i = 0; i < n; i++) out.push(series(i));
    return out;
  };

  /* ------------------------------------------------------------------ legend
     Bound to the same scale, because several ports kept a hand-built legend
     row: spectrum.html moved "the in-canvas legend -> an HTML .spc-legend row
     directly under the canvas"; fourier_series.html could not map "the chart
     legend" because "ui.stage offers caption but no legend slot ... Injected as
     a row inside the stage node above the caption"; wallthermalcalculator ships
     five stages "(+legend)"; heat2d moved "tooltip, colour legend and progress
     overlay ... inside the stage body". */

  function legend(def, lang) {
    def = def || {};
    var node = el('div', { class: 'dgu-legend' + (def.compact ? ' compact' : '') });
    if (def.a11yLabel) node.setAttribute('aria-label', pick(asLabel(def.a11yLabel), lang));
    node.setAttribute('role', 'list');

    function swatch(it) {
      var c = it.color || series.css(it.series != null ? it.series : 0);
      var sh = it.shape || def.shape || 'line';
      var sw = el('span', { class: 'dgu-legend-sw ' + sh, 'aria-hidden': 'true' });
      if (sh === 'line') {
        sw.style.borderTopColor = c;
        sw.style.borderTopStyle = it.dash ? 'dashed' : 'solid';
      } else {
        sw.style.background = c;
        if (it.dash) sw.style.opacity = '.55';
      }
      return sw;
    }

    node.update = function (items, l) {
      l = l || lang;
      clear(node);
      (items || []).forEach(function (it, i) {
        if (!it || it.visible === false) return;
        var txt = pick(asLabel(it.label != null ? it.label : it), l);
        var box, tag = def.toggle ? 'button' : 'span';
        box = el(tag, { class: 'dgu-legend-i' + (it.off ? ' off' : ''), role: 'listitem' });
        if (def.toggle) {
          box.type = 'button';
          box.setAttribute('aria-pressed', it.off ? 'false' : 'true');
          on(box, 'click', function () {
            it.off = !it.off;
            call(def.onToggle, [i, !it.off, it], 'legend.onToggle');
            node.update(items, l);
          });
        }
        box.appendChild(swatch(it));
        box.appendChild(el('span', { class: 'dgu-legend-t', text: txt }));
        if (it.value != null) {
          box.appendChild(el('span', {
            class: 'dgu-legend-v',
            text: typeof it.value === 'number' ? fmt(it.value, { precision: it.precision }) : String(it.value)
          }));
        }
        node.appendChild(box);
      });
      node.hidden = !node.firstChild;
      return node;
    };
    node.color = function (i) { return series(i); };
    node.update(def.items || [], lang);
    return node;
  }

  /* ------------------------------------------------------------- shell styles */

  var SHELL_CSS = [
    /* ---- shell skeleton ---- */
    '.dgu-app{font:400 var(--fs-body)/1.5 var(--font);color:var(--ink);background:var(--bg);',
    'min-height:100vh;display:flex;flex-direction:column;box-sizing:border-box}',
    '.dgu-app *,.dgu-app *::before,.dgu-app *::after{box-sizing:border-box}',
    '.dgu-app h1,.dgu-app h2,.dgu-app h3{margin:0}',

    /* ---- header ---- */
    '.dgu-head{position:sticky;top:0;z-index:var(--z-sticky);display:flex;align-items:center;gap:var(--sp-3);',
    'flex-wrap:wrap;padding:var(--sp-3) var(--sp-4);background:var(--bg);border-bottom:1px solid var(--line)}',
    /* The title's box may not fall below its longest word. `overflow-wrap:
       anywhere` is taken into account when a flex item's min-content size is
       computed, so the h1 shrank under the subtitle and the browser broke
       inside the word: measured "Kabeldimens / ionering", a 196 px word in a
       125 px box, on 15 of 28 mobile loads. `break-word` leaves the
       min-content size at the longest word and still breaks a word that
       cannot fit a line of its own, so nothing overflows; the header line
       wraps instead of squeezing, and below 640 px the title and the subtitle
       each take a full line. Titles are not touched. */
    '.dgu-head-l{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3);min-width:0;flex:1 1 auto}',
    '.dgu-head-r{display:flex;align-items:center;gap:var(--sp-2);flex:0 0 auto;margin-left:auto}',
    '.dgu-title{font-size:var(--fs-title);font-weight:650;letter-spacing:-.02em;min-width:0;',
    'overflow-wrap:break-word}',
    '.dgu-sub{font-size:var(--fs-small);color:var(--muted);min-width:0}',
    '@media (max-width:640px){.dgu-head-l .dgu-title,.dgu-head-l .dgu-sub{flex:1 1 100%}}',
    '.dgu-home{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-small);font-weight:650;',
    'color:var(--muted);text-decoration:none;white-space:nowrap}',
    '.dgu-home:hover{color:var(--accent)}',

    /* ---- controls ---- */
    '.dgu-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--ctl-h);',
    'padding:0 var(--sp-3);font:500 var(--fs-label)/1 var(--font);color:var(--ink);background:var(--panel);',
    'border:1px solid var(--line);border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;',
    'transition:background var(--motion-fast) var(--ease),border-color var(--motion-fast) var(--ease)}',
    '.dgu-btn:hover{background:var(--weak);border-color:var(--accent)}',
    '.dgu-btn[disabled]{opacity:.5;cursor:not-allowed}',
    '.dgu-btn[disabled]:hover{background:var(--panel);border-color:var(--line)}',
    '.dgu-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:650}',
    '.dgu-btn.primary:hover{filter:brightness(1.07)}',
    '.dgu-btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}',
    '.dgu-btn.ghost:hover{background:var(--weak);color:var(--ink);border-color:transparent}',
    '.dgu-btn.danger{color:var(--bad);border-color:var(--line)}',
    '.dgu-btn.danger:hover{background:var(--bad-bg);border-color:var(--bad)}',
    '.dgu-btn.icon{padding:0;width:var(--ctl-h);flex:0 0 auto;font-size:15px}',
    '.dgu-btn.on{background:var(--weak);border-color:var(--accent);color:var(--accent)}',
    '@media(max-width:768px){.dgu-app .dgu-btn{min-height:var(--tap)}',
    '.dgu-app .dgu-btn.icon{width:var(--tap)}}',
    '.dgu-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;font:500 var(--fs-micro)/1.6 var(--font);',
    'border-radius:var(--radius-pill);background:var(--weak);color:var(--accent);white-space:nowrap}',
    '.dgu-chip.ok{background:var(--ok-bg);color:var(--ok)}',
    '.dgu-chip.warn{background:var(--warn-bg);color:var(--warn)}',
    '.dgu-chip.bad{background:var(--bad-bg);color:var(--bad)}',
    '.dgu-sel{min-height:var(--ctl-h);padding:0 var(--sp-2);font:400 var(--fs-label)/1 var(--font);',
    'color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-sm);',
    'max-width:100%}',

    /* ---- main grid ---- */
    /* v3.6.1 D1 — the side tracks carry a scrollbar allowance. A region that is
       a real pane has a real scrollbar in it, and `scrollbar-gutter:stable`
       reserves that width INSIDE the column: a studio `inputs` track measured
       250 px wide handed its fields a 216 px content box before the pane
       release and 201 px after, which made every one of the eight tools that
       already overflowed inside that column overflow by a further 15 px and
       pushed three German pages (neutron_transport, reactorstand, relativity)
       over the line for the first time. No gate saw it, because the region rect
       does not move and document-level horizontal overflow stays 0. The
       framework introduced the gutter, so the framework's track pays for it:
       `--dgu-sb-a` / `--dgu-sb-z` are set by applyPanes() to the platform's
       measured scrollbar width, and ONLY on the side that actually got a pane.
       They are 0 on overlay-scrollbar platforms (macOS, iOS), 0 where the pane
       was not needed, and 0 if the framework's JS never runs — so the fix costs
       the stage nothing except where a scrollbar is genuinely on the screen. */
    '.dgu-main{flex:1 1 auto;display:grid;gap:var(--sp-4);padding:var(--sp-4);align-items:start;',
    'width:100%;max-width:var(--bp-xl);margin:0 auto}',
    '.dgu-region{min-width:0;display:flex;flex-direction:column;gap:var(--sp-4)}',
    '.dgu-region[hidden]{display:none}',
    /* v3.7.4 — rail GROUPS use a bounded grid. CSS multi-column balanced card
       stacks efficiently, but a wide intrinsic descendant can force new
       columns outside the scrollport (observed in cfd and thermaloptimizer),
       making whole groups appear to disappear after dragging the splitter.
       Grid keeps every group inside the rail and lets card contents shrink. */
    '.dgu-region[data-dgu-flow="cols"]{display:grid;',
    'grid-template-columns:repeat(auto-fit,minmax(var(--dgu-panelcol,230px),1fr));',
    'gap:var(--sp-4);align-items:start}',
    '.dgu-region[data-dgu-flow="cols"]>*{min-width:0;width:auto;margin-bottom:0}',
    '.dgu-region[data-dgu-flow="cols"]>[data-dgu-primary],',
    '.dgu-region[data-dgu-flow="cols"]>.dgu-span-all{grid-column:1/-1}',
    /* The threshold is the archetype's OWN rail width, not a global number: a
       studio palette is designed to work at 250 px and a calculator's input
       column at 340, so "two groups fit" means something different in each. */
    '.dgu-app[data-layout="studio"],.dgu-app[data-layout="reference"],',
    '.dgu-app[data-layout="wizard"]{--dgu-panelcol:230px}',
    '.dgu-app[data-layout="calculator"]{--dgu-panelcol:310px}',

    '.dgu-app[data-layout="reference"] .dgu-main{max-width:1120px}',

    /* calculator: inputs | stage | results */
    '.dgu-app[data-layout="calculator"] .dgu-main{grid-template-columns:minmax(0,1fr);',
    'grid-template-areas:"strip" "inputs" "stage" "results" "dock" "footer"}',
    '@media(min-width:768px){.dgu-app[data-layout="calculator"] .dgu-main{',
    'grid-template-columns:calc(340px + var(--dgu-sb-a,0px)) minmax(0,1fr);',
    'grid-template-areas:"inputs stage" "inputs results" "dock dock" "footer footer"}}',
    '@media(min-width:1120px){.dgu-app[data-layout="calculator"] .dgu-main{',
    'grid-template-columns:calc(340px + var(--dgu-sb-a,0px)) minmax(0,1fr) calc(360px + var(--dgu-sb-z,0px));',
    'grid-template-areas:"inputs stage results" "dock dock dock" "footer footer footer"}}',

    /* studio: palette | stage | detail, dock beneath */
    '.dgu-app[data-layout="studio"] .dgu-main{grid-template-columns:minmax(0,1fr);',
    'grid-template-areas:"stage" "inputs" "detail" "results" "dock" "footer"}',
    /* v3.6.2 — `results` moved INTO the stage column, directly under the stage,
       instead of sitting in a full-width row beneath every column. Two things
       follow, and they are the two the report asked for: the answer is where
       the reader is already looking, next to the drawing that produced it,
       rather than past the bottom of the longest rail; and the rails now span
       both rows, so a palette has the height of the stage AND the results to
       grow into before it needs to scroll at all. The old shape was why a
       studio tool's answer could sit 4 700 px down — `results` began below
       whichever column was tallest, and on these tools that is always the input
       rail. */
    '@media(min-width:768px){.dgu-app[data-layout="studio"] .dgu-main{',
    'grid-template-columns:calc(250px + var(--dgu-sb-a,0px)) minmax(0,1fr);',
    'grid-template-areas:"inputs stage" "inputs results" "inputs detail" "dock dock" "footer footer"}}',
    '@media(min-width:1120px){.dgu-app[data-layout="studio"] .dgu-main{',
    'grid-template-columns:calc(250px + var(--dgu-sb-a,0px)) minmax(0,1fr) calc(320px + var(--dgu-sb-z,0px));',
    'grid-template-areas:"inputs stage detail" "inputs results detail" "dock dock dock" "footer footer footer"}}',

    /* wizard: steps | form | live results */
    '.dgu-app[data-layout="wizard"] .dgu-main{grid-template-columns:minmax(0,1fr);',
    'grid-template-areas:"strip" "nav" "inputs" "stage" "results" "footer"}',
    '@media(min-width:768px){.dgu-app[data-layout="wizard"] .dgu-main{',
    'grid-template-columns:calc(240px + var(--dgu-sb-a,0px)) minmax(0,1fr);',
    'grid-template-areas:"nav inputs" "nav stage" "nav results" "footer footer"}}',
    '@media(min-width:1120px){.dgu-app[data-layout="wizard"] .dgu-main{',
    'grid-template-columns:calc(240px + var(--dgu-sb-a,0px)) minmax(0,1fr) calc(340px + var(--dgu-sb-z,0px));',
    'grid-template-areas:"nav inputs results" "nav stage results" "footer footer footer"}}',

    /* reference: filters | content */
    '.dgu-app[data-layout="reference"] .dgu-main{grid-template-columns:minmax(0,1fr);',
    'grid-template-areas:"nav" "stage" "results" "footer"}',
    /* v3.4 §19 — a grid whose container is taller than its content hands the
       free space to its `auto` rows, so a lookup with no drawing stranded its
       answer 130 px down the page under an empty `stage` row. Only `reference`
       has that shape (its nav spans both rows and its stage is optional), and
       only `reference` gets the rule: measured on all five shipped reference
       tools at 1280 and 390 px in German, not one region moves a pixel. */
    '.dgu-app[data-layout="reference"] .dgu-main{align-content:start}',
    /* v3.6.1 — the filter rail stays at **md**, and the two local overrides that
       moved it to lg are gone from the tools instead. §4.2's column table does
       put the `reference` rail at ≥lg, with "filters collapse to a sticky bar"
       at md, and kernnormenwijzer and periodictable were each carrying an
       `html .dgu-app[data-layout="reference"] .dgu-main{…}` block annotated
       "Repaired locally" to enforce that reading. Conforming the framework to
       it was tried and MEASURED, and it is the wrong trade while §17.1's md
       sticky bar is unbuilt: with the rail withdrawn at 768 the filters simply
       stack above the content and push the answer down — normenwijzer +404 px,
       fastenergrades +466, weldsymbols +395, against −926 on hydraulicsolutions
       and −104 on periodictable. Spec conformance that costs 400 px of scroll
       and buys an un-built component is not conformance. The rail stays where
       the runtime has it, all six reference tools now behave alike, and §4.2's
       md row remains a promise the runtime does not keep — which §17.1 already
       records. */
    '@media(min-width:768px){.dgu-app[data-layout="reference"] .dgu-main{',
    'grid-template-columns:calc(250px + var(--dgu-sb-a,0px)) minmax(0,1fr);',
    'grid-template-areas:"nav stage" "nav results" "footer footer"}}',

    /* v3.2 P9 — the grid item is the wrapper, not the region (see §17.9). It is
       static and stretched, so a sticky region inside it is constrained to its
       own row instead of to the whole grid, and a splitter handle hung on it
       sits in the gutter outside the region's scroll box. A wrapper whose
       region is hidden must not be an item at all: an area name the archetype
       does not define creates an implicit track. */
    '.dgu-rwrap{display:block;min-width:0;align-self:stretch}',
    '.dgu-rwrap[hidden]{display:none}',
    '.dgu-rwrap:not(:has(.dgu-region:not([hidden]))){display:none}',
    /* `display:contents` unless it is actually a pane. A box that exists only
       sometimes must not be there the rest of the time: a `position:sticky`
       element is confined to its PARENT's box, so simply inserting this one
       around every region took the sticky mobile result strip — which fits its
       parent exactly — and left it nothing to travel in. fwgate caught it as
       `strip:false` on 24 cells at 390 px across a dozen tools, while the
       shipped v3.6.1 was green on the same pages. `display:contents` removes
       the box from layout entirely, so below the archetype's own breakpoint the
       strip is back to being a child of the wrapper and sticks as it always
       did; the box appears only where a rail is a real pane and something has
       to hold the handle. */
    '.dgu-panebox{display:contents}',
    /* …except one that hosts a handle. `display:contents` generates no box, so
       `position:relative` on it does nothing and the absolutely placed handle
       escapes to whatever ancestor IS positioned — measured on roomacoustics at
       768, where the detail handle landed 13 px past the right edge of the page
       and check.js reported 19 px of horizontal overflow on a document that had
       none before. A box that has to be a containing block is not optional. */
    '.dgu-panebox.dgu-resizable{display:block;min-width:0;position:relative}',

    /* v3.6.2 §22.9 — the primary action does not scroll away inside its own
       pane. Capping a column is only an improvement if the thing the column is
       FOR stays reachable: cfd's "\u25b6 Calculate" sits at the end of a 2 386 px
       input stack, so the pane that made the tool readable also put its one
       irreplaceable control below a fold inside a fold — two scroll gestures,
       in two different scroll boxes, to press the button the whole page exists
       for. `position:sticky` inside a scroll container sticks to THAT
       container, so one rule pins it to the bottom edge of the pane and nothing
       has to be moved in the DOM: no tool's markup, event wiring or own CSS is
       disturbed. Marked either by the tool (`data-dgu-primary`) or by the
       framework itself, which now stamps every primary actionButton().
       Outside a pane the rule does not apply and nothing changes. */
    /* v3.6.2 — the pinned action wears the rail's own chrome. Lifted out of its
       panel it was a bare row of buttons floating on the page background at the
       foot of a column of cards — "sticking out awkwardly, getting in the way
       of the layout", and a fair description. Give it the card's surface,
       border and radius and it reads as the rail's footer, which is what it is. */
    '.dgu-region[data-dgu-pane]>[data-dgu-primary],',
    '.dgu-region[data-dgu-flow="cols"]>[data-dgu-primary]{',
    'display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;',
    'padding:var(--sp-3);background:var(--panel);border:1px solid var(--line);',
    'border-radius:var(--radius-md)}',
    '.dgu-region[data-dgu-pane]:not([data-dgu-flow="cols"])>[data-dgu-primary]{',
    'position:sticky;bottom:0;z-index:2;margin-top:auto;',
    'margin-bottom:calc(-1 * var(--dgu-primary-h,0px));',
    'box-shadow:0 -10px 16px -10px var(--shadow,rgba(0,0,0,.28))}',

    /* the field the action was lifted out of has nothing left in it */
    '.dgu-field[data-dgu-emptied],.dgu-fctl[data-dgu-emptied]{display:none}',
    '.dgu-rw-inputs{grid-area:inputs}.dgu-rw-stage{grid-area:stage}.dgu-rw-results{grid-area:results}',
    '.dgu-rw-detail{grid-area:detail}.dgu-rw-dock{grid-area:dock}.dgu-rw-footer{grid-area:footer}',
    '.dgu-rw-nav{grid-area:nav}.dgu-rw-strip{grid-area:strip}',
    '@media(min-width:768px){.dgu-rw-strip{display:none}}',
    /* kept for tools that still select regions by grid area; inert now that the
       region is not the grid item, and removed when the sweep reaches them */
    '.dgu-r-inputs{grid-area:inputs}.dgu-r-stage{grid-area:stage}.dgu-r-results{grid-area:results}',
    '.dgu-r-detail{grid-area:detail}.dgu-r-dock{grid-area:dock}.dgu-r-footer{grid-area:footer}',
    '.dgu-r-nav{grid-area:nav}.dgu-r-strip{grid-area:strip}',
    '@media(min-width:768px){.dgu-r-strip{display:none}}',

    /* sticky columns on wide screens, never an inner scrollbar */
    '@media(min-width:1120px){.dgu-app[data-layout="calculator"] .dgu-r-results{position:sticky;',
    'top:calc(var(--dgu-head-h,64px) + var(--sp-4))}}',

    /* ---- panels ---- */
    '.dgu-panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-md);',
    'padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);min-width:0}',
    '.dgu-panel-h{display:flex;align-items:center;gap:var(--sp-2);min-width:0}',
    '.dgu-panel-t{font:650 var(--fs-section)/1.3 var(--font);text-transform:uppercase;',
    'letter-spacing:.08em;color:var(--muted);min-width:0;overflow-wrap:anywhere}',
    '.dgu-panel-note{font-size:var(--fs-small);color:var(--muted)}',
    '.dgu-panel-actions{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-top:var(--sp-1)}',
    '.dgu-panel-actions.end{justify-content:flex-end}',
    /* v3.6.2 L3 rewritten — the COLUMNS CARRY PANELS, not fields.
       v3.6.1 put the container-relative grid on `.dgu-fields`, so widening a
       rail split each panel's own label/control pairs across columns. That is
       the wrong unit: a field is a label bound to one control and it wants the
       full width of whatever holds it, while a panel is a group that is already
       self-contained and can sit beside another group. Measured in German at a
       560 px rail, splitting fields bought 0 px of height on the median tool and
       pushed labels wrapping to three lines from 8 to 33 of 1 444; at 160 px
       columns it bought 86 px and wrapped 87. The field stack goes back to
       being a stack.

       The grid moves up one level, onto the rail itself. Every direct child of
       a scrolling rail — a panel, a notice, the pinned action — takes a track,
       and the same `min(100%, …)` clamp keeps a track that cannot fit from
       overflowing its container. A rail dragged from 265 to 560 px now holds
       two groups side by side instead of one group stretched to twice its
       useful width, which is the whole reason the handle exists. */
    '.dgu-fields{display:flex;flex-direction:column;gap:var(--sp-3);min-width:0}',

    /* ---- fields ---- */
    '.dgu-field{display:grid;gap:4px;min-width:0}',
    '.dgu-flabel{display:flex;align-items:baseline;gap:6px;font:500 var(--fs-label)/1.3 var(--font);',
    'color:var(--ink);min-width:0}',
    '.dgu-req{color:var(--bad);font-size:var(--fs-micro)}',
    '.dgu-frow{display:flex;align-items:center;gap:var(--sp-2);min-width:0}',
    '.dgu-fctl{flex:1 1 auto;min-width:0;width:100%;min-height:var(--ctl-h);padding:0 var(--sp-2);',
    'font:400 var(--fs-body)/1 var(--font);color:var(--ink);background:var(--panel);',
    'border:1px solid var(--line);border-radius:var(--radius-sm)}',
    'textarea.dgu-fctl{padding:var(--sp-2);line-height:1.4;min-height:calc(var(--ctl-h) * 2)}',
    '.dgu-fctl:hover{border-color:var(--accent)}',
    '.dgu-fctl[disabled]{opacity:.55;cursor:not-allowed}',
    '.dgu-fctl[aria-invalid="true"]{border-color:var(--bad);background:var(--bad-bg)}',
    '@media(max-width:768px){.dgu-app .dgu-fctl{min-height:var(--tap)}}',
    '.dgu-unit{flex:0 0 auto;font:400 var(--fs-small)/1 var(--font);color:var(--muted);white-space:nowrap;',
    'min-width:2.5em}',
    '.dgu-hint{font-size:var(--fs-small);color:var(--muted)}',
    '.dgu-err{font-size:var(--fs-small);color:var(--bad)}',
    '.dgu-field.range .dgu-fctl{padding:0;border:0;background:transparent;min-height:24px}',
    '.dgu-rangeval{font:500 var(--fs-small)/1 var(--font-mono);color:var(--muted);',
    'min-width:5.5em;text-align:right;flex:0 0 auto}',
    /* v3.4 §6.5 — the typed box of a range composite. `.dgu-field.range
       .dgu-fctl` strips the border off the slider, so the box has to put it
       back at a higher specificity, mobile tap height included. */
    '.dgu-field.range .dgu-rangenum.dgu-fctl{flex:0 0 auto;width:7em;min-width:0;text-align:right;',
    'font-variant-numeric:tabular-nums;padding:0 var(--sp-2);min-height:var(--ctl-h);',
    'border:1px solid var(--line);background:var(--panel)}',
    '@media(max-width:768px){.dgu-app .dgu-field.range .dgu-rangenum.dgu-fctl{',
    'min-height:var(--tap)}}',
    /* CLOSE-THE-LOOP 9. A segmented control that does not fit WRAPS instead of
       scrolling out of sight. trussframe.html: ".dgu-seg{max-width:100%;
       overflow:auto;scrollbar-width:none} — four options do not fit the 250 px
       studio palette in any of the seven site languages, and the overflow is silent:
       the fourth tool was in the DOM, focusable, hit-testable by fwgate, and
       invisible to a user."  §7.5 forbids exactly that. flex-wrap acts only when
       a line is already over-full, so a control that fits today is untouched;
       overflow:auto stays as the backstop for one unbreakable option. */
    '.dgu-seg{display:inline-flex;flex-wrap:wrap;background:var(--panel-2);border:1px solid var(--line);',
    'border-radius:var(--radius-sm);padding:2px;gap:2px;max-width:100%;overflow:auto;',
    'scrollbar-width:none}',
    '.dgu-seg::-webkit-scrollbar{display:none}',
    '.dgu-seg button{border:0;background:transparent;color:var(--muted);border-radius:var(--radius-pill);',
    'padding:0 var(--sp-3);min-height:calc(var(--ctl-h) - 6px);font:500 var(--fs-label)/1 var(--font);',
    'cursor:pointer;white-space:nowrap}',
    '.dgu-seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink);font-weight:650}',
    '.dgu-toggle{display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;min-height:var(--ctl-h)}',
    '.dgu-toggle input{width:18px;height:18px;accent-color:var(--accent);flex:0 0 auto}',
    '.dgu-mixed{color:var(--muted);font-style:italic}',

    /* ---- §6.4 the repeating list field [v3.2] ----
       The row is a grid whose columns come from the declaration
       (--dgu-list-cols) plus one auto column for the row actions. Above md the
       column names are written once in a header strip; below md that strip is
       hidden and each cell carries its own name, because three number boxes
       side by side on a 390 px screen is not a form, it is a puzzle. */
    '.dgu-field.list .dgu-frow{display:block}',
    '.dgu-field.list .dgu-frow>.dgu-fctl{flex:1 1 auto;width:100%;padding:0;border:0;background:transparent;min-height:0}',
    '.dgu-list{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.dgu-list-h,.dgu-list-row{display:grid;gap:var(--sp-2);align-items:center;min-width:0;',
    'grid-template-columns:var(--dgu-list-cols,minmax(0,1fr)) auto}',
    '.dgu-list-h{font:500 var(--fs-micro)/1.4 var(--font);color:var(--muted);',
    'text-transform:uppercase;letter-spacing:.06em}',
    '.dgu-list-h span,.dgu-list-c{min-width:0;overflow-wrap:anywhere}',
    '.dgu-list-rows{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.dgu-list-c{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.dgu-list-cl{display:none;font:500 var(--fs-micro)/1.3 var(--font);color:var(--muted)}',
    '.dgu-list-row .dgu-fctl{width:100%;min-width:0}',
    /* v3.4 §6.4.1 — a derived cell reads as a value, not as a box you may
       type in: dashed edge, no hover accent, tabular figures, and the
       number pushed to the right where a number belongs. */
    '.dgu-list-row .dgu-list-d{display:flex;align-items:center;justify-content:flex-start;',
    'background:transparent;border:1px dashed var(--line);color:var(--ink);cursor:default}',
    '.dgu-list-row .dgu-list-d.num{justify-content:flex-end;font-variant-numeric:tabular-nums}',
    '.dgu-list-row .dgu-list-d>span{min-width:0;overflow:hidden;text-overflow:ellipsis;',
    'white-space:nowrap}',
    '.dgu-list-row .dgu-list-d:hover{border-color:var(--line)}',
    '.dgu-list-row .dgu-list-d.ok{color:var(--ok)}',
    '.dgu-list-row .dgu-list-d.warn{color:var(--warn)}',
    '.dgu-list-row .dgu-list-d.bad{color:var(--bad);border-color:var(--bad)}',
    '.dgu-list-a{display:flex;gap:4px;align-items:center;justify-content:flex-end}',
    '.dgu-list-a .dgu-btn.icon{width:var(--ctl-h)}',
    '.dgu-list-empty{margin:0;font:400 var(--fs-small)/1.4 var(--font);color:var(--muted)}',
    '.dgu-list-add{align-self:flex-start}',
    '@media(max-width:768px){.dgu-app .dgu-list-h{display:none}',
    '.dgu-app .dgu-list-row{grid-template-columns:minmax(0,1fr)}',
    '.dgu-app .dgu-list-cl{display:block}',
    '.dgu-app .dgu-list-row{padding:var(--sp-2);border:1px solid var(--line);',
    'border-radius:var(--radius-sm);background:var(--panel-2)}',
    '.dgu-app .dgu-list-a{justify-content:flex-start}',
    '.dgu-app .dgu-list-a .dgu-btn{min-height:var(--tap)}',
    '.dgu-app .dgu-list-a .dgu-btn.icon{width:var(--tap)}}'
  ].join('');

  /* v3.4 §19 — which grid areas each archetype's template actually names.
     Read by App.build to keep the answer surface inside its own layout; the
     lists are exactly the `grid-template-areas` above, minus `strip`, which is
     the runtime's own and never a slot a tool asks for. */
  var LAYOUT_AREAS = {
    calculator: ['inputs', 'stage', 'results', 'dock', 'footer'],
    studio:     ['inputs', 'stage', 'detail', 'results', 'dock', 'footer'],
    wizard:     ['nav', 'inputs', 'stage', 'results', 'footer'],
    reference:  ['nav', 'stage', 'results', 'footer']
  };

  var SHELL_CSS2 = [
    /* ---- results ---- */
    '.dgu-tiles{display:grid;gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '.dgu-tile{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius-sm);',
    'padding:var(--sp-3);display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.dgu-tile-l{font:500 var(--fs-micro)/1.3 var(--font);text-transform:uppercase;letter-spacing:.06em;',
    'color:var(--muted);overflow-wrap:anywhere}',
    '.dgu-tile-v{font:650 20px/1.2 var(--font);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
    '.dgu-tile-u{font:400 var(--fs-small)/1 var(--font);color:var(--muted)}',
    '.dgu-tile.ok .dgu-tile-v{color:var(--ok)}.dgu-tile.warn .dgu-tile-v{color:var(--warn)}',
    '.dgu-tile.bad .dgu-tile-v{color:var(--bad)}',
    '.dgu-verdict{padding:var(--sp-3);border-radius:var(--radius-sm);border:1px solid var(--line);',
    'background:var(--panel-2);font-weight:500}',
    '.dgu-verdict.ok{background:var(--ok-bg);border-color:var(--ok);color:var(--ok)}',
    '.dgu-verdict.warn{background:var(--warn-bg);border-color:var(--warn);color:var(--warn)}',
    '.dgu-verdict.bad{background:var(--bad-bg);border-color:var(--bad);color:var(--bad)}',
    '.dgu-table-wrap{overflow-x:auto;min-width:0;-webkit-overflow-scrolling:touch}',
    '.dgu-table{border-collapse:collapse;width:100%;font-size:var(--fs-label)}',
    '.dgu-table th,.dgu-table td{padding:6px var(--sp-2);text-align:left;border-bottom:1px solid var(--line);',
    'white-space:nowrap}',
    '.dgu-table th{font:650 var(--fs-micro)/1.4 var(--font);text-transform:uppercase;',
    'letter-spacing:.06em;color:var(--muted)}',
    '.dgu-table td.num{text-align:right;font-variant-numeric:tabular-nums}',

    /* ---- v3.4 §19: the lookup answer — the filter state and the entry ---- */
    '.dgu-filterbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);',
    'padding-bottom:var(--sp-1,4px)}',
    '.dgu-filterbar-c{font:500 var(--fs-micro)/1.3 var(--font);text-transform:uppercase;',
    'letter-spacing:.06em;color:var(--muted)}',
    '.dgu-filterbar-c b{font:650 var(--fs-label)/1.3 var(--font);color:var(--ink);',
    'font-variant-numeric:tabular-nums;text-transform:none;letter-spacing:0}',
    '.dgu-fchip{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;',
    'padding:2px var(--sp-2);border:1px solid var(--line);border-radius:999px;',
    'background:var(--panel-2);font:400 var(--fs-small)/1.5 var(--font);color:var(--ink)}',
    '.dgu-fchip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.dgu-fchip b{font-weight:650}',
    /* the ✕ is a 44 px target (§16) without a 44 px chip: an invisible
       pseudo-element carries the hit area, the drawn glyph stays small */
    '.dgu-fchip button{position:relative;flex:0 0 auto;border:0;background:none;padding:0;',
    'margin:0 -2px 0 0;width:18px;height:18px;line-height:1;cursor:pointer;color:var(--muted);',
    'border-radius:999px;font:400 13px/1 var(--font)}',
    '.dgu-fchip button::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;',
    'transform:translate(-50%,-50%)}',
    '.dgu-fchip button:hover{color:var(--bad)}',
        '.dgu-entry{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.dgu-entry-k{font:500 var(--fs-micro)/1.3 var(--font);text-transform:uppercase;',
    'letter-spacing:.06em;color:var(--muted)}',
    '.dgu-entry-t{margin:0;font:650 var(--fs-section)/1.3 var(--font);color:var(--ink);',
    'overflow-wrap:anywhere}',
    '.dgu-entry-s{margin:0;font:400 var(--fs-label)/1.5 var(--font);color:var(--ink)}',
    '.dgu-dl{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:2px var(--sp-3);',
    'margin:0;align-items:baseline}',
    '.dgu-dl dt{font:400 var(--fs-small)/1.6 var(--font);color:var(--muted);overflow-wrap:anywhere}',
    '.dgu-dl dd{margin:0;font:400 var(--fs-label)/1.6 var(--font);color:var(--ink);',
    'overflow-wrap:anywhere}',
    '.dgu-dl dd.num{font-variant-numeric:tabular-nums}',
    '.dgu-dl dd.ok{color:var(--ok)}.dgu-dl dd.warn{color:var(--warn)}.dgu-dl dd.bad{color:var(--bad)}',
    '.dgu-dl dd small{display:block;font:400 var(--fs-micro)/1.4 var(--font);color:var(--muted)}',

    /* ---- state rendering ---- */
    '.dgu-app[data-state="computing"] .dgu-r-results .dgu-tile-v,',
    '.dgu-app[data-state="stale"] .dgu-r-results .dgu-tile-v{opacity:.45}',
    '.dgu-state{display:flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-small);color:var(--muted)}',
    '.dgu-state.stale{color:var(--warn)}.dgu-state.error{color:var(--bad)}',
    '.dgu-skel{background:linear-gradient(90deg,var(--line),var(--panel-2),var(--line));',
    'background-size:200% 100%;animation:dgu-sk 1.4s linear infinite;border-radius:var(--radius-sm);',
    'height:1em;min-width:3em}',
    '@keyframes dgu-sk{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '.dgu-empty{padding:var(--sp-4);border:1px dashed var(--line);border-radius:var(--radius-sm);',
    'color:var(--muted);font-size:var(--fs-label);background:var(--panel-2)}',
    '.dgu-fail{padding:var(--sp-4);border:1px solid var(--bad);background:var(--bad-bg);',
    'border-radius:var(--radius-sm);color:var(--bad)}',

    /* ---- mobile sticky result strip ---- */
    /* v3.6.1 D3 — the strip WRAPS. It was a scroll container with
       `scrollbar-width:none`, `::-webkit-scrollbar{display:none}` and no edge
       fade: content past the right edge was reachable only by a swipe with
       nothing on screen to say it was there. That is the same defect the
       `.dgu-tabs` C3 waivers name, and on a phone it was hiding the headline
       number — measured in German, 10 of the 14 tools the L4 strip covers
       overflow, worst 210 px ("Höchste Auflagerausnutzung" on pipesupports),
       plus ~20 tools that already had a strip (worst 363 px on ontvochtiging).
       xenon.html had been carrying the fix in its own stylesheet since it was
       ported — `.dgu-app .dgu-strip{flex-wrap:wrap}` — and is the one tool in
       the tree with zero strip overflow in both languages. One tool doing the
       framework's job is the framework's bug. A second row of tiles costs about
       40 px of a phone screen; a hidden answer costs the whole tool. */
    '.dgu-strip{position:sticky;top:var(--dgu-head-h,60px);z-index:var(--z-sticky);',
    'display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-3);padding:var(--sp-2) var(--sp-3);',
    'background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-sm)}',
    /* a single tile whose own label is wider than the phone still has to give:
       break-word breaks only a word that cannot fit alone, unlike `anywhere`,
       which would hyphen-less-split every label it could */
    '.dgu-strip-l,.dgu-strip-v{overflow-wrap:break-word}',
    '.dgu-strip-i{display:flex;flex-direction:column;flex:0 1 auto;min-width:0;max-width:100%}',
    '.dgu-strip-l{font:500 var(--fs-micro)/1.2 var(--font);color:var(--muted);text-transform:uppercase;',
    'letter-spacing:.05em}',
    '.dgu-strip-v{font:650 var(--fs-label)/1.3 var(--font);font-variant-numeric:tabular-nums}',

    /* ---- tabs and steps ---- */
    '.dgu-tabs{display:flex;gap:var(--sp-1);overflow-x:auto;scrollbar-width:none;',
    'border-bottom:1px solid var(--line);padding-bottom:2px;position:relative}',
    '.dgu-tabs::-webkit-scrollbar{display:none}',
    '.dgu-tab{flex:0 0 auto;border:0;background:transparent;color:var(--muted);cursor:pointer;',
    'padding:var(--sp-2) var(--sp-3);min-height:var(--ctl-h);font:500 var(--fs-label)/1 var(--font);',
    'border-bottom:2px solid transparent;white-space:nowrap;border-radius:var(--radius-sm) var(--radius-sm) 0 0}',
    '.dgu-tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent);font-weight:650}',
    '.dgu-tab:hover{background:var(--weak)}',
    '.dgu-steps{display:flex;flex-direction:column;gap:2px}',
    '.dgu-step{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-2);border-radius:var(--radius-sm);',
    'border:0;background:transparent;cursor:pointer;text-align:left;font:500 var(--fs-label)/1.3 var(--font);',
    'color:var(--muted);min-height:var(--ctl-h);width:100%}',
    '.dgu-step[aria-current="step"]{background:var(--weak);color:var(--accent)}',
    '.dgu-step-n{flex:0 0 auto;width:22px;height:22px;border-radius:var(--radius-pill);',
    'background:var(--panel-2);border:1px solid var(--line);display:grid;place-items:center;',
    'font:650 var(--fs-micro)/1 var(--font)}',
    '.dgu-step-t{min-width:0;overflow-wrap:anywhere}',

    /* ---- stage ---- */
    '.dgu-stage{position:relative;background:var(--panel);border:1px solid var(--line);',
    'border-radius:var(--radius-md);overflow:hidden;min-height:260px;display:flex;flex-direction:column}',
    '.dgu-stage-body{position:relative;flex:1 1 auto;min-height:0}',
    /* v3.6.4 — canonical launch/control strip immediately below a primary stage. */
    '.dgu-stage-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);',
    'padding:var(--sp-3);background:var(--panel);border:1px solid var(--line);',
    'border-radius:var(--radius-md);min-width:0}',
    '.dgu-stage-actions>.dgu-hint{flex:1 1 100%;margin:0}',
    '.dgu-stage-actions .dgu-btn{flex:0 0 auto}',
    '.dgu-stage-body>canvas,.dgu-stage-body>svg{display:block;width:100%;height:100%}',
    '.dgu-stage-tools{position:absolute;right:var(--sp-2);top:var(--sp-2);display:flex;gap:var(--sp-1);',
    'z-index:2}',
    '.dgu-stage-cap{padding:var(--sp-2) var(--sp-3);font-size:var(--fs-small);color:var(--muted);',
    'border-top:1px solid var(--line)}',
    '.dgu-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;',
    'clip:rect(0 0 0 0);white-space:nowrap;border:0}',

    /* ---- sticky action bar (below md) ---- */
    '.dgu-actionbar{position:fixed;left:0;right:0;z-index:var(--z-dock);display:none;gap:var(--sp-2);',
    'padding:var(--sp-2) var(--sp-3);background:var(--panel);border-top:1px solid var(--line);',
    'bottom:calc(var(--dgu-safe-bottom) + env(safe-area-inset-bottom,0px))}',
    '@media(max-width:768px){.dgu-app[data-compute="run"] .dgu-actionbar{display:flex}}',
    '.dgu-actionbar .dgu-btn{flex:1 1 auto}',

    /* ---- learn ---- */
    '.dgu-q{flex:0 0 auto;width:20px;height:20px;border-radius:var(--radius-pill);border:1px solid var(--line);',
    'background:var(--panel);color:var(--muted);font:650 11px/1 var(--font);cursor:pointer;',
    'display:inline-grid;place-items:center;padding:0}',
    '.dgu-q:hover{border-color:var(--accent);color:var(--accent);background:var(--weak)}',
    '@media(max-width:768px){.dgu-app .dgu-q{width:28px;height:28px}}',
    '.dgu-app[data-learn="on"] [data-learn-topic]{outline:1px dashed var(--accent);outline-offset:3px;',
    'border-radius:var(--radius-sm)}',
    '.dgu-app[data-learn="on"] .dgu-q{border-color:var(--accent);color:var(--accent);background:var(--weak)}',
    '.dgu-learnbar{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);',
    'background:var(--weak);color:var(--accent);border-radius:var(--radius-sm);font-size:var(--fs-small)}',

    /* ---- popover ---- */
    '.dgu-pop{position:fixed;z-index:var(--z-popover);max-width:min(360px,calc(100vw - 24px));',
    'background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius-md);',
    'box-shadow:var(--shadow);padding:var(--sp-3);font:400 var(--fs-label)/1.5 var(--font)}',
    '.dgu-pop h3{font:650 var(--fs-label)/1.3 var(--font);margin:0 0 4px}',
    '.dgu-pop p{margin:0 0 var(--sp-2)}.dgu-pop p:last-child{margin-bottom:0}',
    '.dgu-pop a{color:var(--accent)}',
    '.dgu-pop-x{position:absolute;top:4px;right:4px}',

    /* ---- dialog ---- */
    '.dgu-dialog{border:0;padding:0;background:transparent;max-width:min(720px,calc(100vw - 24px));',
    'width:100%;color:var(--ink)}',
    '.dgu-dialog::backdrop{background:rgba(0,0,0,.48)}',
    '.dgu-dialog-p{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-md);',
    'box-shadow:var(--shadow);padding:var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-3);',
    'max-height:min(760px,88vh);overflow:auto;font:400 var(--fs-body)/1.55 var(--font)}',
    '.dgu-dialog-h{display:flex;align-items:flex-start;gap:var(--sp-3)}',
    '.dgu-dialog-t{font:650 18px/1.3 var(--font);flex:1 1 auto;min-width:0}',
    '.dgu-dialog-a{display:flex;gap:var(--sp-2);justify-content:flex-end;flex-wrap:wrap}',

    /* ---- tour ---- */
    '.dgu-tour{position:fixed;z-index:var(--z-tour);width:min(360px,calc(100vw - 24px));',
    'background:var(--panel);border:1px solid var(--accent);border-radius:var(--radius-md);',
    'box-shadow:var(--shadow);padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);',
    'font:400 var(--fs-label)/1.5 var(--font)}',
    '.dgu-tour h3{font:650 var(--fs-body)/1.3 var(--font)}',
    '.dgu-tour-n{font-size:var(--fs-micro);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}',
    '.dgu-tour-a{display:flex;gap:var(--sp-2);align-items:center;margin-top:var(--sp-1)}',
    '.dgu-tour-a .spacer{flex:1 1 auto}',
    '.dgu-spot{position:fixed;z-index:calc(var(--z-tour) - 1);border:2px solid var(--accent);',
    'border-radius:var(--radius-sm);pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.28)}',

    /* ---- misc ---- */
    '.dgu-footer{font-size:var(--fs-small);color:var(--muted)}',
    '.dgu-footer details{border:1px solid var(--line);border-radius:var(--radius-sm);padding:var(--sp-2) var(--sp-3);',
    'background:var(--panel)}',
    '.dgu-footer summary{cursor:pointer;font-weight:500;color:var(--ink)}',
    '.dgu-kbd{font:500 var(--fs-micro)/1 var(--font-mono);border:1px solid var(--line);',
    'border-radius:4px;padding:2px 5px;background:var(--panel-2)}'
  ].join('');

  /* ================================================== CONSOLIDATED REPAIRS

     Four defects that 43, 37, 10 and 9 of the ported tools each repaired by
     hand in their own <style>. See /root/LOCAL_PATCHES.md for the file lists.
     This block is concatenated AFTER SHELL_CSS/SHELL_CSS2 into the same
     `dgu-shell` sheet, so each rule beats the framework's own rule by order
     at the lowest specificity that does the job — a tool that repaired the
     same defect itself, with the same or higher specificity, still wins,
     and every tool rule found in the deploy is `!important` or carries an
     extra `.dgu-app`, so none of them is demoted here. */
  var REPAIR_CSS = [
    /* R1 hidden-collapse (43 files, e.g. beam_diagrams.html: "[hidden] does not
       collapse a .dgu-field or a .dgu-panel"; moodydiagram.html: "a field made
       invisible by a `visible` predicate still occupies the column").
       The framework writes the hidden ATTRIBUTE from Field.sync and
       Panel.checkEmpty, but its own class rules set `display`, which beats the
       user-agent [hidden] rule. Only framework-owned classes are named, so a
       tool's own hidden-but-displayed element is left exactly as it was. */
    '.dgu-field[hidden],.dgu-panel[hidden],.dgu-panel-h[hidden],.dgu-panel-actions[hidden],',
    '.dgu-panel-note[hidden],.dgu-fields[hidden],.dgu-flabel[hidden],.dgu-frow[hidden],',
    '.dgu-seg[hidden],.dgu-toggle[hidden],.dgu-err[hidden],.dgu-hint[hidden],',
    '.dgu-tiles[hidden],.dgu-tile[hidden],.dgu-table-wrap[hidden],.dgu-verdict[hidden],',
    '.dgu-empty[hidden],.dgu-state[hidden],.dgu-strip[hidden],.dgu-strip-i[hidden],',
    '.dgu-tabs[hidden],.dgu-tab[hidden],.dgu-steps[hidden],.dgu-step[hidden],',
    '.dgu-stage[hidden],.dgu-stage-body[hidden],.dgu-stage-tools[hidden],.dgu-stage-cap[hidden],',
    '.dgu-head[hidden],.dgu-head-l[hidden],.dgu-head-r[hidden],.dgu-home[hidden],',
    '.dgu-btn[hidden],.dgu-chip[hidden],.dgu-q[hidden],.dgu-learnbar[hidden],',
    '.dgu-main[hidden],.dgu-chromedock[hidden],.dgu-tour[hidden],.dgu-pop[hidden]',
    '{display:none}',

    /* R2 box-sizing-body-cards (37 files, e.g. klimaatcalculator.html:
       "box-sizing:border-box is applied to `.dgu-app *` only, but the tour
       card, the learn popover and the dialog are appended to <body>, so their
       padding is added outside the min(360px,100vw-24px) width and they hang
       ~30px past the right edge at 390px"). */
    '.dgu-tour,.dgu-pop,.dgu-dialog,',
    '.dgu-tour *,.dgu-pop *,.dgu-dialog *,',
    '.dgu-tour *::before,.dgu-pop *::before,.dgu-dialog *::before,',
    '.dgu-tour *::after,.dgu-pop *::after,.dgu-dialog *::after{box-sizing:border-box}',

    '@media(max-width:768px){',
    /* R3 mobile-strip-overflow (10 files, e.g. RWA_calculator.html: "the mobile
       result strip is a sticky element inside a region box of its own height,
       so it can never actually travel: the answer leaves the first screen on
       the first scroll"). Seven of the ten settled on exactly this — make the
       grid item the sticky box — so that is what is consolidated; xenon's
       `flex-wrap:wrap` is left local because wrapping makes the strip taller,
       which costs first-screen height for every other tool. */
    /* v3.2.1 — R3 says the sticky box must be the GRID ITEM, and since v3.2 the
       grid item is the wrapper (§17.9). Left on the region, sticky is measured
       against the region's containing block — a `.dgu-rwrap` of exactly the
       strip's own height — so the strip cannot travel and the answer leaves the
       first screen on the first scroll, which is R3 verbatim. Below md the
       wrapper steps out of the way instead: `display:contents` makes the region
       the grid item again, so the sticky box is the item, its `top` is the one
       the tool or the framework wrote on `.dgu-r-strip`, and the ten local R3
       copies keep working. Nothing is given back by this: below md there is one
       column to travel over and, by §4.6, no splitter handle to clip. */
    '.dgu-rw-strip{display:contents}',
    '.dgu-r-strip{position:sticky;top:var(--dgu-head-h,60px);z-index:var(--z-sticky);',
    'background:var(--bg)}',
    '.dgu-strip{position:static}',

    /* R4 tap-44 (9 files, e.g. heat_exchangers.html: the mobile "rule is scoped
       to .dgu-app, which reaches neither the segmented buttons ... nor the
       tour, popover and dialog cards, which live on <body>"). The learn dot
       keeps its drawn size and gains a 44px hit area instead, which is what
       mollier, solargaincalculator and ductnetwork each chose and said why:
       "there are 28 of them on this page and 44px circles would swamp the
       labels". */
    '.dgu-sel{min-height:var(--tap)}',
    '.dgu-home{min-height:var(--tap);display:inline-flex;align-items:center}',
    '.dgu-seg button{min-height:var(--tap)}',
    '.dgu-tab{min-height:var(--tap)}',
    '.dgu-toggle{min-height:var(--tap)}',
    '.dgu-toggle input{width:24px;height:24px}',
    '.dgu-field.range .dgu-fctl{min-height:var(--tap)}',
    '.dgu-footer summary{min-height:var(--tap);display:flex;align-items:center}',
    '.dgu-q{position:relative}',
    '.dgu-q::after{content:"";position:absolute;left:50%;top:50%;width:var(--tap);',
    'height:var(--tap);transform:translate(-50%,-50%)}',
    '.dgu-tour .dgu-btn,.dgu-pop .dgu-btn,.dgu-dialog .dgu-btn{min-height:var(--tap)}',
    '}',

    /* R5 the clamp note is a notice, not an invalid state: it is shown in the
       field's live region without turning the control aria-invalid. */
    '.dgu-err.note{color:var(--warn)}'
  ].join('');

  /* ================================================================== LAYOUT */
  /* The four shapes the ports had to drop, each written at the lowest
     specificity that beats the framework's own rule, and each inert until a
     tool asks for it: a tool that already solved one of these its own way
     keeps winning. This sheet is appended last, so an equal-specificity
     framework rule earlier in the file loses to it and a tool's own more
     specific rule still wins. */
  var LAYOUT_CSS = [
    /* ---- L1 collapsible panels (spec §5 `collapsible`, never implemented) ---- */
    '.dgu-panel-h.collapsible{gap:var(--sp-1)}',
    '.dgu-panel-t>.dgu-panel-tog{display:flex;align-items:center;gap:var(--sp-2);width:100%;',
    'min-height:var(--ctl-h);padding:0;margin:0;border:0;background:transparent;color:inherit;',
    'font:inherit;letter-spacing:inherit;text-transform:inherit;text-align:left;cursor:pointer;',
    'min-width:0;overflow-wrap:anywhere}',
    '.dgu-panel-t>.dgu-panel-tog:hover{color:var(--accent)}',
    '.dgu-caret{flex:0 0 auto;width:9px;height:9px;border-right:2px solid currentColor;',
    'border-bottom:2px solid currentColor;transform:rotate(45deg) translate(-2px,-2px);',
    'transition:transform var(--motion-fast) var(--ease)}',
    '.dgu-panel[data-collapsed="true"] .dgu-caret{transform:rotate(-45deg) translate(-1px,1px)}',
    '.dgu-panel[data-collapsed="true"]{gap:0}',
    '@media(max-width:768px){.dgu-panel-t>.dgu-panel-tog{min-height:var(--tap)}}',
    '@media(prefers-reduced-motion:reduce){.dgu-caret{transition:none}}',

    /* ---- L2 the sticky notice (kernnormenwijzer 21%, normenwijzer 22%) ---- */
    '.dgu-notice{display:flex;align-items:flex-start;gap:var(--sp-2);min-width:0;',
    'padding:var(--sp-2) var(--sp-3);background:var(--panel);color:var(--ink);',
    'border:1px solid var(--line);border-left:3px solid var(--accent);',
    'border-radius:var(--radius-sm);font-size:var(--fs-small);line-height:1.45}',
    '.dgu-notice[hidden]{display:none}',
    '.dgu-notice[data-tone="warn"]{border-left-color:var(--warn);background:var(--warn-bg)}',
    '.dgu-notice[data-tone="bad"]{border-left-color:var(--bad);background:var(--bad-bg)}',
    '.dgu-notice[data-tone="ok"]{border-left-color:var(--ok);background:var(--ok-bg)}',
    '.dgu-notice[data-tone="info"]{border-left-color:var(--accent);background:var(--weak)}',
    '.dgu-notice[data-tone="warn"] .dgu-notice-mark{background:var(--warn)}',
    '.dgu-notice[data-tone="bad"] .dgu-notice-mark{background:var(--bad)}',
    '.dgu-notice[data-tone="ok"] .dgu-notice-mark{background:var(--ok)}',
    '.dgu-notice[data-tone="info"] .dgu-notice-mark{background:var(--accent)}',
    '.dgu-notice-mark{flex:0 0 auto;width:8px;height:8px;margin-top:6px;border-radius:var(--radius-pill);',
    'background:currentColor;opacity:.55}',
    '.dgu-notice-b{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.dgu-notice-h{font-weight:650}',
    '.dgu-notice-tx{min-width:0;overflow-wrap:anywhere}',
    /* compact: two lines, with the rest one keyboard-reachable button away —
       the whole text stays in the DOM, so a screen reader is never clamped */
    '.dgu-notice[data-clamped="true"] .dgu-notice-tx{display:-webkit-box;-webkit-box-orient:vertical;',
    '-webkit-line-clamp:2;line-clamp:2;overflow:hidden}',
    '.dgu-notice-a{flex:0 0 auto;display:flex;align-items:center;gap:var(--sp-1)}',
    '.dgu-notice-a .dgu-btn{min-height:calc(var(--ctl-h) - 8px);font-size:var(--fs-micro);padding:0 var(--sp-2)}',
    '.dgu-notice-a .dgu-btn.icon{width:calc(var(--ctl-h) - 8px);padding:0}',
    /* sticky sits under the shell header, never over it */
    '.dgu-notice[data-sticky="true"]{position:sticky;z-index:calc(var(--z-sticky) - 1);',
    'top:calc(var(--dgu-head-h,64px) + var(--dgu-notice-top,4px))}',
    '@media(max-width:768px){.dgu-notice-a .dgu-btn{min-height:var(--tap)}',
    '.dgu-notice-a .dgu-btn.icon{width:var(--tap)}',
    '.dgu-notice[data-sticky="true"]{top:calc(var(--dgu-head-h,64px) + var(--dgu-strip-h,0px)',
    ' + var(--dgu-notice-top,4px))}}',

    /* ---- L3 independently scrolling regions ----
       §5 forbids a PANEL scrolling inside itself "unless the archetype's
       region does" — so the scroll belongs to the region, and only where the
       archetype is genuinely multi-column. Five ports lost the same thing:
         neutron_transport: "Independently scrolling side panels … the
           29-material palette could be scrolled without moving the drawing.
           The whole page scrolls now."
         gesloten-atmosfeer: "Independent scrolling of the three columns above
           1300 px … so you could scroll the charts with the inputs standing
           still."
         ontvochtiging: "The three columns scrolled independently at >=1280 px
           … above 1120 px the framework keeps the results column sticky, which
           covers the same need, but between 768 and 1120 px it does not."
         waterhammer: "The inputs column no longer scrolls independently of the
           page … so the drawings stayed put while you scrolled 2 500 px of
           controls."
         solargaincalculator: "The results pane no longer scrolls independently
           of the 3-D view."
       overflow-y:auto, never hidden (§1 rule 8): every control stays reachable,
       and the pane is bounded so its own bottom edge clears the shared chrome
       rather than hiding controls under it. Single column — a phone — never
       gets a pane: the document scrolls as one, exactly as it does today. */
    /* v3.2 P9b — the pane's clip edge now lands on the bottom edge of the
       screen, not 87 px above it. It used to stop short of the shared chrome,
       which left a band of screen where the pane's own content was laid out,
       clipped, and therefore invisible AND unclickable while still sitting
       inside the viewport (measured on normenwijzer: a `.dgu-q` 51 px below the
       fold). Clipped content must be off-screen content. The chrome is
       reserved as scroll padding instead, so the tail of a pane can always be
       scrolled clear of the bar rather than resting under it. */
    /* v3.6.1 D2 — the reservation is now CONDITIONAL, and it is split off from
       the stickiness. Sticking a short column to the top of the screen is a win
       and costs nothing; capping it, giving it a scrollbar gutter and reserving
       the phone's home-bar under it costs 15 px of width and up to 95 px of
       height, and on a column that has nothing to scroll every one of those
       pixels is dead. Because `results` sits in a full-width row BENEATH the
       columns in the studio and reference templates, the dead height pushed the
       first number DOWN — the opposite of what the pane release was for
       (measured: trussframe results +60 px at 1440, kernnormenwijzer +95 at
       768). The CSS-only attempt at this — folding the reservation into
       max-height — was tried and reverted: `overflow` clips at the padding box,
       so that padding was SHOWING content, and shortening the pane by it
       clipped learn dots out of four tools and took fwgate RED on 10 cells.
       The decision needs a measurement, so it is made in JS: `applyPanes()`
       compares each declared region's natural height against the cap and hangs
       `data-dgu-pane` only where the content really does overflow. Declared
       state is set at scrollRegion() time, so a page whose JS dies mid-boot
       keeps v3.6 behaviour rather than losing the pane. */
    /* v3.6.1 — the pane sticks by its WRAPPER, not by the region. The wrapper is
       the grid item (§17.9) and it was `align-self:stretch`, so on an archetype
       where a rail SPANS rows — `reference` is `"nav stage" "nav results"` —
       the item is as tall as both rows put together while the region inside it
       is capped at one screen. Anything absolutely placed in the wrapper then
       inherits that height, and the splitter handle is placed exactly there: on
       normenwijzer the handle measured **11 × 140 611 px**, with all three of
       its hit-test points 20 000–119 000 px below the fold, and fwgate took the
       framework RED for a control no pointer can reach. Sticking the wrapper
       and letting it shrink to its content makes the handle exactly as tall as
       the column it drags and puts it on screen wherever that column is. The
       region keeps the cap and the scrollbar; it no longer needs to stick,
       because the box around it does. */
    '@media(min-width:768px){.dgu-panebox:has(>.dgu-region[data-dgu-scroll="md"]){',
    'display:block;min-width:0;position:sticky;top:calc(var(--dgu-head-h,64px) + var(--sp-4))}}',
    '@media(min-width:1120px){.dgu-panebox:has(>.dgu-region[data-dgu-scroll="lg"]){',
    'display:block;min-width:0;position:sticky;top:calc(var(--dgu-head-h,64px) + var(--sp-4))}}',
    /* the pinned action's own height is reserved INSIDE the pane, the same way
       the phone's home bar is: a bar that floats over the column would other-
       wise hide whatever is passing under it at that scroll offset, and fwgate
       found it doing exactly that — a learn dot under the run bar on
       probabilisticrisk and flangejoint at 1280. The bar carries an equal
       negative bottom margin, so the reservation costs nothing at the end of
       the scroll, where the bar and the space it booked coincide. */
    '@media(min-width:768px){.dgu-region[data-dgu-scroll="md"][data-dgu-pane]{',
    'max-height:calc(100vh - var(--dgu-head-h,64px) - var(--sp-4));',
    'padding-bottom:calc(var(--dgu-safe-bottom,0px) + var(--sp-4) + var(--dgu-primary-h,0px));',
    'overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}}',
    '@media(min-width:1120px){.dgu-region[data-dgu-scroll="lg"][data-dgu-pane]{',
    'max-height:calc(100vh - var(--dgu-head-h,64px) - var(--sp-4));',
    'padding-bottom:calc(var(--dgu-safe-bottom,0px) + var(--sp-4) + var(--dgu-primary-h,0px));',
    'overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}}',
    /* v3.7.10 — Sticky notice inside a scrolling pane.
       When a region is a scrolling pane (overflow-y:auto rules above), the region
       becomes the scroll container of its sticky notice, so top is measured from
       the pane's top edge, not the viewport. The header offset (head-h + 4px) was
       therefore applied twice: the pane box is already offset by its own sticky top,
       and the notice pinned 68-164px down inside the pane, covering its panels.
       Reset top to 0 using the same media queries and selectors as the pane overflow
       rules, so this never applies when the region is not a scroll container. */
    '@media(min-width:768px){.dgu-region[data-dgu-scroll="md"][data-dgu-pane]',
    '>.dgu-notice[data-sticky="true"]{top:0}}',
    '@media(min-width:1120px){.dgu-region[data-dgu-scroll="lg"][data-dgu-pane]',
    '>.dgu-notice[data-sticky="true"]{top:0}}',

    /* ---- L4 splitters ---- */
    /* the handle is absolutely placed in the grid gutter, so it costs the
       layout nothing and a tool that never asks for one sees no change */
    '.dgu-resizable{position:relative}',
    /* …and a region that is BOTH resizable and independently scrolling keeps
       its sticky position: these two restate L3 at the higher specificity the
       combination needs, rather than relying on rule order */
    '.dgu-split{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;',
    'background:transparent;border:0;padding:0;touch-action:none;',
    'transition:background var(--motion-fast) var(--ease)}',
    '.dgu-split[hidden]{display:none}',
    '.dgu-split[data-axis="x"]{top:0;bottom:0;width:11px;cursor:col-resize}',
    '.dgu-split[data-axis="x"][data-edge="end"]{right:calc(-1 * (var(--sp-4) / 2) - 5px)}',
    '.dgu-split[data-axis="x"][data-edge="start"]{left:calc(-1 * (var(--sp-4) / 2) - 5px)}',
    '.dgu-split[data-axis="y"]{left:0;right:0;bottom:0;height:11px;cursor:row-resize}',
    '.dgu-split-grip{background:var(--line);border-radius:var(--radius-pill);',
    'transition:background var(--motion-fast) var(--ease)}',
    /* v3.6.2 — 4 px, not 3. The first release of the handle shipped a 3 px bar
       in `--line` against a `--panel-2` gutter; on the shipped page it reads as
       a hairline and the report that followed said the handles had "gone", on a
       page that had two of them on screen. A control nobody can find is not
       cheaper than one that is not there, it is worse: it also takes the space. */
    '.dgu-split[data-axis="x"] .dgu-split-grip{width:4px;height:44px}',
    '.dgu-split[data-axis="x"]:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}',
    /* the handle now spans its whole grid row, which can be taller than the
       screen; the grip rides the viewport so the gesture is always in reach */
    '.dgu-split[data-axis="x"] .dgu-split-grip{position:sticky;top:calc(50vh - 19px);bottom:calc(50vh - 19px)}',
    '.dgu-split[data-axis="y"] .dgu-split-grip{height:3px;width:38px}',
    '.dgu-split:hover .dgu-split-grip,.dgu-split[data-dragging] .dgu-split-grip{background:var(--accent)}',
    '.dgu-split:focus-visible{outline:2px solid var(--accent);outline-offset:1px;border-radius:var(--radius-sm)}',
    '.dgu-split:focus-visible .dgu-split-grip{background:var(--accent)}',
    '@media(prefers-reduced-motion:reduce){.dgu-split,.dgu-split-grip{transition:none}}',

    /* ---- v3.6.2 §22.10 the fold control and the folded rail ---- */
    '.dgu-split-fold{position:absolute;z-index:4;top:6px;',
    'margin:0;width:22px;height:22px;padding:0;',
    'display:flex;align-items:center;justify-content:center;cursor:pointer;',
    'border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--panel);',
    'color:var(--muted);box-shadow:0 1px 2px rgba(0,0,0,.08);',
    'transition:background var(--motion-fast) var(--ease),color var(--motion-fast) var(--ease)}',
    '.dgu-split-fold[data-edge="end"]{right:6px}',
    '.dgu-split-fold[data-edge="start"]{left:6px}',
    '.dgu-split-fold:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}',
    '.dgu-split-fold:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    /* the chevron points the way the rail will go */
    /* The chevron points where the RAIL is about to go, not where the handle
       is. `edge="end"` is a rail on the left with its handle on its right side:
       folding takes it left, so it points left, and once folded it points right
       because that is the way back. Both pairs were inverted in the first cut
       and the screenshot is what caught it — a folded left rail offering a
       left-pointing arrow to bring it back. */
    '.dgu-split-chev{width:0;height:0;border:5px solid transparent;display:block}',
    '.dgu-split-fold[data-edge="end"] .dgu-split-chev{border-left:0;border-right:6px solid currentColor;',
    'margin-right:2px}',
    '.dgu-split-fold[data-edge="start"] .dgu-split-chev{border-right:0;border-left:6px solid currentColor;',
    'margin-left:2px}',
    '.dgu-split-fold[data-edge="end"][aria-expanded="false"] .dgu-split-chev{',
    'border-right:0;border-left:6px solid currentColor;margin:0 0 0 2px}',
    '.dgu-split-fold[data-edge="start"][aria-expanded="false"] .dgu-split-chev{',
    'border-left:0;border-right:6px solid currentColor;margin:0 2px 0 0}',
    /* a folded rail is COLLAPSED, never hidden (§4.2 S-5): its own title turns
       through 90 degrees and runs down the strip, so the reader can see what
       they put away and what the button will bring back */
    '.dgu-region[data-dgu-folded]{overflow:hidden;max-height:none;padding:0}',
    '.dgu-region[data-dgu-folded]>*{display:none}',
    '.dgu-region[data-dgu-folded]::before{content:attr(data-dgu-foldlabel);display:block;',
    'writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;overflow:hidden;',
    'padding:var(--sp-3) 0;font:650 var(--fs-label)/1 var(--font);color:var(--muted);',
    'text-transform:uppercase;letter-spacing:.08em;max-height:60vh}',
    '.dgu-panebox[data-dgu-folded]{display:block;min-width:0;position:sticky}'
  ];

  /* ================================================================= CONTENT */
  /* The six shapes the ports kept building by hand inside the results and stage
     regions. Same discipline as LAYOUT_CSS: appended last, written at the
     lowest specificity that does the job, and inert until a tool asks for it.
     Every selector is framework-owned (`.dgu-…`), so no tool's own class is
     touched and a tool that already solved one of these keeps winning. */
  var CONTENT_CSS = [
    /* ---- C1 legend, bound to the chart-series scale ---- */
    '.dgu-legend{display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-4);align-items:center;',
    'font-size:var(--fs-small);color:var(--muted);min-width:0}',
    '.dgu-legend.compact{gap:var(--sp-1) var(--sp-3);font-size:var(--fs-micro)}',
    '.dgu-legend-i{display:inline-flex;align-items:center;gap:var(--sp-2);min-width:0;',
    'max-width:100%;overflow-wrap:anywhere}',
    'button.dgu-legend-i{background:none;border:0;padding:2px 0;color:inherit;font:inherit;cursor:pointer}',
    '.dgu-legend-i.off{opacity:.45}',
    '.dgu-legend-i.off .dgu-legend-t{text-decoration:line-through}',
    '.dgu-legend-sw{flex:0 0 auto;display:inline-block}',
    '.dgu-legend-sw.line{width:18px;height:0;border-top:3px solid currentColor;border-radius:2px}',
    '.dgu-legend-sw.dot{width:10px;height:10px;border-radius:var(--radius-pill)}',
    '.dgu-legend-sw.swatch{width:14px;height:14px;border-radius:3px}',
    '.dgu-legend-t{color:var(--ink)}',
    '.dgu-legend-v{font-variant-numeric:tabular-nums}',
    '.dgu-legend[hidden]{display:none}',
    '.dgu-stage-legend{padding:var(--sp-2) 0 0}',

    /* ---- C2 the richer results table ----
       cablesizing.html: "Results.table() renders plain string/number cells: it
       has no chosen-row highlight, no dimmed failed rows and no per-row failure
       -reason cell. Those three are the tool's best affordance". */
    '.dgu-table tr.chosen>td{background:var(--weak);font-weight:650}',
    '.dgu-table tr.dim>td{color:var(--muted)}',
    '.dgu-table tr.weight>td{font-weight:650;border-top:1px solid var(--line)}',
    '.dgu-table tr.ok>td:first-child{box-shadow:inset 2px 0 0 var(--ok)}',
    '.dgu-table tr.warn>td:first-child{box-shadow:inset 2px 0 0 var(--warn)}',
    '.dgu-table tr.bad>td:first-child{box-shadow:inset 2px 0 0 var(--bad)}',
    '.dgu-table td.reason{white-space:normal;max-width:24ch;color:var(--muted);font-size:var(--fs-small)}',
    /* CLOSE-THE-LOOP 2. A cell that may hold a sentence. Two of four new tools
       lost content to `white-space:nowrap`. weldsymbols.html: "a one-sentence
       meaning in a cell would push the page sideways … I moved all prose into
       <p> nodes".  damperselect.html: "A `wizard`'s results rail is a fixed
       340 px, which makes a sentence-length cell unusable there; three of my
       tables were flagged, and in German so was the second one."
       Opt-in per cell or per head, so no existing table moves. */
    '.dgu-table th.wrap,.dgu-table td.wrap{white-space:normal;max-width:32ch}',
    '.dgu-table td.ok{color:var(--ok)}.dgu-table td.warn{color:var(--warn)}.dgu-table td.bad{color:var(--bad)}',
    /* fourier_series.html lost "The coefficient table's sticky header row … at
       N = 100 you could scroll the table against its own headers". Two modes,
       because spec section 5 forbids a panel scrolling internally above md:
       without `maxHeight` the header sticks to the page under the app header,
       so the affordance comes back with no inner scrollbar at all. */
    '.dgu-table-wrap.sticky .dgu-table th{position:sticky;top:0;z-index:1;',
    'background:var(--panel);box-shadow:inset 0 -1px 0 var(--line)}',
    /* A sticky header needs the PAGE to be the scrollport, and the base wrap is
       an x-scroller (overflow-x:auto forces overflow-y to a scrolling value, so
       the header would have no travel). `.free` is added by measurement, only
       once the table is known to fit: sticky where it can work, reachable where
       it cannot. */
    '.dgu-table-wrap.sticky.page.free{overflow:visible}',
    '.dgu-table-wrap.sticky.page.free .dgu-table th{top:var(--dgu-head-h,64px)}',
    '.dgu-table-wrap.scrolls{overflow:auto;overscroll-behavior:contain}',
    /* luchtbalans.html lost "the 'this table is wider than the screen' hint for
       the pressure-by-mode matrix … the framework's own scroll wrapper … has no
       hint line". The hint is written by measurement, never speculatively. */
    '.dgu-table-box{min-width:0;position:relative}',
    '.dgu-table-hint{display:none;font-size:var(--fs-small);color:var(--muted);',
    'padding-top:var(--sp-1);align-items:center;gap:var(--sp-2)}',
    '.dgu-table-box.wide>.dgu-table-hint{display:flex}',
    '.dgu-table-box.wide>.dgu-table-wrap{',
    '-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 24px),transparent);',
    'mask-image:linear-gradient(to right,#000 calc(100% - 24px),transparent)}',
    '.dgu-table-box.wide.end>.dgu-table-wrap{-webkit-mask-image:none;mask-image:none}',

    /* ---- C3 meter ----
       cablesizing.html: "The framework has no meter or progress component;
       tiles cannot express 'value against its own limit'." The track/fill pair
       is hand-built in cablesizing (.cs-track/.cs-bar), operatingpoint
       (.op-track/.op-fill), klimaatcalculator (.kc-track/.kc-fill),
       solargaincalculator (.wf-track/.wf-fill), ductnetwork (.dn-bar),
       iron_carbon_diagram (.icd-bar) and probabilisticrisk (.bartrack). */
    '.dgu-meters{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.dgu-meter{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-1);min-width:0}',
    '.dgu-meter-h{display:flex;align-items:baseline;gap:var(--sp-2);min-width:0;',
    'font-size:var(--fs-small);color:var(--muted)}',
    '.dgu-meter-l{min-width:0;overflow-wrap:anywhere}',
    '.dgu-meter-v{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ink);',
    'flex:0 0 auto;white-space:nowrap}',
    '.dgu-meter-track{height:var(--sp-2);background:var(--panel-2);border:1px solid var(--line);',
    'border-radius:var(--radius-pill);overflow:hidden;min-width:0;position:relative}',
    '.dgu-meter-fill{height:100%;width:0;background:var(--ok);border-radius:var(--radius-pill);',
    'transition:width var(--motion) var(--ease)}',
    '.dgu-meter.warn .dgu-meter-fill{background:var(--warn)}',
    '.dgu-meter.bad .dgu-meter-fill{background:var(--bad)}',
    '.dgu-meter.none .dgu-meter-fill{background:var(--muted);opacity:.5}',
    '.dgu-meter.accent .dgu-meter-fill{background:var(--accent)}',
    '.dgu-meter-lim{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}',
    '.dgu-meter-n{font-size:var(--fs-small);color:var(--muted)}',
    '@media(prefers-reduced-motion:reduce){.dgu-meter-fill{transition:none}}',

    /* ---- C4 transport ----
       heat2d.html: "The framework has no timeline or transport component, and a
       range Field renders its own numeric readout — it cannot show 12 h 0 min."
       debrisrunout keeps Run / Pause / Reset motion for the same reason. */
    '.dgu-transport{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);min-width:0}',
    '.dgu-transport .dgu-tp-range{flex:1 1 160px;min-width:120px;margin:0;accent-color:var(--accent)}',
    '.dgu-tp-time{font-variant-numeric:tabular-nums;font-size:var(--fs-small);color:var(--ink);',
    'flex:0 0 auto;min-width:7ch}',
    '.dgu-tp-speed{flex:0 0 auto}',
    '.dgu-transport[data-empty="1"] .dgu-tp-range,.dgu-transport[data-empty="1"] .dgu-tp-time{opacity:.5}',

    /* ---- C5 file import: a labelled button, never a bare <input type=file> ---- */
    '.dgu-file{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;',
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}',

    /* ---- C6 grouped example picker ---- */
    '.dgu-exsel{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.dgu-exsel-row{display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap;min-width:0}',
    '.dgu-exsel-row .dgu-sel{flex:1 1 160px;min-width:0}'
  ];

  /* =================================================================== TIER2 */
  /* Three measured chrome defects, each named by three or more port reports.
     Appended last so the lowest possible specificity does the job: every rule
     below is written to beat exactly one framework rule of its own and nothing
     else, so a tool that already repaired the same thing at .dgu-app-or-higher
     keeps winning. */
  var TIER2_CSS = [
    /* ---- T1 .dgu-btn{white-space:nowrap} vs an examples note ----
       debrisrunout: ".dgu-btn sets white-space:nowrap, so the prose notes that
       ui.examples() advertises cannot wrap — 513 px of horizontal overflow at
       390 px until I overrode it."  moodydiagram: "a one-sentence description
       stretched the inputs column until the whole page overflowed by 321px."
       procesklimaat: "pushed the document 350 px wide at 390 px."  ductnetwork
       measured 136 px, hydraulicnetwork 22 px; nuclideatlas saw the note
       clipped mid-word ("…down to Pb-20").  Also RWA_calculator, doppler,
       iron_carbon_diagram, kinetics, roofstormwater, kernnormenwijzer.
       One class on the button the framework itself builds, at the same 0,1,0
       specificity as .dgu-btn and later in the sheet — the least that works. */
    '.dgu-btn-wrap{white-space:normal;text-align:left;justify-content:flex-start;',
    'height:auto;min-width:0;padding:8px var(--sp-3);line-height:1.35}',
    '.dgu-btn-wrap>span{min-width:0;overflow-wrap:break-word}',

    /* ---- T2 .dgu-head-r{flex:0 0 auto} never wraps ----
       relativity: ".dgu-head-r is flex:0 0 auto with no wrap and no max-width,
       so a single tool action in the header pushes the language, learn and
       theme controls past the viewport: 50 px of horizontal overflow at 390
       px."  roomacoustics measured 123 px, gasdynamics 354 px,
       wallthermalcalculator 175 px, debrisrunout 8 px.  The group still sits
       hard right and still refuses to grow; it may now give way and wrap
       instead of pushing the document sideways. */
    '.dgu-head .dgu-head-r{flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;min-width:0;max-width:100%}',

    /* ---- T3 the calculator and studio grids have no `nav` area ----
       gasdynamics: "The calculator archetype's grid-template-areas has no `nav`
       area, so a calculator with a tab strip puts the nav region in an implicit
       track and the three explicit columns collapse to slivers."
       wallthermalcalculator measured it: "grid-template-columns: 340px 268.7px
       360px 0px 359.3px and a stage squeezed to 269 px."  cfd, for studio:
       "grid-template-areas for layout:'studio' has no nav area at any of the
       three breakpoints, so a tab strip placed in the nav slot lands in an
       implicit row at the very bottom of the page"; outdoornoise the same.
       Guarded by data-nav, which App.useRegion sets only when something is
       actually placed in the nav region — so the 52 pages that have no nav
       keep byte-identical templates and gain no extra row gap. */
    '.dgu-app[data-nav][data-layout="calculator"] .dgu-main{',
    'grid-template-areas:"strip" "nav" "inputs" "stage" "results" "dock" "footer"}',
    '@media(min-width:768px){.dgu-app[data-nav][data-layout="calculator"] .dgu-main{',
    'grid-template-areas:"nav nav" "inputs stage" "inputs results" "dock dock" "footer footer"}}',
    '@media(min-width:1120px){.dgu-app[data-nav][data-layout="calculator"] .dgu-main{',
    'grid-template-areas:"nav nav nav" "inputs stage results" "dock dock dock" "footer footer footer"}}',
    '.dgu-app[data-nav][data-layout="studio"] .dgu-main{',
    'grid-template-areas:"nav" "stage" "inputs" "detail" "results" "dock" "footer"}',
    '@media(min-width:768px){.dgu-app[data-nav][data-layout="studio"] .dgu-main{',
    'grid-template-areas:"nav nav" "inputs stage" "inputs results" "inputs detail" "dock dock" "footer footer"}}',
    '@media(min-width:1120px){.dgu-app[data-nav][data-layout="studio"] .dgu-main{',
    'grid-template-areas:"nav nav nav" "inputs stage detail" "inputs results detail" "dock dock dock" "footer footer footer"}}'
  ];

  /* ================================================================= FIELDS */

  function Field(app, def, host) {
    this.app = app;
    this.def = def;
    this.id = def.id || uid('f');
    this.host = host;
    this.node = null;
    this.control = null;
    this.errNode = null;
    /* TIER2 T7: a label or a unit declared as a function is DISPLAY-ONLY and is
       re-read on every sync. A dynamic unit therefore never converts — it is a
       word beside the control, and the value in state is the tool's own.
       cablesizing: "Dynamic labels and units (Load -> Design current, kW -> kVA
       -> A; Nominal voltage L-L -> L-N; Ambient air -> Ground temperature) are
       patched into the framework's label and unit slots from panel sync hooks
       … Field builds its label and unit slot once and never re-reads the thunk
       on sync, so a declaration alone cannot express a unit that depends on
       another field."  steam_tables: "A field's unit slot and label are
       rendered once at build time, so a unit that depends on another field
       cannot follow it … Upstream, `unit` and `label` should accept a thunk
       resolved on sync."  thermodynamiccycles patched the same slots by hand.
       A static string or {en:…,de:…} unit keeps the unit registry exactly as
       it is today. */
    this.unitEntry = isFn(def.unit) ? null : unitFor(def, app.opts.units && app.opts.units.overrides);
    this.build();
  }

  /* the label as it reads right now; the thunk gets the field context */
  Field.prototype.labelNow = function () {
    var d = this.def;
    var v = isFn(d.label) ? call(d.label, [this.ctx()], 'field.label') : d.label;
    if (v == null) v = d.key || '';
    return pick(v, this.app.lang);
  };

  /* the unit slot as it reads right now */
  Field.prototype.unitNow = function () {
    var d = this.def;
    if (!isFn(d.unit)) return unitLabel(this.unitEntry, d.unit);
    var v = call(d.unit, [this.ctx()], 'field.unit');
    return v == null ? '' : pick(v, this.app.lang);
  };

  Field.prototype.t = function (k) { return this.app.t(k); };

  Field.prototype.ctx = function () { return this.app.fieldCtx(); };

  Field.prototype.readState = function () {
    var d = this.def;
    if (isFn(d.get)) return call(d.get, [this.app.state, this.ctx()], 'field.get');
    return pathGet(this.app.state, d.key);
  };

  Field.prototype.writeState = function (v) {
    var d = this.def;
    if (isFn(d.set)) call(d.set, [v, this.app.state, this.ctx()], 'field.set');
    else pathSet(this.app.state, d.key, v);
  };

  /* which='min'|'max' -> the bound in DISPLAY units, or null if not declared.
     An explicit minDisplay/maxDisplay is authored in display units already and
     is taken as given; d.min/d.max are SI, like every other value the field
     handles, and are converted. */
  Field.prototype.displayBound = function (which) {
    var d = this.def;
    var explicit = which === 'min' ? d.minDisplay : d.maxDisplay;
    if (explicit != null) return explicit;
    var si = which === 'min' ? d.min : d.max;
    if (si == null || typeof si !== 'number' || !isFinite(si)) return null;
    return this.unitEntry ? toDisplay(si, this.unitEntry) : si;
  };

  /* Whether this field brings an out-of-range entry back to the nearest allowed
     value. cablesizing, xenon and thermodynamiccycles each REFUSE out-of-range
     input instead — thermodynamiccycles.html says so in its port report: "This
     tool refuses out-of-range input with a message instead of clamping ...
     Declaring min/max would have turned every refusal into a silent clamp and
     changed both the record and the benchmarked behaviour." Those tools kept
     min/max off the field to avoid the clamp, and so lost the browser's own
     range semantics as well. `clamp:false` (per field, or opts.clamp:false for
     the app) separates the two: the native attributes are still written, the
     value is passed through untouched, and the tool's own validate/guard
     decides. Default is true, so nothing that exists today changes. */
  Field.prototype.clamps = function () {
    if (this.def.clamp === false) return false;
    if (this.def.clamp === true) return true;
    return this.app.opts.clamp !== false;
  };

  /* ------------------------------------------------- 6.4 the list field ----
     The repeater. `PORT_REPORTS.json` has five tools asking for it in the same
     words and three of them building it by hand: decayheat's composition and
     structural repeaters, fourier_series' manual harmonics (its report: "the
     sole reason lookups (9) and listeners (17) did not fall"), roomacoustics'
     surface-material rows. It is declared, not built:

       { id:'f-harm', key:'manual', type:'list', label:{...},
         row: [ {key:'n',     type:'number', label:{...}, min:1, step:1},
                {key:'amp',   type:'number', label:{...}, step:0.05},
                {key:'phase', type:'number', label:{...}, step:5, unit:'deg'} ],
         newRow: rows => ({n: rows.length+1, amp:0.5, phase:0}),
         minRows:0, maxRows:64, reorder:true,
         validateRow:(row,i,ctx)=> row.n>0 || {en:'n must be positive'} }

     The value lives in the tool's own state as an array of plain objects, at
     `key` like any other field, and the array is mutated in place - never
     replaced - so a tool that captured a reference to it at boot keeps it
     (8.3, the state-orphan rule). A cell declaring `unit:` converts exactly as
     a field does: SI in state, display units in the box. */

  /* v3.4 §6.4.1 — the read-only / derived cell. TWO of the four tools built
     from AUTHORING.md alone by agents forbidden to read any existing tool
     asked for the same thing in the same words, and both shipped the same
     workaround: the list in one panel and a table of the SAME rows in another,
     because the repeater could only hold what the reader types.  flangejoint:
     "the number the user is reasoning about is 40 cm away from the number they
     are typing."  A derived cell puts it in the row it belongs to.

       row: [ {key:'w', type:'number', label:{…}, unit:'m'},
              {key:'h', type:'number', label:{…}, unit:'m'},
              {type:'derived', label:{…}, unit:'m2', precision:2,
               value: function (row, i, ctx) { return row.w * row.h; },
               tone:  function (row) { return row.w*row.h > 4 ? 'warn' : ''; }} ]

     It is not a control: nothing focuses it, nothing commits through it, and
     it never appears in the tool's state unless the tool put it there itself.
     `value` may also be omitted, in which case a `key` is read straight out of
     the row — the shape for a number the tool computes into the row and the
     reader may only look at. */
  var LIST_CELL_TYPES = { number: 1, text: 1, select: 1, toggle: 1, derived: 1 };

  Field.prototype.listCells = function () {
    if (this.cells_) return this.cells_;
    var app = this.app, d = this.def;
    var raw = d.row || d.columns || d.cells || [];
    if (!raw.length) warn('field ' + this.id + ': type list needs a row: [...] declaration');
    this.cells_ = raw.map(function (c) {
      var ty = LIST_CELL_TYPES[c.type] ? c.type : 'number';
      if (c.readOnly === true || isFn(c.value)) ty = 'derived';
      return {
        key: c.key == null ? null : c.key,
        type: ty,
        def: c,
        unitEntry: (c.unit && !isFn(c.unit)) ? unitFor(c, app.opts.units && app.opts.units.overrides) : null
      };
    });
    return this.cells_;
  };

  /* the live array; created and written back through get/set like any value */
  Field.prototype.listRows = function () {
    var v = this.readState();
    if (!v || typeof v.length !== 'number' || typeof v.splice !== 'function') {
      v = [];
      this.writeState(v);
    }
    return v;
  };

  Field.prototype.cellLabel = function (cell) {
    var v = isFn(cell.def.label) ? call(cell.def.label, [this.ctx()], 'list.cell.label') : cell.def.label;
    if (v == null) v = cell.key || '';
    var text = pick(asLabel(v), this.app.lang);
    if (cell.def.unit) {
      text += ' (' + (cell.unitEntry ? unitLabel(cell.unitEntry, cell.def.unit)
                                     : pick(asLabel(cell.def.unit), this.app.lang)) + ')';
    }
    return text;
  };

  Field.prototype.cellRead = function (row, cell, i) {
    /* a derived cell computes; everything else reads the row */
    if (cell.type === 'derived' && isFn(cell.def.value)) {
      return call(cell.def.value, [row, i, this.ctx()], 'list.cell.value');
    }
    if (cell.key == null) return row;
    return row == null ? undefined : row[cell.key];
  };

  Field.prototype.cellShown = function (row, cell, i) {
    var v = this.cellRead(row, cell, i);
    if (cell.type === 'number' && typeof v === 'number' && cell.unitEntry) v = toDisplay(v, cell.unitEntry);
    if (v == null) return '';
    return String(v);
  };

  /* what a derived cell prints. Same contract as a results tile: SI in, display
     units out, `precision` honoured, a six-language label object accepted, and
     an em dash rather than "null" or "NaN" when the row cannot be evaluated —
     a half-typed row must read as blank, not as an error. */
  Field.prototype.cellDerivedText = function (row, cell, i) {
    var v = this.cellRead(row, cell, i);
    /* null is "there is no value" and prints an em dash, the same as a tile.
       An EMPTY STRING is a value the tool chose: a derived note column that
       has nothing to say about this row must be blank, not dashed. */
    if (v === '') return '';
    if (v == null) return '—';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '—';
      if (cell.unitEntry) v = toDisplay(v, cell.unitEntry);
      return fmt(v, { precision: cell.def.precision });
    }
    return pick(asLabel(v), this.app.lang);
  };

  /* one painter for the build and the sync path, so a readout cannot be right
     on first render and wrong on the next keystroke. A number is right-aligned
     with tabular figures; a word is left-aligned and trails off in an ellipsis. */
  Field.prototype.paintDerived = function (ctl, row, cell, i) {
    var raw = this.cellRead(row, cell, i);
    var txt = this.cellDerivedText(row, cell, i);
    var span = ctl.firstChild || ctl;
    if (span.textContent !== txt) span.textContent = txt;
    ctl.title = txt;
    var numeric = typeof raw === 'number' && isFinite(raw);
    if (numeric) ctl.classList.add('num'); else ctl.classList.remove('num');
    var tone = this.cellTone(row, cell, i);
    ['ok', 'warn', 'bad'].forEach(function (t) { if (t !== tone) ctl.classList.remove(t); });
    if (tone) ctl.classList.add(tone);
  };

  Field.prototype.cellTone = function (row, cell, i) {
    var t = cell.def.tone;
    if (isFn(t)) t = call(t, [row, i, this.ctx()], 'list.cell.tone');
    return t ? String(t) : '';
  };

  Field.prototype.buildList = function () {
    var self = this, d = this.def;
    var cells = this.listCells();
    var box = el('div', { class: 'dgu-list', role: 'group', 'aria-labelledby': this.id + '-l' });
    box.style.setProperty('--dgu-list-cols', cells.map(function (c) {
      return c.def.width || 'minmax(0,1fr)';
    }).join(' '));

    this.listHead = el('div', { class: 'dgu-list-h', 'aria-hidden': 'true' });
    box.appendChild(this.listHead);
    this.rowsBox = el('div', { class: 'dgu-list-rows' });
    box.appendChild(this.rowsBox);
    this.emptyNode = el('p', { class: 'dgu-list-empty' });
    box.appendChild(this.emptyNode);
    this.addBtn = el('button', { class: 'dgu-btn dgu-list-add', type: 'button' });
    on(this.addBtn, 'click', function () { self.listAdd(); });
    box.appendChild(this.addBtn);
    this.sayNode = el('div', { class: 'dgu-sr', role: 'status', 'aria-live': 'polite' });
    box.appendChild(this.sayNode);
    this.rowsUI = [];
    this.listBox = box;
    this.renderRows();
    return box;
  };

  Field.prototype.listSay = function (key) {
    if (this.sayNode) this.sayNode.textContent = this.t(key);
  };

  Field.prototype.renderRows = function () {
    var self = this, d = this.def, app = this.app;
    var cells = this.listCells(), rows = this.listRows();
    clear(this.listHead);
    cells.forEach(function (c) { self.listHead.appendChild(el('span', { text: self.cellLabel(c) })); });
    this.listHead.appendChild(el('span', { text: '' }));
    clear(this.rowsBox);
    this.rowsUI = [];
    rows.forEach(function (row, i) { self.rowsBox.appendChild(self.buildRow(row, i)); });
    this.emptyNode.textContent = pick(asLabel(d.empty || this.t('list_empty')), app.lang);
    this.emptyNode.hidden = rows.length > 0;
    this.listHead.hidden = rows.length === 0;
    this.addBtn.textContent = pick(asLabel(d.addLabel || this.t('add_row')), app.lang);
    this.syncListLimits();
  };

  Field.prototype.syncListLimits = function () {
    var d = this.def, n = this.listRows().length;
    var max = d.maxRows == null ? Infinity : d.maxRows;
    var min = d.minRows == null ? 0 : d.minRows;
    if (this.addBtn) {
      this.addBtn.disabled = n >= max;
      if (n >= max) this.addBtn.title = this.t('list_full'); else this.addBtn.removeAttribute('title');
    }
    this.rowsUI.forEach(function (r, i) {
      if (r.del) r.del.disabled = n <= min;
      if (r.up) r.up.disabled = i === 0;
      if (r.down) r.down.disabled = i === n - 1;
    });
  };

  Field.prototype.buildRow = function (row, i) {
    var self = this, d = this.def;
    var cells = this.listCells();
    var node = el('div', { class: 'dgu-list-row', dataset: { i: String(i) } });
    var ui = { node: node, ctls: [], del: null, up: null, down: null };
    var rowName = this.t('row') + ' ' + (i + 1);

    cells.forEach(function (cell) {
      var wrap = el('div', { class: 'dgu-list-c' });
      var label = self.cellLabel(cell);
      wrap.appendChild(el('span', { class: 'dgu-list-cl', text: label }));
      var ctl = self.buildCell(cell, i);
      ctl.classList.add('dgu-fctl');
      ctl.setAttribute('aria-label', label + ' - ' + rowName);
      if (cell.type === 'derived') self.paintDerived(ctl, row, cell, i);
      wrap.appendChild(ctl);
      node.appendChild(wrap);
      ui.ctls.push(ctl);
    });

    var acts = el('div', { class: 'dgu-list-a' });
    if (d.reorder !== false) {
      ui.up = el('button', { class: 'dgu-btn ghost icon', type: 'button', text: '↑',
        'aria-label': this.t('move_up') + ' - ' + rowName });
      on(ui.up, 'click', function () { self.listMove(i, -1); });
      ui.down = el('button', { class: 'dgu-btn ghost icon', type: 'button', text: '↓',
        'aria-label': this.t('move_down') + ' - ' + rowName });
      on(ui.down, 'click', function () { self.listMove(i, 1); });
      acts.appendChild(ui.up);
      acts.appendChild(ui.down);
    }
    ui.del = el('button', { class: 'dgu-btn danger icon', type: 'button', text: '✕',
      'aria-label': this.t('remove_row') + ' - ' + rowName });
    on(ui.del, 'click', function () { self.listRemove(i); });
    acts.appendChild(ui.del);
    node.appendChild(acts);

    /* keyboard: the same gesture as the buttons, without leaving the cell */
    on(node, 'keydown', function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowUp') { self.listMove(i, -1); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { self.listMove(i, 1); e.preventDefault(); }
    });

    this.rowsUI.push(ui);
    return node;
  };

  Field.prototype.buildCell = function (cell, i) {
    var self = this, app = this.app, c = cell.def;
    if (cell.type === 'derived') {
      /* <output> is the element for a calculated value, but its implicit
         role="status" would make every list row a live region announcing on
         each keystroke of the box beside it. The value is on screen next to
         what produced it; the chatter is not worth it.
         The text lives in a span because `text-overflow:ellipsis` does not
         reach an anonymous flex item — without it a long derived word is
         chopped mid-letter instead of trailing off. */
      var o = el('output', { class: 'dgu-list-d', 'aria-live': 'off' });
      o.dataset.derived = '1';
      o.appendChild(el('span', {}));
      return o;
    }
    if (cell.type === 'select') {
      var sel = el('select', {});
      this.fillCellOptions(sel, cell, i);
      on(sel, 'change', function () { self.commitCell(i, cell, sel.value, true); });
      return sel;
    }
    if (cell.type === 'toggle') {
      var cb = el('input', { type: 'checkbox' });
      on(cb, 'change', function () { self.commitCell(i, cell, cb.checked, true); });
      return cb;
    }
    var inp = el('input', {
      type: cell.type === 'number' ? 'number' : (c.inputType || 'text'),
      inputmode: cell.type === 'number' ? 'decimal' : null,
      placeholder: c.placeholder ? pick(asLabel(c.placeholder), app.lang) : null
    });
    if (cell.type === 'number') {
      if (c.step != null) inp.step = c.step;
      var lo = c.minDisplay != null ? c.minDisplay
             : (typeof c.min === 'number' && cell.unitEntry ? toDisplay(c.min, cell.unitEntry) : c.min);
      var hi = c.maxDisplay != null ? c.maxDisplay
             : (typeof c.max === 'number' && cell.unitEntry ? toDisplay(c.max, cell.unitEntry) : c.max);
      if (lo != null) inp.min = lo;
      if (hi != null) inp.max = hi;
    }
    on(inp, 'input', function () { self.commitCell(i, cell, inp.value, false); });
    on(inp, 'change', function () { self.commitCell(i, cell, inp.value, true); });
    return inp;
  };

  Field.prototype.cellOptions = function (cell, i) {
    var c = cell.def;
    var raw = isFn(c.options)
      ? call(c.options, [this.ctx(), this.listRows()[i], i], 'list.cell.options')
      : c.options;
    return (raw || []).map(function (o) {
      if (o instanceof Array) return [o[0], o[1] == null ? o[0] : o[1]];
      if (o && typeof o === 'object') return [o.value, o.label == null ? o.value : o.label];
      return [o, o];
    });
  };

  Field.prototype.fillCellOptions = function (sel, cell, i) {
    var app = this.app, list = this.cellOptions(cell, i);
    clear(sel);
    list.forEach(function (o) {
      sel.appendChild(el('option', { value: String(o[0]), text: pick(asLabel(o[1]), app.lang) }));
    });
    sel.dataset.sig = list.map(function (o) { return String(o[0]); }).join('');
  };

  /* one cell edit: the same contract as Field.commit - validate BEFORE the
     value reaches state, announce a clamp, take the undo snapshot first */
  Field.prototype.commitCell = function (i, cell, raw, immediate) {
    var app = this.app, rows = this.listRows(), row = rows[i];
    if (row === undefined) return;
    if (cell.type === 'derived') return;   /* nothing commits through a readout */
    var v = raw, note = null;
    if (cell.type === 'number') {
      v = (raw === '' || raw == null) ? null : parseFloat(raw);
      if (typeof v === 'number' && isFinite(v)) {
        if (cell.unitEntry) v = fromDisplay(v, cell.unitEntry);
        if (this.clamps()) {
          var c = cell.def, clamped = false;
          if (c.min != null && v < c.min) { v = c.min; clamped = true; }
          if (c.max != null && v > c.max) { v = c.max; clamped = true; }
          if (clamped && immediate) note = this.t('clamped');
        }
      } else if (v != null && !isFinite(v)) v = null;
    } else if (cell.type === 'select') {
      var opts = this.cellOptions(cell, i);
      for (var k = 0; k < opts.length; k++) {
        if (String(opts[k][0]) === String(raw)) { v = opts[k][0]; break; }
      }
    }
    /* the candidate row, so a refused value never lands in the tool's state */
    var candidate;
    if (cell.key == null) candidate = v;
    else {
      candidate = {};
      for (var q in row) if (Object.prototype.hasOwnProperty.call(row, q)) candidate[q] = row[q];
      candidate[cell.key] = v;
    }
    var msg = this.rowProblem(candidate, i);
    if (msg) {
      this.setError(this.t('row') + ' ' + (i + 1) + ': ' + msg);
      var ui = this.rowsUI[i];
      if (ui) ui.ctls.forEach(function (n) {
        if (!n.dataset || n.dataset.derived !== '1') n.setAttribute('aria-invalid', 'true');
      });
      app.setState('error');
      return;
    }
    this.clearRowInvalid(i);
    this.clearError();
    if (note) this.setNote(note);
    if (immediate) { app.histFromField_ = true; app.pushHistory(); }
    if (cell.key == null) rows[i] = v; else row[cell.key] = v;
    if (note) this.syncList(true);
    this.writeState(rows);
    app.onFieldCommit(this, rows, immediate);
  };

  Field.prototype.rowProblem = function (row, i) {
    var d = this.def;
    if (!isFn(d.validateRow)) return null;
    var res = call(d.validateRow, [row, i, this.ctx()], 'field.validateRow');
    if (res === true || res == null) return null;
    return res === false ? this.t('invalid') : pick(asLabel(res), this.app.lang);
  };

  Field.prototype.clearRowInvalid = function (i) {
    var ui = this.rowsUI[i];
    if (ui) ui.ctls.forEach(function (n) { n.removeAttribute('aria-invalid'); });
  };

  /* structural edits: add, remove, reorder. All three mutate the array in
     place, rebuild the rows, then commit once. */
  Field.prototype.newRow = function () {
    var d = this.def, rows = this.listRows();
    if (isFn(d.newRow)) return call(d.newRow, [rows, this.ctx()], 'field.newRow');
    if (d.newRow && typeof d.newRow === 'object') {
      var copy = {};
      for (var k in d.newRow) if (Object.prototype.hasOwnProperty.call(d.newRow, k)) copy[k] = d.newRow[k];
      return copy;
    }
    var out = {};
    this.listCells().forEach(function (c) {
      if (c.key == null || c.type === 'derived') return;
      out[c.key] = c.def.value != null ? c.def.value
                 : (c.type === 'number' ? 0 : (c.type === 'toggle' ? false : ''));
    });
    return out;
  };

  Field.prototype.listAdd = function () {
    var d = this.def, app = this.app, rows = this.listRows();
    if (d.maxRows != null && rows.length >= d.maxRows) return this;
    var row = this.newRow();
    if (row === undefined) return this;
    app.histFromField_ = true; app.pushHistory();
    rows.push(row);
    this.writeState(rows);
    this.renderRows();
    this.clearError();
    this.listSay('row_added');
    var ui = this.rowsUI[rows.length - 1];
    if (ui && ui.ctls[0] && ui.ctls[0].focus) ui.ctls[0].focus();
    app.onFieldCommit(this, rows, true);
    return this;
  };

  Field.prototype.listRemove = function (i) {
    var d = this.def, app = this.app, rows = this.listRows();
    if (i < 0 || i >= rows.length) return this;
    if (d.minRows != null && rows.length <= d.minRows) return this;
    app.histFromField_ = true; app.pushHistory();
    rows.splice(i, 1);
    this.writeState(rows);
    this.renderRows();
    this.clearError();
    this.listSay('row_removed');
    var next = this.rowsUI[Math.min(i, this.rowsUI.length - 1)];
    if (next && next.del) next.del.focus();
    else if (this.addBtn) this.addBtn.focus();
    app.onFieldCommit(this, rows, true);
    return this;
  };

  Field.prototype.listMove = function (i, dir) {
    var app = this.app, rows = this.listRows(), j = i + dir;
    if (this.def.reorder === false) return this;
    if (i < 0 || i >= rows.length || j < 0 || j >= rows.length) return this;
    app.histFromField_ = true; app.pushHistory();
    var moved = rows.splice(i, 1)[0];
    rows.splice(j, 0, moved);
    this.writeState(rows);
    this.renderRows();
    this.listSay('row_moved');
    var ui = this.rowsUI[j];
    if (ui) {
      var btn = dir < 0 ? ui.up : ui.down;
      if (btn && !btn.disabled) btn.focus(); else if (ui.del) ui.del.focus();
    }
    app.onFieldCommit(this, rows, true);
    return this;
  };

  /* sync: never rebuild while the reader is typing, and never write over the
     box that has focus - the same rule Field.writeControlValue follows */
  Field.prototype.syncList = function (force) {
    var self = this, rows = this.listRows(), cells = this.listCells();
    /* R34: a row-count change rebuilds the rows empty; fill them in the same
       pass instead of waiting for the next sync (compute:'run' has none) */
    if (rows.length !== this.rowsUI.length) { this.renderRows(); force = true; }
    rows.forEach(function (row, i) {
      var ui = self.rowsUI[i];
      if (!ui) return;
      cells.forEach(function (cell, k) {
        var ctl = ui.ctls[k];
        if (!ctl) return;
        /* BEFORE the focus guard, and deliberately: the whole point of a
           derived cell is that it moves while the reader types in the box
           beside it. It is never the focused element, so the guard that
           protects a caret has nothing to protect here. */
        if (cell.type === 'derived') { self.paintDerived(ctl, row, cell, i); return; }
        if (!force && doc.activeElement === ctl) return;
        if (cell.type === 'toggle') { ctl.checked = !!self.cellRead(row, cell, i); return; }
        if (cell.type === 'select') {
          var sig = self.cellOptions(cell, i).map(function (o) { return String(o[0]); }).join('');
          if (ctl.dataset.sig !== sig) self.fillCellOptions(ctl, cell, i);
          ctl.value = String(self.cellRead(row, cell, i));
          return;
        }
        var shown = self.cellShown(row, cell, i);
        if (ctl.value !== shown) ctl.value = shown;
      });
    });
    this.emptyNode.hidden = rows.length > 0;
    this.listHead.hidden = rows.length === 0;
    this.syncListLimits();
  };

  Field.prototype.build = function () {
    var self = this, d = this.def, app = this.app;
    var type = d.type || (d.options ? 'select' : 'number');
    var node = el('div', { class: 'dgu-field ' + type, dataset: { dguField: this.id } });
    this.node = node;

    if (type === 'note') {
      node.appendChild(el('div', { class: 'dgu-hint', text: pick(d.label || d.text, app.lang) }));
      this.host.appendChild(node);
      return;
    }

    this.labelNode = doc.createTextNode(this.labelNow());
    /* a list is a group of controls, not one control: its label names the group
       (aria-labelledby) instead of pointing `for` at a box that does not exist */
    /* QA-28 (plb run 2): a toggle's `-c` id sits on the wrapper span (pages
       look it up), so the label points at the checkbox itself (`-cb`) —
       otherwise the box had no accessible name and the label click did nothing */
    var isToggle = type === 'toggle' || type === 'boolean' || type === 'checkbox';
    var lab = el('label', type === 'list'
      ? { class: 'dgu-flabel', id: this.id + '-l' }
      : { class: 'dgu-flabel', for: this.id + (isToggle ? '-cb' : '-c') }, [this.labelNode]);
    if (d.required) lab.appendChild(el('span', { class: 'dgu-req', text: '*', title: this.t('required') }));
    if (d.learn) lab.appendChild(app.learnButton(d.learn));
    node.appendChild(lab);
    if (d.learn) node.setAttribute('data-learn-topic', d.learn);

    var row = el('div', { class: 'dgu-frow' });
    var ctl = this.buildControl(type);
    this.control = ctl;
    ctl.id = this.id + '-c';
    ctl.classList.add('dgu-fctl');
    row.appendChild(ctl);

    if (type === 'range') {
      /* v3.4 §6.5 — the range composite. Three ports named the same two gaps:
         `stress_transformation` wrote FIVE `type:'custom'` fields to get a
         slider with a typed box beside it ("the framework is missing a 'range
         with an editable value' field type"), `fourier_series` did it for
         "Number of harmonics N", and `decayheat` could not use `type:'range'`
         at all because its slider is an index into a 150-point logarithmic
         grid that has to read "10.4 y", not "37" — "a field has no value
         formatter hook". `editable:` answers the first, `format:` the second.

         When both are declared the box holds the number and the readout holds
         what it MEANS, which is exactly decayheat's shape. */
      if (d.editable) {
        var num = el('input', {
          type: 'number', class: 'dgu-rangenum', inputmode: 'decimal',
          'aria-label': this.labelNow()
        });
        if (d.min != null) num.min = d.min;
        if (d.max != null) num.max = d.max;
        if (d.step != null) num.step = d.step;
        this.numBox = num;
        num.classList.add('dgu-fctl');
        /* An empty or half-typed box is not a value: it neither commits nor
           writes NaN into the tool's state. On blur the field settles the box
           back to what the state actually holds, the same rule the number
           field already follows. */
        var take = function (immediate) {
          var raw = num.value;
          var v = (raw === '' || raw == null) ? NaN : parseFloat(raw);
          if (!isFinite(v)) { if (immediate) self.syncControl(self.readState()); return; }
          self.commit(v, immediate);
        };
        on(num, 'input', function () { take(false); });
        on(num, 'change', function () { take(true); });
        row.appendChild(num);
      }
      if (!d.editable || isFn(d.format)) {
        this.valNode = el('output', { class: 'dgu-rangeval', for: ctl.id });
        row.appendChild(this.valNode);
      }
    }
    if (d.unit) {
      this.unitNode = el('span', { class: 'dgu-unit', text: this.unitNow() });
      row.appendChild(this.unitNode);
    }
    node.appendChild(row);

    if (d.hint) node.appendChild(el('div', { class: 'dgu-hint', text: pick(asLabel(d.hint), app.lang) }));
    this.errNode = el('div', { class: 'dgu-err', hidden: true, role: 'status' });
    node.appendChild(this.errNode);
    this.host.appendChild(node);
    this.sync();
  };

  Field.prototype.buildControl = function (type) {
    var self = this, d = this.def, app = this.app;
    var commit = function (v, immediate) { self.commit(v, immediate); };

    if (type === 'select') {
      var sel = el('select', {});
      this.fillOptions(sel);
      on(sel, 'change', function () {
        var raw = sel.value;
        var opts = self.optionList();
        var match = null;
        for (var i = 0; i < opts.length; i++) if (String(opts[i][0]) === raw) match = opts[i][0];
        commit(match === null ? raw : match, true);
      });
      return sel;
    }
    if (type === 'segmented') {
      var wrap = el('div', { class: 'dgu-seg', role: 'group' });
      this.segWrap = wrap;
      this.renderSegments();
      return wrap;
    }
    if (type === 'toggle' || type === 'boolean' || type === 'checkbox') {
      var lbl = el('span', { class: 'dgu-toggle' });
      var box = el('input', { type: 'checkbox', id: this.id + '-cb' });
      lbl.appendChild(box);
      this.box = box;
      on(box, 'change', function () { commit(!!box.checked, true); });
      return lbl;
    }
    if (type === 'textarea') {
      var ta = el('textarea', { rows: d.rows || 3 });
      on(ta, 'input', function () { commit(ta.value, false); });
      return ta;
    }
    if (type === 'readonly') {
      return el('output', { class: 'dgu-readonly' });
    }
    if (type === 'custom') {
      var box2 = el('div', {});
      call(d.render, [box2, this.ctx(), this], 'field.render');
      return box2;
    }
    if (type === 'list') return this.buildList();
    if (type === 'range') {
      var r = el('input', {
        type: 'range',
        min: d.min == null ? 0 : d.min,
        max: d.max == null ? 100 : d.max,
        step: d.step == null ? 'any' : d.step
      });
      on(r, 'input', function () { commit(parseFloat(r.value), false); });
      on(r, 'change', function () { commit(parseFloat(r.value), true); });
      return r;
    }
    /* number / text */
    var inp = el('input', {
      type: type === 'number' ? 'number' : (d.inputType || 'text'),
      inputmode: type === 'number' ? 'decimal' : null,
      placeholder: d.placeholder ? pick(d.placeholder, app.lang) : null
    });
    if (type === 'number') {
      /* field-minmax (12 files; xenon.html: "buildControl writes `step` but
         only writes `min` when minDisplay is given, so a number field
         declaring min/max lost the browser's own range semantics";
         stress_transformation.html: "Field writes a native min= from
         minDisplay but has no maxDisplay at all"). d.min/d.max are in SI, the
         control is in display units, so they are converted; an explicit
         minDisplay/maxDisplay still wins. */
      if (d.step != null) inp.step = d.step;
      var nMin = self.displayBound('min');
      var nMax = self.displayBound('max');
      if (nMin != null) inp.min = nMin;
      if (nMax != null) inp.max = nMax;
    }
    on(inp, 'input', function () {
      commit(type === 'number' ? (inp.value === '' ? null : parseFloat(inp.value)) : inp.value, false);
    });
    on(inp, 'change', function () {
      commit(type === 'number' ? (inp.value === '' ? null : parseFloat(inp.value)) : inp.value, true);
    });
    return inp;
  };

  /* An option is `value`, `[value,label]` or `{value,label}` — and now also
     `{group, options:[…]}`.  moodydiagram.html, couldNotMap: "Field.fillOptions
     emits a flat <option> list with no optgroup support, and flattening would
     turn a two-level pick into a 33-item scroll … Three tools wanting grouped
     options is how section 6 grows an `optgroup` key." The three are
     moodydiagram (33 fluids in 5 groups, 27 wall materials in 5 groups),
     decayheat ("The assembly-preset control (27 presets in 8 `<optgroup>`s) …
     there is no option-group support in the field vocabulary") and
     probabilisticrisk (40 presets in 8 categories). */
  function normOption(o, app) {
    if (Array.isArray(o)) return [o[0], pick(asLabel(o[1]), app.lang)];
    if (o && typeof o === 'object') return [o.value, pick(asLabel(o.label != null ? o.label : o.value), app.lang)];
    return [o, String(o)];
  }
  function isOptionGroup(o) {
    return !!(o && typeof o === 'object' && !Array.isArray(o) && o.options && o.options.length);
  }
  /* [ [groupLabelOrNull, [[value,label],…] ], … ] */
  function optionGroups(raw, app) {
    var out = [], loose = null;
    (raw || []).forEach(function (o) {
      if (isOptionGroup(o)) {
        out.push([pick(asLabel(o.group != null ? o.group : o.label), app.lang),
                  o.options.map(function (x) { return normOption(x, app); })]);
        loose = null;
      } else {
        if (!loose) { loose = [null, []]; out.push(loose); }
        loose[1].push(normOption(o, app));
      }
    });
    return out;
  }
  function fillSelect(sel, groups) {
    clear(sel);
    groups.forEach(function (g) {
      var host = sel;
      if (g[0]) { host = el('optgroup', { label: g[0] }); sel.appendChild(host); }
      g[1].forEach(function (o) { host.appendChild(el('option', { value: o[0], text: o[1] })); });
    });
  }

  Field.prototype.rawOptions = function () {
    var d = this.def;
    var raw = isFn(d.options) ? call(d.options, [this.ctx()], 'field.options') : d.options;
    return raw || [];
  };

  /* flat, in document order — segments cannot group, and every existing caller
     of optionList() expects exactly this shape */
  Field.prototype.optionList = function () {
    var app = this.app, out = [];
    optionGroups(this.rawOptions(), app).forEach(function (g) {
      g[1].forEach(function (o) { out.push(o); });
    });
    return out;
  };

  Field.prototype.fillOptions = function (sel) {
    fillSelect(sel, optionGroups(this.rawOptions(), this.app));
  };

  Field.prototype.renderSegments = function () {
    var self = this;
    clear(this.segWrap);
    this.optionList().forEach(function (o) {
      var b = el('button', { type: 'button', text: o[1], 'aria-pressed': 'false' });
      b.dataset.value = o[0];
      on(b, 'click', function () { self.commit(o[0], true); });
      self.segWrap.appendChild(b);
    });
  };

  Field.prototype.commit = function (displayValue, immediate) {
    var d = this.def, app = this.app;
    app.histFromField_ = false;
    var v = displayValue;
    var note = null;
    if ((d.type === 'number' || d.type === 'range' || (!d.type && !d.options)) && typeof v === 'number') {
      if (this.unitEntry) v = fromDisplay(v, this.unitEntry);
      if (this.clamps()) {
        var clamped = false;
        if (d.min != null && v < d.min) { v = d.min; clamped = true; }
        if (d.max != null && v > d.max) { v = d.max; clamped = true; }
        if (clamped && immediate) {
          /* UI_AUDIT.md S-9: a clamped value is announced and written back,
             never silently different from what the user typed.
             field-clamped-note (28 files; xenon.html: "Field.commit sets the
             'clamped' note and clearError() wipes it three lines later, so a
             clamped value was never announced"). The note is now carried past
             clearError() and re-stated after it. */
          note = this.t('clamped');
          this.syncControl(v);
        }
      }
    }
    if (isFn(d.validate)) {
      var res = call(d.validate, [v, this.ctx()], 'field.validate');
      if (res !== true && res != null && res !== undefined) {
        var msg = res === false ? this.t('invalid') : pick(res, app.lang);
        this.setError(msg);
        this.control.setAttribute && this.control.setAttribute('aria-invalid', 'true');
        app.setState('error');
        /* CLOSE-THE-LOOP 8. §5.1 promises "a collapsed panel … **opens itself**
           if a field inside it goes invalid". trussframe.html measured it and it
           was not true: "the reveal lives in `Panel.prototype.sync`, and neither
           `Field.commit` nor `Field.commitCell` calls `app.sync()` on the
           refusal path. Result on my dock Members list:
           `openRightAfterInvalid:false`, `openAfterSync:true`". Revealing the
           one panel is the narrow fix — a full app.sync() on the refusal path
           would write the state value back over what the reader typed. */
        if (this.panel && this.panel.collapsed && isFn(this.panel.reveal)) {
          try { this.panel.reveal(); } catch (e) { warn(e); }
        }
        return;
      }
    }
    this.clearError();
    if (note) this.setNote(note);
    /* TIER2 T6: the undo snapshot is taken before the edit, not after it.
       heat2d: "History.push() snapshots AFTER the edit (onFieldCommit writes
       state, then pushes), so the first undo is a no-op and the pre-edit state
       is lost."  hydraulicnetwork: "History.push() is called AFTER a field has
       written its value, which makes the first undo a no-op and every later one
       off by one."  electricalnetwork and ductnetwork say the same and all four
       gate the framework's push off to take their own snapshot first.  The flag
       tells onFieldCommit that this edit is already on the stack, so any other
       caller of onFieldCommit keeps the behaviour it has today. */
    if (immediate) { app.histFromField_ = true; app.pushHistory(); }
    this.writeState(v);
    app.onFieldCommit(this, v, immediate);
  };

  Field.prototype.setError = function (msg) {
    if (!this.errNode) return;
    this.errNode.classList.remove('note');
    this.errNode.textContent = msg;
    this.errNode.hidden = false;
    if (this.control && this.control.setAttribute) this.control.setAttribute('aria-invalid', 'true');
  };

  /* A notice in the same live region: said out loud, but the control is not
     invalid — the framework accepted the value, it only moved it. */
  Field.prototype.setNote = function (msg) {
    if (!this.errNode) return;
    this.errNode.classList.add('note');
    this.errNode.textContent = msg;
    this.errNode.hidden = false;
  };

  Field.prototype.clearError = function () {
    if (!this.errNode) return;
    this.errNode.hidden = true;
    this.errNode.textContent = '';
    this.errNode.classList.remove('note');
    if (this.control && this.control.removeAttribute) this.control.removeAttribute('aria-invalid');
  };

  /* What a read-only display prints. `format:(displayValue, ctx, field)` may
     return a string or a six-language label object; anything else falls back
     to the site's own number formatting, so a field that declares no format
     prints exactly what it printed before this release. */
  Field.prototype.displayText = function (disp) {
    var d = this.def;
    if (isFn(d.format)) {
      var out = call(d.format, [disp, this.ctx(), this], 'field.format');
      if (out != null) return pick(asLabel(out), this.app.lang);
    }
    return typeof disp === 'number' ? fmt(disp, { precision: d.precision })
      : (disp == null ? '—' : String(disp));
  };

  Field.prototype.syncControl = function (siValue) {
    var d = this.def, type = d.type || (d.options ? 'select' : 'number');
    var disp = siValue;
    if (typeof siValue === 'number' && this.unitEntry) disp = toDisplay(siValue, this.unitEntry);
    if (siValue === mixed) {
      if (this.box) { this.box.indeterminate = true; return; }
      if (this.control && 'value' in this.control) {
        this.control.value = '';
        this.control.placeholder = '— ' + this.t('mixed') + ' —';
        this.control.classList.add('dgu-mixed');
      }
      return;
    }
    if (this.control) this.control.classList.remove('dgu-mixed');
    if (type === 'toggle' || type === 'boolean' || type === 'checkbox') {
      if (this.box) { this.box.indeterminate = false; this.box.checked = !!siValue; }
      return;
    }
    if (type === 'segmented') {
      var kids = this.segWrap ? this.segWrap.children : [];
      for (var i = 0; i < kids.length; i++) {
        kids[i].setAttribute('aria-pressed', String(kids[i].dataset.value === String(siValue)));
      }
      return;
    }
    if (type === 'readonly') {
      this.control.textContent = this.displayText(disp);
      return;
    }
    if (type === 'custom') return;
    if (!this.control || !('value' in this.control)) return;
    if (typeof disp === 'number') {
      var shown = d.precision != null ? disp.toFixed(d.precision)
        : (Math.abs(disp) >= 1e6 || (disp !== 0 && Math.abs(disp) < 1e-4)
          ? disp.toExponential(4) : String(Math.round(disp * 1e6) / 1e6));
      this.writeControlValue(shown);
      /* the typed box never gets written over while it has the caret — the
         same rule writeControlValue applies to the field's own control */
      if (this.numBox && doc.activeElement !== this.numBox && this.numBox.value !== shown) {
        this.numBox.value = shown;
      }
      if (this.valNode) this.valNode.textContent = this.displayText(disp);
    } else {
      this.writeControlValue(disp == null ? '' : String(disp));
      if (this.numBox && doc.activeElement !== this.numBox) {
        this.numBox.value = disp == null ? '' : String(disp);
      }
      if (this.valNode) this.valNode.textContent = this.displayText(disp);
    }
  };

  /* The focused-control settle (part of the field-minmax family, 12 files;
     xenon.html: "Field.syncControl refuses to write into a focused control, so
     a rejected entry lingered in the box — settled on blur"). Writing into a
     control while the user is typing in it destroys the caret, so that rule
     stays; the value the field wanted is remembered and written when the
     control loses focus, unless by then the box already means the same number,
     so a typed "1.50" is not rewritten to "1.5" for its own sake. */
  Field.prototype.writeControlValue = function (shown) {
    var c = this.control;
    if (!c) return;
    if (doc.activeElement !== c) { c.value = shown; this.pendingShown = null; return; }
    this.pendingShown = shown;
    if (this.settleBound) return;
    this.settleBound = true;
    var self = this;
    on(c, 'blur', function () {
      var want = self.pendingShown;
      self.pendingShown = null;
      if (want == null || c.value === want) return;
      var a = parseFloat(c.value), b = parseFloat(want);
      if (isFinite(a) && isFinite(b) && a === b) return;
      c.value = want;
    });
  };

  Field.prototype.sync = function () {
    var d = this.def, ctx = this.ctx();
    if (isFn(d.visible)) {
      var vis = call(d.visible, [ctx], 'field.visible');
      this.node.hidden = !vis;
      if (!vis) return;
    }
    if (isFn(d.disabled)) {
      var dis = !!call(d.disabled, [ctx], 'field.disabled');
      if (this.control && 'disabled' in this.control) this.control.disabled = dis;
      if (this.box) this.box.disabled = dis;
      if (this.segWrap) {
        for (var i = 0; i < this.segWrap.children.length; i++) this.segWrap.children[i].disabled = dis;
      }
      this.node.classList.toggle('disabled', dis);
    }
    /* TIER2 T7: re-read a label or unit declared as a thunk */
    if (this.labelNode && isFn(d.label)) {
      var lt = this.labelNow();
      if (this.labelNode.nodeValue !== lt) this.labelNode.nodeValue = lt;
    }
    if (this.unitNode && isFn(d.unit)) {
      var ut = this.unitNow();
      if (this.unitNode.textContent !== ut) this.unitNode.textContent = ut;
    }
    if (this.listBox) { this.syncList(); return; }
    if (this.segWrap && !this.segWrap.children.length) this.renderSegments();
    if (d.type === 'select' && this.control && this.control.tagName === 'SELECT') {
      var want = this.optionList().map(function (o) { return String(o[0]); }).join('');
      if (this.control.dataset.sig !== want) {
        this.fillOptions(this.control);
        this.control.dataset.sig = want;
      }
    }
    this.syncControl(this.readState());
  };

  /* ================================================================= PANELS */

  function Panel(app, def) {
    this.app = app;
    this.def = def;
    this.fields = [];
    this.node = el('section', { class: 'dgu-panel', dataset: { dguPanel: def.id || uid('p') } });
    this.build();
  }

  Panel.prototype.build = function () {
    var app = this.app, d = this.def, self = this;
    /* UI_FRAMEWORK_SPEC §5 declares `collapsible` in the ui.panel() signature
       and diagram-ui.js never implemented it. Five ports said so in the same
       words — ductnetwork: "UI_FRAMEWORK_SPEC section 5 declares
       ui.panel({collapsible}) but diagram-ui.js does not implement it. Without
       it the input column is 3 400 px tall on a desktop"; waterhammer:
       "diagram-ui.js Panel.build ignores `collapsible` … Implemented locally …
       This wants to be a framework feature"; cfd: "Eight inputs panels make a
       ~3000px column at 1440px"; outdoornoise: "The five collapsible preset
       groups … Framework gap: collapsible panels"; decayheat: "The five
       `<details class="sec">` groups could be collapsed, and 'Fine tuning' was
       collapsed by default". A disclosure BUTTON, not <details>: ontvochtiging
       found that "Chromium no longer takes the contents of a closed <details>
       out of layout — it hides them with content-visibility", so every
       reachability gate counts controls inside a closed disclosure. The
       [hidden] attribute plus the R1 rule really does take them out. */
    var canCollapse = !!d.collapsible && !!d.title;
    if (d.collapsible && !d.title) warn('panel ' + (d.id || '?') + ': collapsible needs a title to put the disclosure in');
    if (d.title || d.learn || (d.headerActions && d.headerActions.length)) {
      var h = el('div', { class: 'dgu-panel-h' });
      if (d.title) {
        var head = el('h2', { class: 'dgu-panel-t' });
        var label = pick(asLabel(d.title), app.lang);
        if (canCollapse) {
          /* the accordion pattern: the button is inside the heading, so the
             heading semantics and the shortcut to it both survive */
          this.bodyId = uid('dgu-pbody');
          this.toggle = el('button', {
            type: 'button', class: 'dgu-panel-tog', 'aria-expanded': 'true', 'aria-controls': this.bodyId
          }, [el('span', { class: 'dgu-caret', 'aria-hidden': 'true' }), doc.createTextNode(label)]);
          on(this.toggle, 'click', function () { self.setCollapsed(!self.collapsed); });
          head.appendChild(this.toggle);
          h.classList.add('collapsible');
        } else head.textContent = label;
        h.appendChild(head);
      }
      if (d.learn) { h.appendChild(app.learnButton(d.learn)); this.node.setAttribute('data-learn-topic', d.learn); }
      (d.headerActions || []).forEach(function (a) { h.appendChild(app.actionButton(a)); });
      this.node.appendChild(h);
      this.headNode = h;
    }
    if (d.note) {
      this.noteNode = el('p', { class: 'dgu-panel-note', text: pick(asLabel(d.note), app.lang) });
      this.node.appendChild(this.noteNode);
    }

    this.body = el('div', { class: 'dgu-fields' });
    if (this.bodyId) this.body.id = this.bodyId;
    this.node.appendChild(this.body);

    if (isFn(d.render)) call(d.render, [this.body, app.fieldCtx(), this], 'panel.render');
    (d.fields || []).forEach(function (f) {
      var fld = new Field(this.app, f, this.body);
      /* CLOSE-THE-LOOP 8: the back-reference that makes §5.1's promise true. */
      fld.panel = this;
      this.fields.push(fld);
    }, this);

    if (d.actions && d.actions.length) {
      var row = el('div', { class: 'dgu-panel-actions' + (d.actionsAlign === 'end' ? ' end' : '') });
      d.actions.forEach(function (a) { row.appendChild(app.actionButton(a)); });
      this.node.appendChild(row);
      this.actionsNode = row;
    }
    if (canCollapse) {
      /* the remembered flag outlives a language rebuild, which builds a new App */
      var want = !!d.collapsed;
      var saved = this.remembers() ? nsGet('panel', d.id, app) : null;
      if (saved === '1') want = true; else if (saved === '0') want = false;
      this.setCollapsed(want, true);
    }
    /* UI_AUDIT.md S-16: an empty panel does not render. */
    this.checkEmpty();
  };

  Panel.prototype.remembers = function () {
    return !!(this.def.collapsible && this.def.id && this.def.remember !== false);
  };

  /* decayheat remembered its fold in localStorage ('sfst.collapsed') and
     relativity remembered its Simple view; the framework does the same, under
     the one namespace, so the memory survives a reload AND a language switch. */
  Panel.prototype.setCollapsed = function (flag, quiet) {
    if (!this.toggle) return this;
    flag = !!flag;
    this.collapsed = flag;
    this.toggle.setAttribute('aria-expanded', flag ? 'false' : 'true');
    this.toggle.title = this.app.t(flag ? 'expand' : 'collapse');
    this.node.setAttribute('data-collapsed', flag ? 'true' : 'false');
    this.body.hidden = flag;
    if (this.noteNode) this.noteNode.hidden = flag;
    if (this.actionsNode) this.actionsNode.hidden = flag;
    /* `quiet` is the build-time restore: it must not write, or the declared
       default would be overwritten by itself on the first visit and a later
       change to that default could never reach a returning reader. */
    if (!quiet) {
      if (this.remembers()) nsSet('panel', this.def.id, flag ? '1' : '0', this.app);
      call(this.def.onCollapse, [flag, this], 'panel.onCollapse');
    }
    return this;
  };

  /* A fold must never hide a problem: anything that opens a panel from outside
     (a tour step, an error, a deep link) goes through here. */
  Panel.prototype.reveal = function () { return this.setCollapsed(false); };

  Panel.prototype.checkEmpty = function () {
    var visible = 0;
    this.fields.forEach(function (f) { if (!f.node.hidden) visible += 1; });
    var custom = isFn(this.def.render) || (this.def.actions && this.def.actions.length);
    this.node.hidden = (visible === 0 && !custom);
  };

  Panel.prototype.sync = function () {
    this.fields.forEach(function (f) { f.sync(); });
    if (isFn(this.def.sync)) call(this.def.sync, [this.body, this.app.fieldCtx(), this], 'panel.sync');
    /* honest degradation: a collapsed panel that now holds an invalid value
       opens itself, so the message is never folded away from the reader */
    if (this.collapsed && this.body.querySelector('[aria-invalid="true"]')) this.reveal();
    this.checkEmpty();
  };

  /* ====================================================== CONTENT COMPONENTS */
  /* Everything here is additive: the old call shapes are the short forms of the
     new ones and produce exactly the DOM they produced before. */

  /* ---------------------------------------------------------------- a table
     cablesizing.html, couldNotMap: "Results.table() renders plain string/number
     cells: it has no chosen-row highlight, no dimmed failed rows and no per-row
     failure-reason cell. Those three are the tool's best affordance (the card
     says so)."  fourier_series.html, capabilitiesLost: "The coefficient table's
     sticky header row … that one affordance is gone".  luchtbalans.html,
     couldNotMap: "the 'this table is wider than the screen' hint … the
     framework's own scroll wrapper … has no hint line."  moodydiagram.html:
     "The framework gap is a table row flag … and rich-text cells."

       tables:[{ title, head, rows, sticky, maxHeight, reasonHead, foot, wide })]
       head:  'Label' | {label,num,width,class}
       row:   [cells…]  |  {cells, tone, chosen, dim, weight, reason, title}
       cell:  'text' | 12.3 | null | {value,text,node,num,class,tone,title,span}

     A plain array of arrays of strings is still a plain table. */

  function tableCell(app, c) {
    if (looksLikeLabel(c)) c = { text: c };
    if (c && typeof c === 'object' && !(c.nodeType === 1)) {
      var cls = [];
      if (c.num || typeof c.value === 'number') cls.push('num');
      if (c.tone) cls.push(c.tone);
      if (c.wrap) cls.push('wrap');
      if (c.class) cls.push(c.class);
      var td = el('td', { class: cls.join(' '), title: c.title ? pick(asLabel(c.title), app.lang) : null });
      if (c.span) td.colSpan = c.span;
      if (c.node && c.node.nodeType === 1) td.appendChild(c.node);
      else if (c.text != null) td.textContent = pick(asLabel(c.text), app.lang);
      else if (typeof c.value === 'number') td.textContent = fmt(c.value, { precision: c.precision });
      else td.textContent = c.value == null ? '—' : String(c.value);
      return td;
    }
    if (c && c.nodeType === 1) { var tn = el('td'); tn.appendChild(c); return tn; }
    return el('td', {
      class: typeof c === 'number' ? 'num' : '',
      text: typeof c === 'number' ? fmt(c) : (c == null ? '—' : String(c))
    });
  }

  function table(app, t) {
    t = t || {};
    var box = el('div', { class: 'dgu-table-box' });
    var wrap = el('div', { class: 'dgu-table-wrap' });
    var tb = el('table', { class: 'dgu-table' });

    if (t.title) tb.appendChild(el('caption', {
      style: { 'text-align': 'left', font: '650 var(--fs-section)/1.4 var(--font)', color: 'var(--muted)',
        'text-transform': 'uppercase', 'letter-spacing': '.06em', 'padding-bottom': '6px' },
      text: pick(asLabel(t.title), app.lang)
    }));

    var head = t.head ? t.head.slice() : null;
    var wantReason = !!(t.reasonHead || (t.rows || []).some(function (r) {
      return r && !Array.isArray(r) && r.reason != null;
    }));
    if (head && wantReason) head.push(t.reasonHead || app.t('reason'));

    if (head) {
      var tr = el('tr');
      head.forEach(function (h) {
        var isObj = h && typeof h === 'object' && !looksLikeLabel(h)
          && (h.label != null || h.num != null || h.width != null || h.wrap != null || h.class != null);
        var th = el('th', {
          class: (isObj && h.num ? 'num ' : '') + (isObj && h.wrap ? 'wrap ' : '') + ((isObj && h.class) || ''),
          text: pick(asLabel(isObj ? h.label : h), app.lang),
          scope: 'col'
        });
        if (isObj && h.width) th.style.width = h.width;
        tr.appendChild(th);
      });
      tb.appendChild(el('thead', {}, [tr]));
    }

    var body = el('tbody');
    (t.rows || []).forEach(function (r) {
      if (!r) return;
      var cells = Array.isArray(r) ? r : (r.cells || []);
      var cls = [];
      if (!Array.isArray(r)) {
        if (r.chosen) cls.push('chosen');
        if (r.dim) cls.push('dim');
        if (r.weight) cls.push('weight');
        if (r.tone) cls.push(r.tone);
        if (r.class) cls.push(r.class);
      }
      var row = el('tr', { class: cls.join(' ') });
      if (!Array.isArray(r)) {
        if (r.chosen) row.setAttribute('aria-current', 'true');
        if (r.title) row.title = pick(asLabel(r.title), app.lang);
        if (r.id) row.dataset.row = r.id;
      }
      cells.forEach(function (c) { row.appendChild(tableCell(app, c)); });
      if (wantReason) {
        var rs = Array.isArray(r) ? null : r.reason;
        row.appendChild(el('td', { class: 'reason', text: rs == null ? '' : pick(asLabel(rs), app.lang) }));
      }
      body.appendChild(row);
    });
    tb.appendChild(body);

    if (t.foot && t.foot.length) {
      var tf = el('tfoot'), ftr = el('tr', { class: 'weight' });
      t.foot.forEach(function (c) { ftr.appendChild(tableCell(app, c)); });
      if (wantReason) ftr.appendChild(el('td', { class: 'reason' }));
      tf.appendChild(ftr);
      tb.appendChild(tf);
    }

    wrap.appendChild(tb);
    box.appendChild(wrap);

    /* sticky header. Spec section 5 forbids a panel scrolling internally above
       md, which is what cost fourier_series its header: with no `maxHeight` the
       header sticks to the PAGE under the app header instead, so the affordance
       returns without re-introducing the inner scrollbar the spec removed. */
    if (t.sticky) {
      wrap.classList.add('sticky');
      if (t.maxHeight) {
        wrap.classList.add('scrolls');
        wrap.style.maxHeight = typeof t.maxHeight === 'number' ? t.maxHeight + 'px' : t.maxHeight;
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', pick(asLabel(t.title || app.t('results')), app.lang));
      } else {
        wrap.classList.add('page');
      }
    }

    /* "wider than the screen": stated from measurement, never speculatively */
    var hint = el('div', { class: 'dgu-table-hint' }, [
      el('span', { 'aria-hidden': 'true', text: '↔' }),
      el('span', { text: app.t('table_wide') })
    ]);
    box.appendChild(hint);
    if (t.wide === false) box.dataset.nowide = '1';
    on(wrap, 'scroll', function () {
      box.classList.toggle('end', wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2);
    });
    registerTable(box, wrap, tb);
    return box;
  }

  /* One listener for every table on the page, so a re-render cannot leak one. */
  var tableRegistry = [];
  var tableWatch = false;
  function registerTable(box, wrap, tb) {
    tableRegistry.push({ box: box, wrap: wrap, tb: tb });
    if (tableRegistry.length > 400) tableRegistry = tableRegistry.filter(function (e) {
      return e.box.isConnected !== false;
    });
    /* bound lazily: a page that never builds a framework table gets no listener,
       which keeps the "does nothing observable unless asked" rule of spec 0 */
    if (!tableWatch && global.addEventListener) {
      tableWatch = true;
      global.addEventListener('resize', debounce(measureTables, 120));
      global.addEventListener('orientationchange', debounce(measureTables, 120));
    }
    measureSoonTables();
  }
  function measureTables() {
    for (var i = tableRegistry.length - 1; i >= 0; i--) {
      var e = tableRegistry[i];
      if (e.box.isConnected === false) { tableRegistry.splice(i, 1); continue; }
      /* the table's own content width, independent of the wrap's overflow, so
         the answer does not depend on the class we are about to set */
      var avail = e.box.clientWidth;
      var need = Math.max(e.tb.scrollWidth, e.tb.offsetWidth);
      var over = avail > 0 && need > avail + 2;
      if (e.wrap.classList.contains('page')) e.wrap.classList.toggle('free', !over);
      if (e.box.dataset.nowide === '1') continue;
      e.box.classList.toggle('wide', over);
      if (over) e.box.classList.toggle('end', e.wrap.scrollLeft + e.wrap.clientWidth >= e.wrap.scrollWidth - 2);
      else e.box.classList.remove('end');
    }
  }
  var tableMeasureTimer = null;
  function measureSoonTables() {
    if (tableMeasureTimer) return;
    tableMeasureTimer = global.setTimeout(function () { tableMeasureTimer = null; measureTables(); }, 0);
  }

  /* ----------------------------------------------------------------- a meter
     cablesizing.html, couldNotMap: "The three criteria bars (ampacity / voltage
     drop / short circuit, with ok-warn-bad thresholds at 0.85 and 1.0) stay a
     tool-owned node … The framework has no meter or progress component; tiles
     cannot express 'value against its own limit'."  The same track/fill pair is
     hand-built in operatingpoint, klimaatcalculator, solargaincalculator,
     ductnetwork, iron_carbon_diagram and probabilisticrisk.

       ui.meter({ label, value, max, min, ratio, text, unit, precision,
                  thresholds:[0.85,1], tone, hint, learn, note })

     `tone` overrides the thresholds; `tone:'accent'` is the neutral budget bar.
     A value that does not exist draws an empty track and says so — never 0. */

  var METER_THRESHOLDS = [0.85, 1];

  function meterRatio(m) {
    if (m.ratio != null) return Number(m.ratio);
    var lo = m.min == null ? 0 : Number(m.min);
    var hi = m.max == null ? null : Number(m.max);
    if (hi == null || !isFinite(hi) || hi === lo || m.value == null) return null;
    return (Number(m.value) - lo) / (hi - lo);
  }

  function meter(app, m) {
    var node = el('div', { class: 'dgu-meter' });
    var head = el('div', { class: 'dgu-meter-h' });
    var lab = el('span', { class: 'dgu-meter-l' });
    var labText = doc.createTextNode(pick(asLabel(m.label), app.lang));
    lab.appendChild(labText);
    if (m.learn && isFn(app.learnButton)) { lab.appendChild(app.learnButton(m.learn)); node.setAttribute('data-learn-topic', m.learn); }
    head.appendChild(lab);
    var val = el('span', { class: 'dgu-meter-v' });
    head.appendChild(val);
    var track = el('div', { class: 'dgu-meter-track' });
    var fill = el('div', { class: 'dgu-meter-fill' });
    track.appendChild(fill);
    node.appendChild(head);
    node.appendChild(track);
    var note = null;
    if (m.hint || m.note) {
      note = el('div', { class: 'dgu-meter-n', text: pick(asLabel(m.hint || m.note), app.lang) });
      node.appendChild(note);
    }

    node.update = function (next) {
      var d = next || m;
      m = d;
      var th = d.thresholds || METER_THRESHOLDS;
      var r = meterRatio(d);
      var ok = r != null && isFinite(r);
      node.className = 'dgu-meter';
      if (d.tone) node.classList.add(d.tone);
      else if (!ok) node.classList.add('none');
      else if (r > th[1]) node.classList.add('bad');
      else if (r > th[0]) node.classList.add('warn');
      fill.style.width = ok ? (Math.max(0, Math.min(1, r)) * 100).toFixed(2) + '%' : '0';
      var txt = d.text != null
        ? pick(asLabel(d.text), app.lang)
        : (d.value == null ? app.t('no_result')
          : fmt(Number(d.value), { precision: d.precision }) + (d.unit ? ' ' + pick(asLabel(d.unit), app.lang) : ''));
      val.textContent = ok || d.text != null || d.value != null ? txt : '—';
      labText.nodeValue = pick(asLabel(d.label), app.lang);
      node.setAttribute('role', 'meter');
      node.setAttribute('aria-valuemin', '0');
      node.setAttribute('aria-valuemax', '100');
      if (ok) node.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(1, r)) * 100)));
      else node.removeAttribute('aria-valuenow');
      node.setAttribute('aria-label', pick(asLabel(d.label), app.lang));
      node.setAttribute('aria-valuetext', txt);
      if (note) note.textContent = pick(asLabel(d.hint || d.note), app.lang);
      /* the limit line: where 1.0 sits when the track runs past it */
      var existing = track.querySelector('.dgu-meter-lim');
      if (ok && r > 1) {
        if (!existing) { existing = el('div', { class: 'dgu-meter-lim' }); track.appendChild(existing); }
        existing.style.left = (100 / r).toFixed(2) + '%';
      } else if (existing) { existing.remove(); }
      return node;
    };
    node.update(m);
    return node;
  }

  /* ------------------------------------------------------------- a transport
     heat2d.html, couldNotMap: "The timeline (play/pause, frame slider, time
     label, playback speed) … The framework has no timeline or transport
     component, and a range Field renders its own numeric readout — it cannot
     show 12 h 0 min."  debrisrunout keeps Run / Pause / Reset motion for the
     same reason, and waterhammer, gesloten-atmosfeer, regelkring, roofstormwater
     and cfd each hand-build play/pause + speed.

       ui.transport({ frames, frame, playing, speed, speeds, label(frame),
                      steps, loop, fps, slot, title,
                      on:{ seek, play, pause, speed, frame } })

     `label(frame, frames)` is the whole point: the readout is the tool's own
     string, not the raw index. If `fps` is declared the framework runs the
     clock and calls on.frame(i); otherwise the tool drives and calls set(). */

  function Transport(app, def) {
    var self = this;
    this.app = app;
    this.def = def = def || {};
    this.frames = Math.max(0, def.frames | 0);
    this.frame = Math.min(def.frame | 0, Math.max(0, this.frames - 1));
    this.playing = !!def.playing;
    this.speeds = def.speeds || [0.25, 0.5, 1, 2, 4];
    this.speed = def.speed != null ? Number(def.speed) : 1;
    this.on = def.on || {};

    this.node = el('div', { class: 'dgu-transport' });
    this.playBtn = app.actionButton({
      icon: '▶', title: app.t('play'), ariaLabel: app.t('play'),
      run: function () { self.toggle(); }
    });
    this.playBtn.setAttribute('aria-pressed', 'false');
    this.node.appendChild(this.playBtn);

    if (def.steps !== false) {
      this.prevBtn = app.actionButton({
        icon: '⏴', title: app.t('prev_frame'), ariaLabel: app.t('prev_frame'),
        run: function () { self.seek(self.frame - 1, true); }
      });
      this.nextBtn = app.actionButton({
        icon: '⏵', title: app.t('next_frame'), ariaLabel: app.t('next_frame'),
        run: function () { self.seek(self.frame + 1, true); }
      });
      this.node.appendChild(this.prevBtn);
      this.node.appendChild(this.nextBtn);
    }

    this.range = el('input', {
      type: 'range', class: 'dgu-tp-range', min: '0', max: '0', step: '1', value: '0',
      'aria-label': pick(asLabel(def.title), app.lang) || app.t('frame')
    });
    on(this.range, 'input', function () { self.seek(Number(self.range.value), true); });
    this.node.appendChild(this.range);

    this.time = el('span', { class: 'dgu-tp-time', role: 'status', 'aria-live': 'off' });
    this.node.appendChild(this.time);

    if (this.speeds && this.speeds.length > 1) {
      this.speedSel = el('select', { class: 'dgu-sel dgu-tp-speed', 'aria-label': app.t('speed') });
      this.speeds.forEach(function (s) {
        self.speedSel.appendChild(el('option', { value: String(s), text: '×' + s }));
      });
      on(this.speedSel, 'change', function () {
        self.speed = Number(self.speedSel.value);
        call(self.on.speed, [self.speed, self], 'transport.speed');
      });
      this.node.appendChild(this.speedSel);
    }
    this.render();
  }

  Transport.prototype.render = function () {
    var app = this.app, empty = this.frames < 1;
    this.node.dataset.empty = empty ? '1' : '0';
    this.range.max = String(Math.max(0, this.frames - 1));
    this.range.value = String(this.frame);
    this.range.disabled = empty;
    this.playBtn.disabled = empty;
    if (this.prevBtn) { this.prevBtn.disabled = empty || (!this.def.loop && this.frame <= 0); }
    if (this.nextBtn) { this.nextBtn.disabled = empty || (!this.def.loop && this.frame >= this.frames - 1); }
    var txt = empty ? app.t('no_frames')
      : (isFn(this.def.label)
        ? String(call(this.def.label, [this.frame, this.frames, this], 'transport.label') || '')
        : (app.t('frame') + ' ' + (this.frame + 1) + ' ' + app.t('of') + ' ' + this.frames));
    this.time.textContent = txt;
    this.range.setAttribute('aria-valuetext', txt);
    var lbl = this.playing ? app.t('pause') : app.t('play');
    this.playBtn.setAttribute('aria-pressed', this.playing ? 'true' : 'false');
    this.playBtn.setAttribute('aria-label', lbl);
    this.playBtn.title = lbl;
    var glyph = this.playBtn.firstChild;
    if (glyph) glyph.textContent = this.playing ? '⏸' : '▶';
    if (this.speedSel) this.speedSel.value = String(this.speed);
    return this;
  };

  Transport.prototype.seek = function (i, fromUser) {
    if (this.frames < 1) return this;
    var n = Math.round(Number(i));
    if (!isFinite(n)) return this;
    if (this.def.loop) n = ((n % this.frames) + this.frames) % this.frames;
    else n = Math.max(0, Math.min(this.frames - 1, n));
    var changed = n !== this.frame;
    this.frame = n;
    this.render();
    if (changed) {
      /* on.frame fires whenever the current frame changes, whatever moved it;
         on.seek fires only for a seek the user made, so a tool can tell the
         difference between "draw this" and "the user went looking". */
      call(this.on.frame, [n, this], 'transport.frame');
      if (fromUser === true) call(this.on.seek, [n, this], 'transport.seek');
    }
    return this;
  };

  Transport.prototype.play = function () {
    if (this.playing || this.frames < 1) return this;
    this.playing = true;
    this.render();
    call(this.on.play, [this], 'transport.play');
    this.startClock();
    return this;
  };
  Transport.prototype.pause = function () {
    if (!this.playing) return this;
    this.playing = false;
    this.render();
    this.stopClock();
    call(this.on.pause, [this], 'transport.pause');
    return this;
  };
  Transport.prototype.toggle = function () { return this.playing ? this.pause() : this.play(); };

  /* The framework only owns the clock when the tool declares an fps: a tool
     whose frames come out of a solver keeps its own loop and just calls set(). */
  Transport.prototype.startClock = function () {
    var self = this;
    if (!this.def.fps || this.timer) return;
    var last = 0;
    var step = function (ts) {
      if (!self.playing) return;
      self.timer = global.requestAnimationFrame(step);
      if (!last) { last = ts; return; }          /* first tick sets the clock */
      var interval = 1000 / (self.def.fps * (self.speed || 1));
      if (ts - last < interval) return;
      last = ts;
      var next = self.frame + 1;
      if (next >= self.frames) {
        if (!self.def.loop) { self.pause(); return; }
        next = 0;
      }
      self.frame = next;
      self.render();
      call(self.on.frame, [next, self], 'transport.frame');
    };
    this.timer = global.requestAnimationFrame(step);
  };
  Transport.prototype.stopClock = function () {
    if (this.timer) { global.cancelAnimationFrame(this.timer); this.timer = null; }
  };

  Transport.prototype.set = function (s) {
    s = s || {};
    if (s.frames != null) this.frames = Math.max(0, s.frames | 0);
    if (s.frame != null) this.frame = s.frame | 0;
    if (this.frames < 1) this.frame = 0;
    else this.frame = Math.max(0, Math.min(this.frames - 1, this.frame));
    if (s.speed != null) this.speed = Number(s.speed);
    if (s.playing != null && !!s.playing !== this.playing) {
      this.playing = !!s.playing;
      if (this.playing) this.startClock(); else this.stopClock();
    }
    if (s.label) this.def.label = s.label;
    return this.render();
  };
  Transport.prototype.destroy = function () { this.stopClock(); };

  /* ------------------------------------------------------------- file import
     heat_exchangers.html, capabilitiesLost: "Loading a previously saved
     `hx-lab-case.json` back into the tool … the shared bar exports JSON but does
     not import it … a user holding old case files genuinely cannot open them any
     more and that deserves naming".  wallthermalcalculator.html: "'Open
     project…' (file import — the shared bar exports but never imports)".
     outdoornoise.html: "Deleting Load case would make every already-saved .json
     scene unopenable".  probabilisticrisk keeps Import JSON / OpenPSA XML;
     debrisrunout keeps Load JSON, "a SCENE file, not the calculation record".

     The shared bar owns export. This is the other half, in the framework, so
     no tool has to hand-build a hidden <input type=file> again. */

  function openFile(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!doc || !global.FileReader) { reject(new Error('no FileReader')); return; }
      var input = el('input', { type: 'file', class: 'dgu-file', accept: opts.accept || null });
      if (opts.multiple) input.multiple = true;
      doc.body.appendChild(input);
      var done = false;
      function finish(fn) { if (done) return; done = true; try { input.remove(); } catch (e) {} fn(); }
      on(input, 'change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) { finish(function () { resolve(null); }); return; }
        var as = opts.as || 'text';
        if (as === 'file') { finish(function () { resolve(opts.multiple ? files : files[0]); }); return; }
        var pending = files.length, out = [], failed = null;
        files.forEach(function (f, i) {
          var fr = new global.FileReader();
          fr.onerror = function () { failed = failed || new Error('read failed'); step(i, null); };
          fr.onload = function () {
            var v = fr.result;
            if (as === 'json') {
              try { v = JSON.parse(String(v)); }
              catch (e) { failed = failed || e; v = null; }
            }
            step(i, v);
          };
          if (as === 'arrayBuffer') fr.readAsArrayBuffer(f);
          else if (as === 'dataURL') fr.readAsDataURL(f);
          else fr.readAsText(f);
          function step(idx, val) {
            out[idx] = { data: val, file: f };
            if (--pending > 0) return;
            finish(function () {
              if (failed) reject(failed);
              else resolve(opts.multiple ? out : out[0]);
            });
          }
        });
      });
      /* a cancelled picker fires no event in every browser: clean up on the
         next interaction rather than leaking the node */
      on(global, 'focus', function () {
        global.setTimeout(function () {
          if (!input.files || !input.files.length) finish(function () { resolve(null); });
        }, 400);
      }, { once: true });
      input.click();
    });
  }

  /* ================================================================ RESULTS */

  function Results(app, host, def) {
    def = def || {};
    this.app = app;
    this.def = def;
    this.host = host;
    /* v3.4 §19: a lookup's answer panel is not called "Results". `reference`
       reads "Selection", because what it shows is the entry the reader chose
       and the state of the filtering that found it. `results:{title:…}`
       overrides either. */
    var heading = def.title != null
      ? pick(asLabel(def.title), app.lang)
      : app.t(app.opts.layout === 'reference' ? 'selection' : 'results');
    this.node = el('section', { class: 'dgu-panel dgu-results' });
    this.stateLine = el('div', { class: 'dgu-state', role: 'status', 'aria-live': 'polite' });
    this.body = el('div', { class: 'dgu-fields' });
    var h = el('div', { class: 'dgu-panel-h' }, [
      el('h2', { class: 'dgu-panel-t', text: heading })
    ]);
    this.node.appendChild(h);
    this.node.appendChild(this.stateLine);
    this.node.appendChild(this.body);
    host.appendChild(this.node);
    this.data = null;
  }

  Results.prototype.set = function (data) {
    this.data = data || null;
    this.render();
  };

  Results.prototype.render = function () {
    var app = this.app, d = this.data;
    clear(this.body);
    var st = app.state_;

    if (st === 'failed') {
      this.body.appendChild(el('div', { class: 'dgu-fail', text: app.failReason || app.t('failed') }));
      this.stateLine.textContent = '';
      return;
    }
    if (!d || (!d.tiles && !d.tables && !d.verdict && !d.nodes && !d.meters && !d.legend &&
               !d.entry && !d.filter)) {
      /* v3.4 §19: "Adjust an input to see the result" is a calculator's line.
         A catalogue asks you to choose an entry, and it is the only archetype
         whose pending state is the state it spends most of its life in. */
      var msg = app.opts.layout === 'reference' ? app.t('pending_lookup')
        : (app.opts.compute === 'run' ? app.t('pending_run') : app.t('pending_live'));
      var intro = app.opts.learn && app.opts.learn.intro;
      var box = el('div', { class: 'dgu-empty' });
      if (intro) {
        box.appendChild(el('h3', {
          style: { margin: '0 0 6px', font: '650 var(--fs-body)/1.3 var(--font)', color: 'var(--ink)' },
          text: pick(asLabel(intro.title), app.lang)
        }));
        box.appendChild(el('p', { style: { margin: '0 0 8px' }, text: pick(asLabel(intro.body), app.lang) }));
      }
      box.appendChild(el('div', { text: msg }));
      this.body.appendChild(box);
      this.renderStateLine();
      return;
    }
    /* v3.4 §19 — the state of the filtering, above whatever it found. It is
       first because it is the question, and the entry below it is the answer. */
    if (d.filter) this.body.appendChild(this.filterBar(d.filter));
    if (d.verdict) {
      this.body.appendChild(el('div', {
        class: 'dgu-verdict ' + (d.verdict.tone || ''),
        text: pick(asLabel(d.verdict.text != null ? d.verdict.text : d.verdict), app.lang)
      }));
    }
    /* no match is an answer, and it is the one every reference tool in the tree
       wrote by hand. When the filter found nothing there is no entry to show,
       so the card is skipped rather than rendered empty. */
    if (d.filter && d.filter.shown === 0) {
      var none = el('div', { class: 'dgu-empty' });
      none.appendChild(el('div', {
        text: d.filter.emptyText != null ? pick(asLabel(d.filter.emptyText), app.lang) : app.t('no_match')
      }));
      if (isFn(d.filter.clear)) {
        none.appendChild(app.actionButton({
          label: app.t('clear_filters'), variant: 'ghost', run: d.filter.clear
        }));
      }
      this.body.appendChild(none);
    } else if (d.entry) {
      this.body.appendChild(this.entryCard(d.entry));
    }
    if (d.tiles && d.tiles.length) {
      var grid = el('div', { class: 'dgu-tiles' });
      d.tiles.forEach(function (t) { grid.appendChild(this.tile(t)); }, this);
      this.body.appendChild(grid);
    }
    /* meters sit with the tiles: they are headline numbers that carry a limit */
    if (d.meters && d.meters.length) {
      var mbox = el('div', { class: 'dgu-meters' });
      d.meters.forEach(function (m) { if (m) mbox.appendChild(meter(app, m)); });
      this.body.appendChild(mbox);
    }
    (d.tables || []).forEach(function (t) { this.body.appendChild(this.table(t)); }, this);
    (d.nodes || []).forEach(function (n) { if (n) this.body.appendChild(n); }, this);
    if (d.legend) this.body.appendChild(legend(Array.isArray(d.legend) ? { items: d.legend } : d.legend, app.lang));
    (d.notes || []).forEach(function (n) {
      this.body.appendChild(el('p', { class: 'dgu-hint', text: pick(asLabel(n), app.lang) }));
    }, this);
    this.renderStateLine();
    this.app.renderStrip(d);
    measureTables();
  };

  /* ------------------------------------------- 19.2 the filter state line ----
     `filter:{shown,total,chips,clear,note}`. Every reference tool in the tree
     wrote some part of this: weldsymbols put "Shown 33 / 33" in a table foot,
     periodictable wrote a `no_selection` sentence, kernnormenwijzer and
     normenwijzer counted their registers. It is one line, and the framework
     owns it so the count and the clear affordance read the same on all of them.

     A chip whose `clear` is a function gets a ✕; one without is a statement.
     `clear` on the bar itself is "clear all", and is only drawn when there is
     at least one chip to clear, because a dead Reset is worse than none. */
  Results.prototype.filterBar = function (f) {
    var app = this.app, bar = el('div', { class: 'dgu-filterbar' });
    if (typeof f.shown === 'number') {
      var count = el('span', { class: 'dgu-filterbar-c' });
      count.appendChild(doc.createTextNode(
        (f.label != null ? pick(asLabel(f.label), app.lang) : app.t('showing')) + ' '));
      count.appendChild(el('b', {
        text: typeof f.total === 'number' && f.total !== f.shown
          ? fmt(f.shown, { precision: 0 }) + ' / ' + fmt(f.total, { precision: 0 })
          : fmt(f.shown, { precision: 0 })
      }));
      bar.appendChild(count);
    }
    var chips = f.chips || [];
    chips.forEach(function (c) {
      if (!c) return;
      var chip = el('span', { class: 'dgu-fchip' });
      if (c.label != null) chip.appendChild(el('b', { text: pick(asLabel(c.label), app.lang) + ' ' }));
      chip.appendChild(el('span', {
        text: pick(asLabel(c.text != null ? c.text : c.value), app.lang)
      }));
      if (isFn(c.clear)) {
        var x = el('button', {
          type: 'button', text: '✕',
          'aria-label': app.t('remove_filter') + ' — ' +
            pick(asLabel(c.label != null ? c.label : (c.text != null ? c.text : c.value)), app.lang)
        });
        on(x, 'click', function () { call(c.clear, [app], 'filter.chip.clear'); });
        chip.appendChild(x);
      }
      bar.appendChild(chip);
    });
    if (isFn(f.clear) && chips.length) {
      bar.appendChild(app.actionButton({
        label: app.t('clear_filters'), variant: 'ghost', run: f.clear
      }));
    }
    if (f.note != null) {
      bar.appendChild(el('span', { class: 'dgu-hint', text: pick(asLabel(f.note), app.lang) }));
    }
    return bar;
  };

  /* ---------------------------------------------- 19.3 the selected entry ----
     `entry:{id,kicker,title,subtitle,rows,nodes,notes}`. The answer of a
     lookup. `rows` is a definition list rather than a table because a table
     cell is nowrap by design (§7.2) and half of what a catalogue entry says is
     a sentence. A row carries the same `unit` / `precision` contract as a tile,
     so a reference tool that does hold a number states it the same way the
     rest of the site does. */
  Results.prototype.entryCard = function (e) {
    var app = this.app, card = el('div', { class: 'dgu-entry' });
    if (e.id != null) card.dataset.entry = String(e.id);
    if (e.kicker != null) card.appendChild(el('div', { class: 'dgu-entry-k', text: pick(asLabel(e.kicker), app.lang) }));
    if (e.title != null) {
      var t3 = el('h3', { class: 'dgu-entry-t', text: pick(asLabel(e.title), app.lang) });
      if (e.learn) { t3.appendChild(app.learnButton(e.learn)); card.setAttribute('data-learn-topic', e.learn); }
      card.appendChild(t3);
    }
    if (e.subtitle != null) card.appendChild(el('p', { class: 'dgu-entry-s', text: pick(asLabel(e.subtitle), app.lang) }));
    var rows = e.rows || e.facts || [];
    if (rows.length) {
      var dl = el('dl', { class: 'dgu-dl' });
      rows.forEach(function (r) {
        if (!r) return;
        dl.appendChild(el('dt', { text: pick(asLabel(r.label), app.lang) }));
        var ue = r.unit ? unitFor(r, app.opts.units && app.opts.units.overrides) : null;
        var v = r.value;
        var numeric = typeof v === 'number';
        if (numeric && ue) v = toDisplay(v, ue);
        var dd = el('dd', { class: (numeric ? 'num ' : '') + (r.tone || '') });
        if (r.node && r.node.nodeType === 1) dd.appendChild(r.node);
        else {
          dd.appendChild(doc.createTextNode(
            (v == null || v === '') ? '—'
              : (numeric ? fmt(v, { precision: r.precision }) : pick(asLabel(v), app.lang))
              + (r.unit ? ' ' + unitLabel(ue, r.unit) : '')));
        }
        if (r.hint != null) dd.appendChild(el('small', { text: pick(asLabel(r.hint), app.lang) }));
        dl.appendChild(dd);
      });
      card.appendChild(dl);
    }
    (e.nodes || []).forEach(function (n) { if (n && n.nodeType === 1) card.appendChild(n); });
    (e.notes || []).forEach(function (n) {
      card.appendChild(el('p', { class: 'dgu-hint', text: pick(asLabel(n), app.lang) }));
    });
    return card;
  };

  Results.prototype.tile = function (t) {
    var app = this.app;
    var ue = t.unit ? unitFor(t, app.opts.units && app.opts.units.overrides) : null;
    var v = t.value;
    if (typeof v === 'number' && ue) v = toDisplay(v, ue);
    var node = el('div', { class: 'dgu-tile ' + (t.tone || '') });
    var lab = el('div', { class: 'dgu-tile-l', text: pick(asLabel(t.label), app.lang) });
    if (t.learn) { lab.appendChild(app.learnButton(t.learn)); node.setAttribute('data-learn-topic', t.learn); }
    node.appendChild(lab);
    var val = el('div', { class: 'dgu-tile-v' });
    if (app.state_ === 'computing' && t.value == null) val.appendChild(el('span', { class: 'dgu-skel' }));
    else val.textContent = (v == null || v === '')
      ? '—'
      : (typeof v === 'number' ? fmt(v, { precision: t.precision }) : String(v));
    node.appendChild(val);
    if (t.unit) node.appendChild(el('div', { class: 'dgu-tile-u', text: unitLabel(ue, t.unit) }));
    if (t.hint) node.appendChild(el('div', { class: 'dgu-tile-u', text: pick(asLabel(t.hint), app.lang) }));
    if ((v == null || v === '') && !t.hint) {
      node.appendChild(el('div', { class: 'dgu-tile-u', text: app.t('no_result') }));
    }
    return node;
  };

  Results.prototype.table = function (t) {
    return table(this.app, t);
  };

  Results.prototype.renderStateLine = function () {
    var app = this.app, st = app.state_;
    clear(this.stateLine);
    this.stateLine.className = 'dgu-state';
    if (st === 'computing') {
      this.stateLine.textContent = app.t('computing');
    } else if (st === 'stale') {
      this.stateLine.classList.add('stale');
      this.stateLine.appendChild(el('span', { text: app.t('stale') }));
      if (app.opts.compute === 'run') {
        this.stateLine.appendChild(app.actionButton({
          label: app.t('recompute'), variant: 'primary', run: function () { app.run(); }
        }));
      }
    } else if (st === 'error') {
      this.stateLine.classList.add('error');
      this.stateLine.textContent = app.errorText || app.t('invalid');
    } else if (st === 'ready' && app.opts.compute === 'live') {
      this.stateLine.appendChild(el('span', { class: 'dgu-chip ok', text: app.t('live') }));
    }
  };

  /* ============================================================ TABS / STEPS */

  function Tabs(app, def, host) {
    this.app = app; this.def = def; this.items = def.items || [];
    this.value = def.value != null ? def.value : (this.items[0] && this.items[0].id);
    this.node = el('div', { class: 'dgu-tabs', role: 'tablist' });
    this.buttons = [];
    var self = this;
    this.items.forEach(function (it, i) {
      var b = el('button', {
        class: 'dgu-tab', type: 'button', role: 'tab', id: uid('tab'),
        'aria-selected': String(it.id === self.value),
        tabindex: it.id === self.value ? '0' : '-1',
        text: pick(asLabel(it.label), app.lang)
      });
      if (it.panel) b.setAttribute('aria-controls', it.panel);
      on(b, 'click', function () { self.select(it.id); });
      on(b, 'keydown', function (e) {
        var idx = self.items.indexOf(it), n = null;
        if (e.key === 'ArrowRight') n = (idx + 1) % self.items.length;
        else if (e.key === 'ArrowLeft') n = (idx - 1 + self.items.length) % self.items.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = self.items.length - 1;
        if (n != null) { e.preventDefault(); self.select(self.items[n].id); self.buttons[n].focus(); }
      });
      self.buttons.push(b);
      self.node.appendChild(b);
    });
    host.appendChild(this.node);
  }
  Tabs.prototype.select = function (id) {
    this.value = id;
    var self = this;
    this.items.forEach(function (it, i) {
      var sel = it.id === id;
      self.buttons[i].setAttribute('aria-selected', String(sel));
      self.buttons[i].tabIndex = sel ? 0 : -1;
    });
    call(this.def.onSelect, [id, this], 'tabs.onSelect');
  };

  function Steps(app, def, host) {
    /* UI_AUDIT.md S-16: steps always carry their names. Below md the strip
       becomes a labelled dropdown, never a row of bare digits. */
    this.app = app; this.def = def; this.items = def.items || [];
    this.value = def.value != null ? def.value : (this.items[0] && this.items[0].id);
    var self = this;
    this.node = el('div', { class: 'dgu-panel' });
    this.list = el('div', { class: 'dgu-steps', role: 'tablist', 'aria-orientation': 'vertical' });
    this.select_ = el('select', { class: 'dgu-sel', 'aria-label': def.label || 'Step' });
    this.buttons = [];
    this.items.forEach(function (it, i) {
      var b = el('button', {
        class: 'dgu-step', type: 'button', role: 'tab',
        'aria-selected': String(it.id === self.value),
        'aria-current': it.id === self.value ? 'step' : null
      }, [
        el('span', { class: 'dgu-step-n', text: String(i + 1) }),
        el('span', { class: 'dgu-step-t', text: pick(asLabel(it.label), app.lang) })
      ]);
      on(b, 'click', function () { self.select(it.id); });
      self.buttons.push(b);
      self.list.appendChild(b);
      self.select_.appendChild(el('option', {
        value: it.id, text: (i + 1) + '. ' + pick(asLabel(it.label), app.lang)
      }));
    });
    on(this.select_, 'change', function () { self.select(self.select_.value); });
    /* step-select-sync (3 files; verwarmenkoelenselector.html: "the Steps
       constructor sets aria-selected on its buttons from `value` but never
       writes that value into the <select> it also builds, so below 768px —
       where the select IS the step control — a sheet that arrives on step 3
       shows '1. Project and building' over the third form"). */
    if (this.value != null) this.select_.value = this.value;
    this.node.appendChild(this.list);
    this.node.appendChild(this.select_);
    var mq = global.matchMedia ? global.matchMedia('(max-width: 768px)') : null;
    var apply = function () {
      var narrow = mq ? mq.matches : false;
      self.list.hidden = narrow;
      self.select_.hidden = !narrow;
    };
    apply();
    if (mq && mq.addEventListener) mq.addEventListener('change', apply);
    host.appendChild(this.node);
  }
  /* Move the marker without announcing a user choice. luchtgroepselector.html
     and verwarmenkoelenselector.html both hand-roll exactly this as
     `syncSteps()` because the framework offered no way to reflect a step the
     tool itself changed; both call it from on.compute. Additive. */
  Steps.prototype.sync = function (id) {
    if (id === undefined) id = this.value;
    this.value = id;
    var self = this;
    this.items.forEach(function (it, i) {
      var sel = it.id === id;
      self.buttons[i].setAttribute('aria-selected', String(sel));
      if (sel) self.buttons[i].setAttribute('aria-current', 'step');
      else self.buttons[i].removeAttribute('aria-current');
    });
    if (this.select_.value !== String(id)) this.select_.value = id;
    return this;
  };

  Steps.prototype.select = function (id) {
    this.sync(id);
    call(this.def.onSelect, [id, this], 'steps.onSelect');
  };

  /* ================================================================== STAGE */

  function Stage(app, def, host) {
    /* UI_AUDIT.md S-13: sizing comes from a ResizeObserver, never from a fixed
       pixel constant; labels stay physical; below md the tool is told to draw
       at a coarser density. */
    this.app = app;
    this.def = def || {};
    this.node = el('section', { class: 'dgu-stage' });
    this.body = el('div', { class: 'dgu-stage-body' });
    this.tools = el('div', { class: 'dgu-stage-tools' });
    this.a11y = el('div', { class: 'dgu-sr', role: 'status', 'aria-live': 'polite' });
    this.node.appendChild(this.body);
    this.node.appendChild(this.tools);
    this.node.appendChild(this.a11y);
    if (def.caption) this.node.appendChild(el('div', { class: 'dgu-stage-cap', text: pick(asLabel(def.caption), app.lang) }));
    if (def.minHeight) this.node.style.minHeight = def.minHeight + 'px';
    host.appendChild(this.node);

    var self = this;
    if (isFn(def.fit)) {
      this.addTool({ label: app.t('fit'), title: app.t('fit'), run: function () { self.fit(); } });
    }
    this.raf = null;
    this.size = { w: 0, h: 0, dpr: 1, density: 'fine' };
    if (global.ResizeObserver) {
      this.ro = new global.ResizeObserver(function () { self.schedule(); });
      this.ro.observe(this.body);
    } else {
      this.unbindResize = on(global, 'resize', function () { self.schedule(); });
    }
    /* CLOSE-THE-LOOP 4. The stage repaints itself when the theme changes.
       weldsymbols.html: "Stage listens to resize but not to the framework's own
       'diagram-ui:theme' event, so every canvas tool must subscribe by hand or
       show stale colours after a theme toggle" — it was the only one of the four
       new tools that read the source and found `DiagramUI.theme.watch`.
       Measured before this fix, toggling the theme and comparing the canvas
       bitmap: flangejoint, trussframe, damperselect and ui-demo.html were all
       STALE; weldsymbols and doppler (which subscribe by hand) repainted.
       schedule() is rAF-coalesced, so a tool that already subscribes pays
       nothing for the second call. */
    this.unbindTheme = theme.watch(function () { self.schedule(); });

    /* §18 the scene primitive. Declared on the stage, because the drawing and
       the way it is driven are one thing; both are built AFTER the resize and
       theme wiring above so a scene stage inherits both for free. */
    if (def.interact) this.interaction = new Interaction(this, def.interact);
    if (def.scene) { var sc = new SceneStage(this, def.scene); this.sceneStage = sc.build() ? sc : null; }

    setTimeout(function () { self.schedule(); self.fit(); }, 0);
  }

  /* fourier_series.html: "ui.stage offers caption but no legend slot … Injected
     as a row inside the stage node above the caption." That is now the slot.
     Returns the legend node; call node.update(items) to change it. */
  Stage.prototype.legend = function (def) {
    if (!this.legendNode) {
      this.legendNode = legend(def || {}, this.app.lang);
      this.legendNode.classList.add('dgu-stage-legend');
      var cap = this.node.querySelector('.dgu-stage-cap');
      if (cap) this.node.insertBefore(this.legendNode, cap);
      else this.node.appendChild(this.legendNode);
    } else if (def && def.items) {
      this.legendNode.update(def.items, this.app.lang);
    }
    return this.legendNode;
  };

  Stage.prototype.addTool = function (a) {
    var b = this.app.actionButton(a);
    b.classList.add('icon');
    this.tools.appendChild(b);
    return b;
  };

  Stage.prototype.schedule = function () {
    var self = this;
    if (this.raf) return;
    this.raf = global.requestAnimationFrame(function () {
      self.raf = null;
      self.measure();
      call(self.def.render, [self.size, self], 'stage.render');
      /* a hosted 3D scene paints itself only when the tool did not declare a
         render of its own; otherwise the tool owns the canvas and would be
         drawn over */
      if (self.sceneStage && !isFn(self.def.render)) self.sceneStage.draw();
      if (isFn(self.def.a11y)) {
        var txt = call(self.def.a11y, [self.size, self], 'stage.a11y');
        if (txt) self.a11y.textContent = String(txt);
      }
    });
  };

  Stage.prototype.measure = function () {
    var r = this.body.getBoundingClientRect();
    var min = this.def.minHeight || 260;
    this.size = {
      w: Math.max(1, Math.round(r.width)),
      h: Math.max(min, Math.round(r.height)),
      dpr: Math.min(global.devicePixelRatio || 1, 2),
      density: global.innerWidth < 768 ? 'coarse' : 'fine'
    };
    /* §18: the map is the framework's, so it is rebuilt exactly once per
       frame, before the tool's resize and its render both read it. `live` is
       true only while a gesture is in flight — that is the flag a tool checks
       to skip the expensive half of its drawing mid-drag. */
    if (this.interaction) {
      this.size.live = !!this.interaction.drag;
      this.size.map = this.interaction.remeasure(this.size);
    }
    call(this.def.resize, [this.size, this], 'stage.resize');
    return this.size;
  };

  Stage.prototype.canvas = function () {
    if (!this.cv) {
      this.cv = el('canvas', {});
      this.body.appendChild(this.cv);
    }
    var s = this.measure();
    var w = Math.round(s.w * s.dpr), h = Math.round(s.h * s.dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.cv.style.width = s.w + 'px';
    this.cv.style.height = s.h + 'px';
    var ctx = this.cv.getContext('2d');
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    return ctx;
  };

  Stage.prototype.fit = function () { call(this.def.fit, [this.size, this], 'stage.fit'); };

  Stage.prototype.destroy = function () {
    if (this.interaction) { this.interaction.destroy(); this.interaction = null; }
    if (this.sceneStage) { this.sceneStage.destroy(); this.sceneStage = null; }
    if (this.ro) { try { this.ro.disconnect(); } catch (e) {} }
    if (this.unbindResize) this.unbindResize();
    if (this.unbindTheme) { try { this.unbindTheme(); } catch (e) {} this.unbindTheme = null; }
    if (this.raf) global.cancelAnimationFrame(this.raf);
  };

  /* tick density: the same rule in every tool, coarser on a phone */
  Stage.ticks = function (min, max, px, density) {
    var target = Math.max(2, Math.floor(px / (density === 'coarse' ? 90 : 60)));
    var span = max - min;
    if (!(span > 0)) return [min];
    var raw = span / target;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var out = [], v = Math.ceil(min / step) * step;
    for (; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  };

  /* ================================================================= NOTICE */
  /* A standing qualification on the whole answer — the genre warning, the
     freshness banner, the structural-check failure. Five ports built one by
     hand and two lost the behaviour that made it work:
       kernnormenwijzer: "The warning bar is no longer sticky. Its text is
         intact … but it now scrolls away instead of holding 21% of a 390px
         viewport for the whole page."
       normenwijzer: "The genre warning is no longer sticky. It used to follow
         the reader down the page (and cost 184 px, 22 %, of a 390 px viewport
         permanently)."
       normenwijzer again, in `moved`: "the persistent genre warning: sticky bar
         pinned to the top of the viewport → a static block at the top of the
         stage region".
       procesklimaat: "the genre honesty note and the structural-check failure
         banner -> the top of the inputs column".
       gesloten-atmosfeer: tiles and table "first in the results region, under
         the warning bars".
       smrselector: "the freshness banner (toy warning, knowledge date,
         staleness …) → the footer".
     Both measurements say the same thing: sticky is worth having only if it is
     cheap. So a sticky notice is clamped to two lines with a Show more
     disclosure and can be dismissed, and it remembers the dismissal. Two lines
     of --fs-small plus padding is ~56 px: 14% of a 390 px viewport against the
     21-22% the two readers' tools were paying. */

  function Notice(app, def) {
    this.app = app;
    this.def = def = def || {};
    this.id = def.id || uid('dgu-notice');
    this.sticky = !!def.sticky;
    this.compact = def.compact !== false && this.sticky;
    this.dismissible = def.dismissible == null ? this.sticky : !!def.dismissible;
    this.remembers = !!(def.id && this.dismissible && def.remember !== false);
    this.expanded = false;
    this.build();
  }

  Notice.prototype.build = function () {
    var self = this, app = this.app, d = this.def;
    var live = !!d.live;
    this.node = el('div', {
      class: 'dgu-notice',
      role: live ? 'status' : 'note',
      'aria-live': live ? 'polite' : null,
      'aria-label': d.title ? null : app.t('notice'),
      dataset: { tone: d.tone || 'warn', sticky: this.sticky ? 'true' : 'false' }
    });
    this.node.appendChild(el('span', { class: 'dgu-notice-mark', 'aria-hidden': 'true' }));
    var body = el('div', { class: 'dgu-notice-b' });
    if (d.title) body.appendChild(el('strong', { class: 'dgu-notice-h', text: pick(asLabel(d.title), app.lang) }));
    this.textId = this.id + '-tx';
    this.text = el('div', { class: 'dgu-notice-tx', id: this.textId });
    if (isFn(d.render)) call(d.render, [this.text, app], 'notice.render');
    else this.text.textContent = pick(asLabel(d.text), app.lang);
    body.appendChild(this.text);
    this.node.appendChild(body);

    var acts = el('div', { class: 'dgu-notice-a' });
    if (this.compact) {
      this.moreBtn = el('button', {
        type: 'button', class: 'dgu-btn ghost dgu-notice-more',
        'aria-expanded': 'false', 'aria-controls': this.textId, text: app.t('more'), hidden: true
      });
      on(this.moreBtn, 'click', function () { self.setExpanded(!self.expanded); });
      acts.appendChild(this.moreBtn);
    }
    (d.actions || []).forEach(function (a) { acts.appendChild(app.actionButton(a)); });
    if (this.dismissible) {
      this.closeBtn = el('button', {
        type: 'button', class: 'dgu-btn ghost icon dgu-notice-x',
        'aria-label': app.t('dismiss'), title: app.t('dismiss'), text: '✕'
      });
      on(this.closeBtn, 'click', function () { self.dismiss(); });
      acts.appendChild(this.closeBtn);
    }
    this.node.appendChild(acts);

    this.setExpanded(false, true);
    if (this.remembers && nsGet('notice', d.id, app) === '1') this.node.hidden = true;
    /* the disclosure appears only when the text really is longer than its clamp */
    this.measureSoon = debounce(function () { self.measure(); }, 80);
    if (this.compact) {
      this.unbindResize = on(global, 'resize', this.measureSoon);
      global.setTimeout(function () { self.measure(); }, 0);
    }
  };

  Notice.prototype.measure = function () {
    if (!this.moreBtn || this.node.hidden) return;
    if (this.expanded) { this.moreBtn.hidden = false; return; }
    var over = this.text.scrollHeight - this.text.clientHeight > 2;
    this.moreBtn.hidden = !over;
  };

  Notice.prototype.setExpanded = function (flag, quiet) {
    this.expanded = !!flag;
    this.node.setAttribute('data-clamped', this.compact && !this.expanded ? 'true' : 'false');
    if (this.moreBtn) {
      this.moreBtn.setAttribute('aria-expanded', this.expanded ? 'true' : 'false');
      this.moreBtn.textContent = this.app.t(this.expanded ? 'less' : 'more');
    }
    if (!quiet) this.measure();
    return this;
  };

  Notice.prototype.set = function (v) {
    if (v == null) return this;
    if (typeof v === 'string' || (v && !v.nodeType && !v.text && !v.tone)) this.text.textContent = pick(asLabel(v), this.app.lang);
    else {
      if (v.text != null) this.text.textContent = pick(asLabel(v.text), this.app.lang);
      if (v.tone) this.node.dataset.tone = v.tone;
    }
    this.measure();
    return this;
  };

  Notice.prototype.show = function () { this.node.hidden = false; this.measure(); return this; };
  Notice.prototype.hide = function () { this.node.hidden = true; return this; };
  Notice.prototype.dismiss = function () {
    this.node.hidden = true;
    if (this.remembers) nsSet('notice', this.def.id, '1', this.app);
    call(this.def.onDismiss, [this], 'notice.onDismiss');
    return this;
  };
  /* a dismissal is a preference, not a deletion: the tool can bring it back */
  Notice.prototype.reset = function () {
    if (this.remembers) nsSet('notice', this.def.id, null, this.app);
    return this.show();
  };
  Notice.prototype.destroy = function () { if (this.unbindResize) this.unbindResize(); };

  /* =============================================================== SPLITTERS */
  /* Drag-resizable regions with remembered sizes. Every studio-shaped port
     built this by hand and every one of them lost it:
       nuclideatlas, couldNotMap: "A resizable split between the chart, the
         inspector and the laboratory … UI_FRAMEWORK_SPEC §13.3 says
         bindSplitter moves into diagram-ui.js, but the shipped file does not
         export it"; capabilitiesLost: "Dragging the two pane splitters … with
         their keyboard resize (arrows, Home to reset) and their remembered
         sizes in localStorage".
       decayheat: "the aside could be resized 240–680px by dragging `#splitter`,
         reset by double-click … with the width … remembered in localStorage".
       neutron_transport: "The three drag splitters and their remembered sizes …
         with double-click to reset, and the sizes survived a reload …
         diagram-ui.js has no resizable-region primitive. … Three tools asking
         for this would be a framework feature".
       roofstormwater: "the user could resize the model column, the result
         column and the chart strip by dragging (double-click to reset, widths
         persisted in localStorage as roof_left_w/roof_right_w/roof_chart_h)".
       outdoornoise, couldNotMap: "Splitter-resizable columns (left palette,
         right inspector, bottom dock) … there is no framework equivalent".
       cfd, deleted: "the four splitters … setupSplitters() (~60 lines) and the
         four localStorage keys".
     Six tools; neutron_transport set the bar at three. The archetype still owns
     the shape — the framework's own track sizes are the defaults and the reset
     target, the flexible track stays flexible and can never be squeezed below a
     readable width, and below the archetype's multi-column breakpoint the
     handles are not there at all. */

  var SPLIT_MIN_FLEX = 320;   /* the stage never gets squeezed below this */
  var SPLIT_FOLD_W = 34;      /* a folded rail: wide enough for its own title */
  var SPLIT_STEP = 16;        /* one arrow press */
  var SPLIT_STEP_BIG = 48;    /* with Shift */

  function splitTarget(app, def) {
    var t = def.target || def.node;
    if (t) {
      if (t.nodeType === 1) return t;
      if (typeof t === 'string') return resolveHost(t);
      if (t.node && t.node.nodeType === 1) return t.node;   /* a Stage, a Panel */
    }
    return app.regions[def.region || 'inputs'] || null;
  }

  function Splitter(app, def) {
    this.app = app;
    this.def = def = def || {};
    this.axis = def.axis === 'y' ? 'y' : 'x';
    this.target = splitTarget(app, def);
    this.key = def.key || def.region || (def.target && def.target.id) || uid('split');
    this.edge = 'end';
    this.trackIndex = -1;
    this.size = null;
    this.active = false;
    if (!this.target) { warn('resizable: no target for ' + this.key); return; }
    var saved = parseFloat(nsGet('layout', this.key, app));
    if (isFinite(saved) && saved > 0) this.size = saved;
    else {
      var initial = parseFloat(def.initial);
      if (isFinite(initial) && initial > 0) this.size = initial;
    }
    this.build();
  }

  Splitter.prototype.build = function () {
    var self = this, app = this.app;
    this.target.classList.add('dgu-resizable');
    /* v3.2 P9 — the handle hangs on the region's WRAPPER, never inside the
       region. A region that is also a scrolling pane computes overflow-x:auto
       (one axis auto forces the other off `visible`), and the handle is placed
       by design in the grid gutter OUTSIDE that box, so the pane clipped it
       away: on roomacoustics the detail splitter had a correct 11x760 rect,
       role=separator, working arrow keys — and elementFromPoint returned
       DIV.dgu-main down its whole length, at 1440 and at 1280. The wrapper does
       not scroll, so the gutter is reachable again. */
    var host = this.target;
    var rname = this.target.dataset ? this.target.dataset.region : null;
    /* the pane box, not the wrapper: same "outside the scroll box" property,
       but exactly the region's height instead of the whole grid area's */
    if (this.axis === 'x' && rname && app.paneBoxes && app.paneBoxes[rname] &&
        app.paneBoxes[rname] === this.target.parentNode) host = app.paneBoxes[rname];
    host.classList.add('dgu-resizable');
    this.host = host;
    this.node = el('div', {
      class: 'dgu-split',
      role: 'separator',
      tabindex: '0',
      'aria-orientation': this.axis === 'x' ? 'vertical' : 'horizontal',
      'aria-label': app.t('resize') + (this.def.label ? ' — ' + pick(asLabel(this.def.label), app.lang) : ''),
      title: app.t('resize_help'),
      dataset: { axis: this.axis, edge: this.edge },
      hidden: true
    }, [el('span', { class: 'dgu-split-grip', 'aria-hidden': 'true' })]);
    host.appendChild(this.node);

    /* v3.6.2 §22.10 — a rail you can widen is a rail you should be able to put
       away. Dragging one to its minimum still leaves 220 px of column between
       the reader and the stage, and on a studio tool with two rails that is 550
       px of screen that cannot be reclaimed at all. The fold button is a real
       <button> with `aria-expanded`, riding the viewport on the handle so it is
       reachable wherever the column is; folding takes the track to 34 px and
       leaves the region's own title running down it, so the rail is put away in
       the §4.2 sense — collapsed to a control, never `display:none`. */
    if (this.axis === 'x') {
      this.fold = el('button', {
        class: 'dgu-split-fold', type: 'button',
        'aria-expanded': 'true',
        title: app.t('fold_help'),
        'aria-label': app.t('fold')
      }, [el('span', { class: 'dgu-split-chev', 'aria-hidden': 'true' })]);
      /* The button lives in the PANE BOX's corner, not on the handle. On the
         handle it was a 22 px control centred in an 11 px box sitting in a
         16 px gutter, so it stuck out on both sides — at 768 px on
         roomacoustics that put 19 px of horizontal overflow on the document and
         `check.js` said so. The corner is also where a reader looks for it:
         a collapse chevron belongs to the panel, not to the seam between two
         panels. */
      (host || this.node).appendChild(this.fold);
      this.fold.dataset.edge = this.edge || '';
      on(this.fold, 'pointerdown', function (e) { e.stopPropagation(); });
      on(this.fold, 'dblclick', function (e) { e.stopPropagation(); });
      on(this.fold, 'click', function (e) {
        e.preventDefault(); e.stopPropagation();
        self.setFolded(!self.folded);
      });
    }

    on(this.node, 'pointerdown', function (e) {
      if (e.button) return;
      if (self.node.hidden) return;
      try { self.node.setPointerCapture(e.pointerId); } catch (err) {}
      self.from = { x: e.clientX, y: e.clientY, size: self.current() };
      self.node.setAttribute('data-dragging', 'true');
      e.preventDefault();
    });
    on(this.node, 'pointermove', function (e) {
      if (!self.from) return;
      var d = self.axis === 'x' ? e.clientX - self.from.x : e.clientY - self.from.y;
      if (self.edge === 'start') d = -d;
      self.set(self.from.size + d);
    });
    var end = function (e) {
      if (!self.from) return;
      self.from = null;
      self.node.removeAttribute('data-dragging');
      try { self.node.releasePointerCapture(e.pointerId); } catch (err) {}
      self.remember();
    };
    on(this.node, 'pointerup', end);
    on(this.node, 'pointercancel', end);
    /* every one of the six tools reset on double-click; keep the gesture */
    on(this.node, 'dblclick', function (e) { e.preventDefault(); self.reset(); });
    on(this.node, 'keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key, step = e.shiftKey ? SPLIT_STEP_BIG : SPLIT_STEP, dir = 0;
      if (self.axis === 'x' && (k === 'ArrowLeft' || k === 'ArrowRight')) dir = k === 'ArrowRight' ? 1 : -1;
      else if (self.axis === 'y' && (k === 'ArrowUp' || k === 'ArrowDown')) dir = k === 'ArrowDown' ? 1 : -1;
      else if (k === 'Home') { self.reset(); e.preventDefault(); return; }   /* nuclideatlas's own key */
      else return;
      if (self.edge === 'start') dir = -dir;
      self.set(self.current() + dir * step);
      self.remember();
      e.preventDefault();
    });
  };

  Splitter.prototype.bounds = function () {
    var d = this.def;
    var lo = d.min == null ? (this.axis === 'x' ? 200 : 180) : d.min;
    var hi = d.max == null ? (this.axis === 'x' ? 720 : 900) : d.max;
    if (this.axis === 'y' && this.target) {
      /* the stage's own minHeight still rules: never store a size it cannot take */
      var mh = parseFloat(global.getComputedStyle(this.target).minHeight);
      if (isFinite(mh) && mh > lo) lo = mh;
    }
    return { lo: lo, hi: Math.max(lo, hi) };
  };

  Splitter.prototype.current = function () {
    if (this.size != null) return this.size;
    if (!this.target) return 0;
    var r = this.target.getBoundingClientRect();
    return this.axis === 'x' ? r.width : r.height;
  };

  Splitter.prototype.set = function (px) {
    var b = this.bounds();
    this.size = clamp(Math.round(px), b.lo, b.hi);
    /* a height needs no grid arithmetic, so a drag on the y axis costs one
       style write per move on pages where a full re-measure would not be free */
    if (this.axis === 'y') this.applyY(true);
    else this.app.applyLayout();
    return this.size;
  };

  Splitter.prototype.reset = function () {
    this.size = null;
    nsSet('layout', this.key, null, this.app);
    if (this.axis === 'y' && this.target) this.target.style.height = '';
    this.app.applyLayout();
    call(this.def.onResize, [null, this], 'splitter.onResize');
    return this;
  };

  /* Folding is NOT a size: `bounds()` would clamp 34 px straight back up to the
     archetype's minimum, and a folded rail that remembers 34 as its width would
     have nothing to unfold to. It is a separate state, stored separately, and
     applyLayout() reads it instead of the size for that track. */
  Splitter.prototype.setFolded = function (on) {
    var want = !!on;
    if (this.folded === want) return this;
    this.folded = want;
    if (this.fold) this.fold.setAttribute('aria-expanded', want ? 'false' : 'true');
    if (this.target) {
      if (want) {
        /* What to write down the strip. The region's own name first: a rail
           holds several panels and naming it after the first one is actively
           wrong — cfd's inputs column would have folded away under the word
           "Examples". A panel title is used only where the column IS that one
           panel, which is the only case where it says more than the region
           name does. */
        var panels = this.target.querySelectorAll('.dgu-panel');
        var t = panels.length === 1 ? panels[0].querySelector('.dgu-panel-t') : null;
        var lbl = pick(asLabel(this.def.label), this.app.lang)
          || this.app.t('region_' + (this.target.dataset.region || ''))
          || (t && (t.textContent || '').trim())
          || (this.target.dataset.region || '');
        this.target.setAttribute('data-dgu-foldlabel', String(lbl).slice(0, 48));
        this.target.setAttribute('data-dgu-folded', '');
      } else {
        this.target.removeAttribute('data-dgu-folded');
      }
      var pb = this.host && this.host.classList.contains('dgu-panebox') ? this.host : null;
      if (pb) { if (want) pb.setAttribute('data-dgu-folded', ''); else pb.removeAttribute('data-dgu-folded'); }
    }
    if (this.def.remember !== false) nsSet('layout', this.key + '.fold', want ? '1' : null, this.app);
    this.app.applyLayout(true);
    /* a folded column has nothing to scroll and nothing to pin */
    if (isFn(this.app.applyPanes)) this.app.applyPanes();
    call(this.def.onFold, [want, this], 'splitter.onFold');
    return this;
  };

  Splitter.prototype.remember = function () {
    if (this.def.remember === false || this.size == null) return this;
    nsSet('layout', this.key, String(Math.round(this.size)), this.app);
    return this;
  };

  Splitter.prototype.publish = function (value, b) {
    this.node.setAttribute('aria-valuenow', String(Math.round(value)));
    this.node.setAttribute('aria-valuemin', String(Math.round(b.lo)));
    this.node.setAttribute('aria-valuemax', String(Math.round(b.hi)));
    this.node.setAttribute('aria-valuetext',
      this.app.t(this.axis === 'x' ? 'width' : 'height') + ' ' + Math.round(value) + ' px');
  };

  /* the y axis needs no grid arithmetic: one element, one height */
  Splitter.prototype.applyY = function (enabled) {
    if (!this.target) return;
    this.node.hidden = !enabled;
    if (!enabled) { this.target.style.height = ''; return; }
    var b = this.bounds();
    if (this.size != null) {
      this.size = clamp(this.size, b.lo, b.hi);
      this.target.style.height = this.size + 'px';
    }
    this.publish(this.current(), b);
    call(this.def.onResize, [this.size, this], 'splitter.onResize');
  };

  Splitter.prototype.destroy = function () {
    if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node);
  };

  /* =========================================================== POPOVER/DIALOG */

  var openPop = null;
  function popover(anchor, build, opts) {
    closePopover();
    opts = opts || {};
    var pop = el('div', { class: 'dgu-pop', role: 'dialog', 'aria-modal': 'false' });
    build(pop);
    doc.body.appendChild(pop);
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 20, top: 60, right: 20, bottom: 60, width: 0, height: 0 };
    var pr = pop.getBoundingClientRect();
    var left = clamp(r.left, 12, Math.max(12, global.innerWidth - pr.width - 12));
    var top = r.bottom + 8;
    if (top + pr.height > global.innerHeight - 12) top = Math.max(12, r.top - pr.height - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    var offClick = on(doc, 'pointerdown', function (e) {
      if (!pop.contains(e.target) && e.target !== anchor) closePopover();
    }, true);
    var offKey = on(doc, 'keydown', function (e) { if (e.key === 'Escape') { closePopover(); if (anchor && anchor.focus) anchor.focus(); } });
    openPop = { node: pop, off: function () { offClick(); offKey(); } };
    var f = pop.querySelector('button,a,[tabindex]');
    if (f && opts.focus !== false) f.focus();
    return pop;
  }
  function closePopover() {
    if (!openPop) return;
    openPop.off();
    if (openPop.node.parentNode) openPop.node.parentNode.removeChild(openPop.node);
    openPop = null;
  }

  var scrollLocks = 0;
  var savedOverflow = null;
  function lockScroll() {
    scrollLocks += 1;
    if (scrollLocks === 1) {
      savedOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';
    }
  }
  function unlockScroll() {
    scrollLocks = Math.max(0, scrollLocks - 1);
    /* site-disclaimer.js writes body.style.overflow unconditionally; only
       restore what we saved, and only when the last lock is released. */
    if (scrollLocks === 0) doc.body.style.overflow = savedOverflow || '';
  }

  function dialog(app, def) {
    var dlg = el('dialog', { class: 'dgu-dialog' });
    var panel = el('div', { class: 'dgu-dialog-p' });
    var head = el('div', { class: 'dgu-dialog-h' });
    head.appendChild(el('h2', { class: 'dgu-dialog-t', text: pick(asLabel(def.title), app.lang) }));
    var x = el('button', { class: 'dgu-btn ghost icon', type: 'button', 'aria-label': app.t('close'), text: '✕' });
    head.appendChild(x);
    panel.appendChild(head);
    var body = el('div', {});
    if (typeof def.body === 'string') body.appendChild(el('p', { text: def.body }));
    else if (def.body && def.body.nodeType) body.appendChild(def.body);
    else if (isFn(def.body)) call(def.body, [body], 'dialog.body');
    panel.appendChild(body);
    if (def.actions && def.actions.length) {
      var row = el('div', { class: 'dgu-dialog-a' });
      def.actions.forEach(function (a) { row.appendChild(app.actionButton(a, function () { close(); })); });
      panel.appendChild(row);
    }
    dlg.appendChild(panel);
    doc.body.appendChild(dlg);
    var prevFocus = doc.activeElement;
    function close() {
      try { dlg.close(); } catch (e) {}
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      unlockScroll();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      call(def.onClose, [], 'dialog.onClose');
    }
    on(x, 'click', close);
    on(dlg, 'cancel', function (e) { e.preventDefault(); close(); });
    lockScroll();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var f = panel.querySelector('button,a,input,select,textarea');
    if (f) f.focus();
    return { node: dlg, close: close };
  }

  /* ================================================================ HISTORY */

  function History(opts) {
    this.opts = opts || {};
    this.limit = this.opts.limit || 60;
    this.past = [];
    this.future = [];
    this.depth = 0;
  }
  History.prototype.capture = function () { return call(this.opts.capture, [], 'history.capture'); };
  History.prototype.push = function () {
    if (this.depth > 0) return;
    var snap = this.capture();
    if (snap === undefined) return;
    this.past.push(snap);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    call(this.opts.onChange, [this], 'history.onChange');
  };
  History.prototype.transaction = function (fn) {
    this.push();
    this.depth += 1;
    try { return call(fn, [], 'history.transaction'); }
    finally { this.depth -= 1; }
  };
  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };
  History.prototype.undo = function () {
    if (!this.past.length) return false;
    this.future.push(this.capture());
    call(this.opts.restore, [this.past.pop()], 'history.restore');
    call(this.opts.onChange, [this], 'history.onChange');
    return true;
  };
  History.prototype.redo = function () {
    if (!this.future.length) return false;
    this.past.push(this.capture());
    call(this.opts.restore, [this.future.pop()], 'history.restore');
    call(this.opts.onChange, [this], 'history.onChange');
    return true;
  };
  History.prototype.clear = function () { this.past.length = 0; this.future.length = 0; };

  /* ============================================================== SHORTCUTS */

  function Shortcuts(app) {
    this.app = app;
    this.list = [];
    var self = this;
    this.off = on(doc, 'keydown', function (e) { self.handle(e); });
  }
  Shortcuts.prototype.add = function (def) { this.list.push(def); return this; };
  Shortcuts.prototype.handle = function (e) {
    var t = e.target;
    /* §21. Two flags, both added for the print shortcut and both general.
       `anywhere:true` — the binding also fires while a field has focus. The
       field guard exists so mod+z stays the browser's own undo inside a text
       box; Ctrl+P has no such meaning in a field and must not stop working
       just because the caret is in one.
       `when:fn` — the binding may DECLINE. It matters because declining has to
       happen BEFORE preventDefault: a tool with no record must keep the
       browser's own Ctrl+P, and a shortcut that swallowed the key and then
       found it had nothing to do would have taken it away. */
    var inField = !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    var combo = (e.ctrlKey || e.metaKey ? 'mod+' : '') + (e.shiftKey && e.key.length > 1 ? 'shift+' : '') + e.key.toLowerCase();
    for (var i = 0; i < this.list.length; i++) {
      var s = this.list[i];
      if (inField && e.key !== 'Escape' && !s.anywhere) continue;
      var keys = String(s.keys).toLowerCase().split(',');
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].trim() !== combo) continue;
        if (isFn(s.when)) {
          var ok = false;
          try { ok = !!s.when(e); } catch (err) { warn(err); ok = false; }
          if (!ok) continue;
        }
        e.preventDefault();
        call(s.run, [e], 'shortcut ' + s.keys);
        return;
      }
    }
  };
  Shortcuts.prototype.sheet = function () {
    var app = this.app;
    var rows = this.list.filter(function (s) { return s.label; }).map(function (s) {
      return el('div', { style: { display: 'flex', gap: '10px', 'align-items': 'baseline', padding: '3px 0' } }, [
        el('span', { class: 'dgu-kbd', text: s.keys }),
        el('span', { text: pick(asLabel(s.label), app.lang) })
      ]);
    });
    return dialog(app, {
      title: app.t('shortcuts'),
      body: function (box) { rows.forEach(function (r) { box.appendChild(r); }); },
      actions: [{ label: app.t('close'), variant: 'ghost' }]
    });
  };
  Shortcuts.prototype.destroy = function () { if (this.off) this.off(); };

  /* ================================================================== PRINT
   * §21  ONE PATH TO PAPER.
   *
   * The owner's question was "does the framework give every PDF a common
   * header and footer?"  Measured before this section existed, the answer was
   * no, and there were three paths, none of them owned here:
   *
   *   1. `Diagram.report()` in diagram-common.js — a SEPARATE A4 document with
   *      a real running header and footer, paginated by its own script and
   *      printed from a hidden iframe. It is good, it is the artifact the
   *      manifest's `report.pdf` claim refers to, and NOTHING in this section
   *      reimplements or alters it.
   *   2. Ctrl+P on any framework page — which printed the live screen, header,
   *      nav, docks, tour affordances and all, on whatever paper the browser
   *      felt like, with no attribution and no source URL. diagram-ui.js had
   *      no print CSS at all and never mentioned Diagram.report.
   *   3. thirteen tools carrying their own `@page`/`@media print`, five of
   *      them calling `window.print()` behind the framework's back.
   *
   * The definition this section is built to: EVERY route by which a tool's
   * content reaches paper goes through `Diagram.report()`, and the one route
   * that cannot be intercepted — File → Print from the browser menu — gets an
   * honest framework-owned fallback instead of the screen.
   *
   *   Ctrl/Cmd+P      intercepted, prints the report. Byte-identical to the
   *                   report button, because it is the same call the shared
   *                   bar makes: report({record:rec}).
   *   File → Print    cannot be intercepted by any page. PRINT_CSS below is
   *                   what that produces: A4, framework chrome gone, a running
   *                   header and footer carrying the tool title, the source
   *                   URL and Diagram.report.attribution().
   *   app.printAction()  the declared affordance, so no tool ever writes
   *                   window.print() again.
   *
   * WHERE A TOOL HAS NO RECORD the shortcut is NOT hijacked: `when` returns
   * false, no preventDefault is called, and the browser's own print dialog
   * opens onto the fallback sheet. A tool with nothing to report must not have
   * its keyboard taken away.
   *
   * THE RUNNING HEADER AND FOOTER, and what they can and cannot carry.
   * Measured in this tree, Chromium 141.0.7390.37, by printing a probe to PDF
   * and reading the text back out page by page with pdftotext:
   *
   *   - a `position:fixed` block repeats on EVERY printed page, provided it is
   *     positioned INSIDE the page content box (top:0 / bottom:0) and the body
   *     reserves the space with padding. With a negative offset that pushes it
   *     into the @page margin it is dropped from the first or the last sheet —
   *     measured: header on 5 of 6 pages, footer on 5 of 6. So the offsets are
   *     zero and the space is reserved by padding.
   *   - `counter(page)` / `counter(pages)` do NOT resolve inside such a block.
   *     They DO resolve in an `@page` margin box, which this Chromium supports:
   *     `@page{@bottom-right{content:… counter(page) … counter(pages)}}`
   *     printed "page 3 of 6" on page 3 and "page 6 of 6" on page 6.
   *     LIMITATION, and it is a real one: `@page` margin boxes are a recent
   *     Chromium feature and are not supported by Firefox or Safari. There the
   *     page number silently disappears; everything else in the footer stays.
   *     The framework therefore never RELIES on the number — the sheet is
   *     still attributed and still carries its source URL without it — and the
   *     footer carries a translated line pointing the reader at the report
   *     button, which is the path that paginates in every browser because it
   *     numbers its own pages in script.
   */

  var PRINT_CSS = [
    /* The running header and footer do not exist on screen. This rule is
       written FIRST, before the @media print block, and that order is load
       bearing: a media query adds no specificity, so an unqualified
       `display:none` written AFTER the print block wins inside print too and
       the sheet comes out with no header and no footer. Measured exactly that
       way once — decayheat printed 6 pages with the page number present and
       the source URL on none of them. */
    '#dgu-print-head,#dgu-print-foot{display:none}',

    /* the fallback sheet's own page box. The bottom margin is deeper than the
       top because that is where the page-number margin box is drawn. */
    '@media print{',
    '@page{size:A4;margin:12mm 12mm 16mm}',

    /* Paper is white and ink is black, whatever the reader's theme was.
       decayheat.html discovered the hard half of this and wrote it down: the
       framework declares its tokens on `:root`, so a tool writing a bare
       `html{--bg:#fff}` in its own print block LOSES however late it appears.
       The framework owns `:root`, so the framework can just say `:root`. That
       one fact is why this rule belongs here and not in a tool. */
    ':root{--bg:#fff;--panel:#fff;--panel-2:#fff;--weak:#f2f4f7;',
    '--ink:#000;--muted:#3b434d;--line:#b9c0c8;--shadow:none;',
    '--grid:#e6e9ed;--grid-strong:#8d959e}',
    'html,body{background:#fff!important}',
    'body{-webkit-print-color-adjust:exact;print-color-adjust:exact;',
    /* reserve the running header and footer their strips on every sheet */
    'padding-top:9mm!important;padding-bottom:11mm!important}',

    /* ---- the framework's own chrome does not reach paper ----
       Everything named here is furniture this file created: it is interactive,
       it is not content, and on a sheet of paper it is noise. A tool never has
       to write any of these selectors again. */
    '.dgu-head-r,.dgu-home,.dgu-r-strip,.dgu-rw-strip,.dgu-strip,',
    '.dgu-r-nav,.dgu-rw-nav,.dgu-actionbar,.dgu-chromedock,.dgu-panel-actions,',
    '.dgu-q,.dgu-spot,.dgu-tour,.dgu-pop,.dgu-dialog,.dgu-dialog-b,',
    '.dgu-split,.dgu-split-grip,.dgu-stage-tools,.dgu-table-hint,.dgu-toast,',
    '.dgu-toasts,.dgu-file,.dgu-list-a,.dgu-list-c,.dgu-scene-toolbar,',
    '.dgu-scene-palette,.dgu-scene-search,.dgu-transport,',
    '[data-dgu-panel="dgu-examples"]{display:none!important}',
    /* the shared bar and the site disclaimer badge. diagram-common.js already
       hides #dgc-bar in its own print block; #eng-disc-badge belongs to
       site-disclaimer.js, which has no print block at all, and five tools were
       each hiding it by hand. */
    '#dgc-bar,#dgc-menu,#dgc-notes,#eng-disc-badge,#eng-disc-badgebar,',
    '#eng-disc-modal{display:none!important}',

    /* ---- one column, in reading order, nothing sticky, nothing clipped ----
       The archetype grids are declared with grid-template-areas inside
       min-width media queries, and A4 at 96 dpi is ~794 px, so the 768 px
       template MATCHES on paper: without this the calculator prints its screen
       two-column layout onto a page half its width. Single column is also what
       both tools that wrote a print sheet by hand chose independently. */
    '.dgu-app,.dgu-app .dgu-main{display:block!important;min-height:0!important;',
    'max-width:none!important;padding:0!important;background:#fff!important}',
    '.dgu-app .dgu-rwrap,.dgu-app .dgu-panebox,.dgu-app .dgu-region{display:block!important;width:auto!important;',
    'max-height:none!important;overflow:visible!important;position:static!important;',
    'top:auto!important;padding-bottom:0!important}',
    '.dgu-app .dgu-head{position:static!important;padding:0 0 6px!important;',
    'border-bottom:1.5pt solid #000!important;margin-bottom:8px!important;background:none!important}',
    '.dgu-region+.dgu-region,.dgu-rwrap+.dgu-rwrap{margin-top:8px}',

    /* ---- things that must not be cut in half by a page break ---- */
    '.dgu-panel,.dgu-stage,.dgu-tile,.dgu-verdict,.dgu-notice,.dgu-meter,',
    '.dgu-entry,.dgu-list-row,.dgu-table-wrap,.dgu-table-box{break-inside:avoid;',
    'page-break-inside:avoid}',
    '.dgu-panel,.dgu-stage{box-shadow:none!important}',
    '.dgu-panel-t,.dgu-results h2,.dgu-results h3{break-after:avoid}',
    /* a folded input group still prints its parameters: the reader wants the
       numbers the answer was computed from, not the state of a disclosure.
       decayheat.html found this one; it is true of every collapsible panel. */
    '.dgu-panel[data-collapsed="true"] .dgu-fields[hidden],',
    '.dgu-panel[data-collapsed="true"] .dgu-panel-note[hidden]{display:block!important}',
    /* a control is a value on paper, not a widget */
    '.dgu-fctl,.dgu-sel,.dgu-num,.dgu-rangenum{border:0!important;background:none!important;',
    'padding:0!important;min-height:0!important;height:auto!important;',
    '-webkit-appearance:none;appearance:none}',
    '.dgu-app a{text-decoration:none;color:inherit}',

    /* ---- the running header and footer ----
       Outside .dgu-app on purpose: position:fixed must resolve against the
       initial containing block, and a tool stylesheet scoped to .dgu-app then
       cannot reach them. Hidden on screen, and aria-hidden, so nothing that
       reads or measures the live page ever sees them. */
    '#dgu-print-head,#dgu-print-foot{display:block;position:fixed;left:0;right:0;',
    'background:#fff;color:#2b333c;font:7.8px/1.35 -apple-system,BlinkMacSystemFont,',
    '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;z-index:2147483000}',
    '#dgu-print-head{top:0;padding-bottom:1.4mm;border-bottom:.4pt solid #b9c0c8;',
    'font-size:9px;display:flex;justify-content:space-between;gap:6mm}',
    '#dgu-print-foot{bottom:0;padding-top:1.2mm;border-top:.4pt solid #b9c0c8;',
    'word-break:break-all}',
    '#dgu-print-foot .dgu-pf-note{color:#4a5460;word-break:normal}',
    '}'
  ];

  /* The page-number margin box is written from script, not from PRINT_CSS,
     because the phrase is localised: "page %n of %m" has to become
     content: "page " counter(page) " of " counter(pages) in seven site languages.
     Kept byte-for-byte in step with diagram-common.js's `rPage`. */
  function printPageRule(lang) {
    var tpl = pick(UI_STRINGS.page_n_of_m, lang) || 'page %n of %m';
    var parts = String(tpl).split(/%n|%m/);
    var order = String(tpl).match(/%n|%m/g) || [];
    var content = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) content.push(JSON.stringify(parts[i]));
      if (order[i]) content.push(order[i] === '%n' ? 'counter(page)' : 'counter(pages)');
    }
    if (!content.length) return '';
    return '@media print{@page{@bottom-right{content:' + content.join(' ')
      + ';font:7.6px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
      + 'color:#3b434d}}}';
  }

  /* Build the record once. Returns null when the tool has none, which is the
     signal every caller in this section uses to fall through to the browser
     rather than pretend there is a report. */
  function printRecord() {
    var D = global.Diagram;
    if (!D || !isFn(D.report) || !D.record || !isFn(D.record.build)) return null;
    try { return D.record.build() || null; } catch (e) { warn(e); return null; }
  }

  /* THE one path. Every framework route to paper ends here.
     `Diagram.report({record:rec})` is exactly the call the shared bar's own
     Report entry makes (diagram-common.js:1083), so the artifact is the same
     artifact — this function adds nothing to it and takes nothing away. */
  function printNow(opts) {
    var rec = printRecord();
    if (!rec) return false;
    var o = { record: rec };
    if (opts) for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    try { global.Diagram.report(o); return true; } catch (e) { warn(e); return false; }
  }

  /* The fallback sheet's furniture. Created once per document, filled fresh on
     every print so the timestamp is the timestamp of THIS sheet. */
  var printBoxes = null;
  function printFurniture(ctx) {
    if (!doc || !doc.body) return null;
    if (!printBoxes || !printBoxes.head.isConnected) {
      var h = el('div', { id: 'dgu-print-head', 'aria-hidden': 'true' }, [
        el('span', { class: 'dgu-ph-t' }), el('span', { class: 'dgu-ph-s' })
      ]);
      var f = el('div', { id: 'dgu-print-foot', 'aria-hidden': 'true' }, [
        el('div', { class: 'dgu-pf-a' }), el('div', { class: 'dgu-pf-note' })
      ]);
      doc.body.appendChild(h);
      doc.body.appendChild(f);
      printBoxes = { head: h, foot: f };
    }
    printFill(ctx);
    return printBoxes;
  }
  function printFill(ctx) {
    if (!printBoxes) return;
    var app = ctx || App.current;
    var lang = (app && app.lang) || currentLang();
    var D = global.Diagram;
    var title = '';
    if (app && app.opts) title = pick(asLabel(app.opts.title), lang) || '';
    if (!title && doc) { var h1 = doc.querySelector('h1'); if (h1) title = h1.textContent || ''; }
    if (!title && D && isFn(D.manifest)) {
      try { var m = D.manifest(); if (m && m.title) title = pick(m.title, lang) || ''; } catch (e) {}
    }
    printBoxes.head.firstChild.textContent = title + (title ? ' · ' : '') + siteName(lang);
    printBoxes.head.lastChild.textContent = pick(UI_STRINGS.print_screen, lang);

    /* the same attribution string the report's own footer carries, minus the
       page numbers it cannot know: source URL, timestamp, status, independent
       validation, and the benchmark report URL when the tool has an artifact */
    var attr = '';
    if (D && D.report && isFn(D.report.attribution)) {
      try { attr = D.report.attribution({ lang: lang }); } catch (e) { attr = ''; }
    }
    if (!attr) {
      /* No diagram-common.js on this page, so there is no tool identity, no
         status and no benchmark artifact to name. The honest minimum for a site
         shell page is where the sheet came from and when it was taken, in the
         reader's language and punctuated the way diagram-common.js punctuates
         the same phrase (French puts a space before its colon). */
      attr = pick(UI_STRINGS.print_source, lang) + (lang === 'fr' ? ' : ' : ': ')
        + siteSourceRef(lang)
        + ' · ' + new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    }
    printBoxes.foot.firstChild.textContent = attr;
    /* Only point at the report when there IS one. A tool with no record must
       not be told to press a button that will tell it there is no record. */
    printBoxes.foot.lastChild.textContent = printRecord() ? pick(UI_STRINGS.print_use_report, lang) : '';
  }

  /* Install the fallback: the stylesheet, the localised page-number rule and
     the two running boxes, plus the beforeprint refresh that File → Print
     reaches even though nothing can intercept the menu item itself. */
  var printInstalled = false;
  function installPrint(ctx) {
    if (!doc) return;
    if (!printInstalled) {
      printInstalled = true;
      ensureStyle('dgu-print', PRINT_CSS.join(''));
      on(global, 'beforeprint', function () { printFurniture(App.current || ctx); });
    }
    var lang = (ctx && ctx.lang) || currentLang();
    var pr = doc.getElementById('dgu-print-page');
    var css = printPageRule(lang);
    if (!pr) {
      pr = doc.createElement('style');
      pr.id = 'dgu-print-page';
      (doc.head || doc.documentElement).appendChild(pr);
    }
    if (pr.textContent !== css) pr.textContent = css;
    printFurniture(ctx);
  }

  /* ================================================================== LEARN
   * UI_AUDIT.md S-10: onboarding exists in about ten of fifty-one tools, in five
   * different shapes, one of which blocks the interface it describes and cannot
   * be advanced because the shared badge covers its Next button. Learn mode is
   * therefore framework furniture: one definition, three surfaces, docked clear
   * of the safe area.
   */

  function Learn(app, def) {
    this.app = app;
    this.def = def || {};
    this.topics = this.def.topics || {};
    this.on = false;
    this.tourIndex = -1;
    this.tourNode = null;
    this.spot = null;
  }

  Learn.prototype.topic = function (key) {
    var t = this.topics[key];
    if (!t) return null;
    var app = this.app;
    return {
      title: pick(asLabel(t.title), app.lang),
      body: pick(asLabel(t.body), app.lang),
      more: t.more || null,
      media: t.media || null
    };
  };

  Learn.prototype.show = function (key, anchor) {
    var t = this.topic(key), app = this.app;
    if (!t) return null;
    return popover(anchor, function (pop) {
      pop.appendChild(el('h3', { text: t.title }));
      if (t.media && t.media.svg) pop.appendChild(el('div', { html: t.media.svg }));
      String(t.body).split('\n\n').forEach(function (p) { pop.appendChild(el('p', { text: p })); });
      if (t.more && t.more.href) {
        pop.appendChild(el('p', {}, [el('a', {
          href: t.more.href, target: '_blank', rel: 'noopener',
          text: pick(asLabel(t.more.label), app.lang) || t.more.href
        })]));
      }
    });
  };

  Learn.prototype.toggle = function (force) {
    this.on = force == null ? !this.on : !!force;
    this.app.node.setAttribute('data-learn', this.on ? 'on' : 'off');
    if (this.app.learnBtn) this.app.learnBtn.classList.toggle('on', this.on);
    if (this.on) this.app.notify(this.app.t('learn_on'), { kind: 'ok' });
    return this.on;
  };

  Learn.prototype.hasTour = function () { return !!(this.def.tour && this.def.tour.length); };

  Learn.prototype.startTour = function (from) {
    if (!this.hasTour()) return;
    this.tourIndex = from == null ? 0 : from;
    this.renderTour();
  };

  Learn.prototype.endTour = function (completed) {
    this.tourIndex = -1;
    if (this.tourNode && this.tourNode.parentNode) this.tourNode.parentNode.removeChild(this.tourNode);
    if (this.spot && this.spot.parentNode) this.spot.parentNode.removeChild(this.spot);
    this.tourNode = null; this.spot = null;
    if (this.offKey) { this.offKey(); this.offKey = null; }
    if (completed) store('diagram_learn_' + this.app.id, String(this.def.version || 1));
  };

  Learn.prototype.renderTour = function () {
    var self = this, app = this.app;
    var steps = this.def.tour, i = this.tourIndex;
    if (i < 0 || i >= steps.length) { this.endTour(true); return; }
    var step = steps[i];
    var t = this.topic(step.topic) || { title: '', body: '' };
    call(step.action, [app], 'tour.action');

    if (!this.tourNode) {
      this.tourNode = el('div', { class: 'dgu-tour', role: 'dialog', 'aria-modal': 'false', 'aria-live': 'polite' });
      doc.body.appendChild(this.tourNode);
      /* v3.6.1 — the tour's arrows are document-level, and they used to fire
         whatever had focus. That was survivable while the tree had three drag
         handles on it; from v3.6.1 every multi-column page has one, the tour
         auto-starts on a first visit, and `role="separator"` is operated with
         exactly these two keys — so the first thing a keyboard reader could try
         on the new control silently stepped the tour instead. A control that
         owns the arrow keys keeps them; Escape is not negotiable and still ends
         the tour from anywhere. */
      var OWNS_ARROWS = 'input,select,textarea,[contenteditable],[role="separator"],'
        + '[role="slider"],[role="spinbutton"],[role="tab"],[role="tablist"],'
        + '[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],'
        + '[role="radio"],[role="radiogroup"],[role="tree"],[role="grid"]';
      this.offKey = on(doc, 'keydown', function (e) {
        if (e.key === 'Escape') { self.endTour(false); return; }
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var t = e.target;
        if (t && t.closest && t.closest(OWNS_ARROWS)) return;
        if (e.key === 'ArrowRight') { self.tourIndex += 1; self.renderTour(); }
        else if (self.tourIndex > 0) { self.tourIndex -= 1; self.renderTour(); }
      });
    }
    var node = this.tourNode;
    clear(node);
    node.appendChild(el('div', { class: 'dgu-tour-n', text: app.t('step') + ' ' + (i + 1) + ' ' + app.t('of') + ' ' + steps.length }));
    node.appendChild(el('h3', { text: t.title }));
    String(t.body).split('\n\n').forEach(function (p) { node.appendChild(el('p', { text: p, style: { margin: '0' } })); });
    if (step.note) node.appendChild(el('p', { class: 'dgu-hint', text: pick(asLabel(step.note), app.lang) }));

    var row = el('div', { class: 'dgu-tour-a' });
    var back = el('button', { class: 'dgu-btn ghost', type: 'button', text: app.t('back') });
    back.disabled = (i === 0);            /* audit: Back was enabled on step 1 */
    on(back, 'click', function () { self.tourIndex -= 1; self.renderTour(); });
    row.appendChild(back);
    row.appendChild(el('span', { class: 'spacer' }));
    var skip = el('button', { class: 'dgu-btn ghost', type: 'button', text: app.t('skip') });
    on(skip, 'click', function () { self.endTour(true); });
    row.appendChild(skip);
    var next = el('button', {
      class: 'dgu-btn primary', type: 'button',
      text: i === steps.length - 1 ? app.t('done') : app.t('next')
    });
    on(next, 'click', function () { self.tourIndex += 1; self.renderTour(); });
    row.appendChild(next);
    node.appendChild(row);

    this.place(step);
    next.focus();
  };

  Learn.prototype.place = function (step) {
    /* Dock clear of the shared chrome (safe area) and clear of the element the
       step points at, and highlight that element instead of covering it. */
    var self = this;
    var target = step.focus ? resolveHost(step.focus) : null;
    if (target) {
      /* instant, so the rectangles below are the ones the user will see */
      try { target.scrollIntoView({ block: 'center', behavior: 'auto' }); }
      catch (e) { target.scrollIntoView(); }
    }
    var apply = function () {
      var node = self.tourNode;
      if (!node) return;
      var pad = 12;
      var safeBottom = safeState.bottom + pad;
      var nb = node.getBoundingClientRect();
      var narrow = global.innerWidth < 768;
      var left = narrow ? pad : global.innerWidth - nb.width - pad;
      var top = global.innerHeight - nb.height - safeBottom;

      if (target) {
        var r = target.getBoundingClientRect();
        if (!self.spot) { self.spot = el('div', { class: 'dgu-spot' }); doc.body.appendChild(self.spot); }
        if (!narrow) {
          /* put the card on the side of the viewport the target is not on */
          if (r.left > global.innerWidth / 2) left = pad;
          if (r.top > global.innerHeight / 2) top = pad;
          else top = Math.min(global.innerHeight - nb.height - safeBottom, r.bottom + pad);
        }
        /* if the card would still sit on the target, move the page, not the card */
        var cardTop = top, cardBottom = top + nb.height;
        if (r.bottom > cardTop && r.top < cardBottom && r.left < left + nb.width && r.right > left) {
          var shift = r.bottom - cardTop + pad;
          global.scrollBy(0, shift);
          r = target.getBoundingClientRect();
        }
        self.spot.style.left = (r.left - 4) + 'px';
        self.spot.style.top = (r.top - 4) + 'px';
        self.spot.style.width = (r.width + 8) + 'px';
        self.spot.style.height = (r.height + 8) + 'px';
      } else if (self.spot) {
        self.spot.style.width = '0px'; self.spot.style.height = '0px';
      }
      node.style.left = Math.max(pad, left) + 'px';
      node.style.top = Math.max(pad, top) + 'px';
    };
    apply();
    global.requestAnimationFrame(apply);
  };

  Learn.prototype.maybeAutoStart = function () {
    if (!this.hasTour()) return;
    var seen = store('diagram_learn_' + this.app.id);
    if (seen === String(this.def.version || 1)) return;
    /* never on a permalink or handoff arrival: the user came for the state */
    try {
      var q = new global.URLSearchParams(global.location.search);
      if (q.get('s') || q.get('in')) return;
    } catch (e) {}
    if (this.def.autostart === false) return;
    var self = this;
    setTimeout(function () { self.startTour(0); }, 700);
  };

  /* ==================================================================== APP */

  function App(opts) {
    this.opts = opts || {};
    this.manifest = readManifest();
    this.siteLang = siteLang();
    this.lang = domainLang(this.manifest, this.opts.lang || this.siteLang);
    this.id = this.opts.id || (this.manifest && this.manifest.id) || 'tool';
    this.state = this.opts.state || {};
    this.state_ = 'pending';
    this.panels = [];
    this.notices = [];
    this.splitters = [];
    this.regions = {};
    this.regionWraps = {};
    this.paneBoxes = {};
    /* CLOSE-THE-LOOP 5: components declared with a `key:` land here and are
       re-registered by the journal replay, so this map is always the live one. */
    this.byKey = {};
    this.unbinds = [];
    /* TIER2 T4: the furniture journal, filled by journalAdd() from build() and
       from every imperative constructor. See App.rebuild. */
    this.journal = [];
    this.building = false;
    this.failReason = null;
    this.errorText = null;
    this.learn = new Learn(this, this.opts.learn);
    this.shortcuts = new Shortcuts(this);
    this.history = this.opts.history === false ? null : new History({
      capture: this.opts.history && this.opts.history.capture,
      restore: this.opts.history && this.opts.history.restore,
      onChange: guard(function () { this.syncHeader(); }.bind(this), 'history.onChange')
    });
    this.build();
  }

  function readManifest() {
    try {
      if (global.Diagram && isFn(global.Diagram.manifest)) {
        var m = global.Diagram.manifest();
        return m || null;
      }
      var n = doc.getElementById('diagram-tool-manifest');
      return n ? JSON.parse(n.textContent) : null;
    } catch (e) { return null; }
  }

  App.prototype.t = function (key) {
    var d = this.opts.strings || {};
    if (d[key] != null) return pick(d[key], this.lang);
    /* Framework chrome follows the site language; tool-owned strings follow domainLang. */
    if (UI_STRINGS[key] != null) return pick(UI_STRINGS[key], this.siteLang || this.lang);
    return key;
  };

  App.prototype.fieldCtx = function () {
    return { state: this.state, app: this, lang: this.lang, t: this.t.bind(this) };
  };

  /* ---- chrome helpers ---- */

  App.prototype.actionButton = function (a, after) {
    var app = this;
    var b = el('button', {
      class: 'dgu-btn' + (a.variant ? ' ' + a.variant : '') + (a.icon && !a.label ? ' icon' : ''),
      type: 'button',
      title: a.title ? pick(asLabel(a.title), this.lang) : null,
      'aria-label': (!a.label && (a.title || a.ariaLabel)) ? pick(asLabel(a.ariaLabel || a.title), this.lang) : null
    });
    /* §22.9 — a primary action is marked as such, so a pane can pin it. Note
       what does NOT count: `variant:'primary'`. That is a LOOK — the filled
       accent button — and tools use it for things that are not the action the
       page exists for: weldsymbols dresses its "Arrow side and other side"
       mode toggle that way, and the first cut of this rule duly pinned a
       segmented choice to the bottom of the column and reported the tool as
       defective for it. Only an explicit `primary: true` says "this is the
       one". */
    if (a.primary === true) b.setAttribute('data-dgu-primary', '');
    if (a.icon) b.appendChild(el('span', { text: a.icon, 'aria-hidden': 'true' }));
    var labelNode = null;
    if (a.label) {
      labelNode = el('span', { text: pick(asLabel(a.label), this.lang) });
      b.appendChild(labelNode);
    }
    if (!a.label && !a.icon) b.textContent = '…';
    on(b, 'click', function (e) {
      call(a.run, [e, app], 'action ' + (a.id || a.label || ''));
      if (after) after();
    });
    /* CLOSE-THE-LOOP 6. `disabled` may be a predicate, re-read on every sync —
       the same contract fields already have. damperselect.html: "`actionButton`
       reads `a.disabled` once at build and a function would be truthy, so a
       predicate is impossible. I used the panel's `sync` hook and wrote
       `backAction._node.disabled` — `_node` is a private handle actionButton
       leaves on the descriptor. Nothing in the guide mentions it."  A wizard
       needs Back disabled on step 1 and Continue disabled on the last, and a
       Back button that silently does nothing is a broken control. */
    var dynamicAction = isFn(a.disabled) || isFn(a.label) || isFn(a.title) || isFn(a.ariaLabel);
    if (dynamicAction) {
      this.actionSync = this.actionSync || [];
      this.actionSync.push({ a: a, b: b, labelNode: labelNode });
      if (isFn(a.disabled)) b.disabled = !!call(a.disabled, [app.fieldCtx()], 'action.disabled');
      /* A tool commonly assigns `ui = DiagramUI.app(...)`; during the App
         constructor that external variable is necessarily still null.  Re-read
         function labels on the next task, after app() has returned, so a
         framework-owned label such as Reset is localised on first paint too. */
      if (isFn(a.label) || isFn(a.title) || isFn(a.ariaLabel)) {
        setTimeout(function () { if (b && b.isConnected !== false) app.syncActions(); }, 0);
      }
    } else if (a.disabled) b.disabled = true;
    if (a.id) b.dataset.action = a.id;
    a._node = b;
    return b;
  };

  /* Re-read every predicate `disabled` and drop buttons that have left the DOM. */
  App.prototype.syncActions = function () {
    var app = this, list = this.actionSync;
    if (!list || !list.length) return this;
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.b || e.b.isConnected === false) continue;
      keep.push(e);
      try {
        if (isFn(e.a.disabled)) e.b.disabled = !!call(e.a.disabled, [app.fieldCtx()], 'action.disabled');
        if (e.labelNode && isFn(e.a.label)) e.labelNode.textContent = pick(asLabel(e.a.label), app.lang);
        if (isFn(e.a.title)) e.b.title = pick(asLabel(e.a.title), app.lang);
        if (!e.a.label && isFn(e.a.ariaLabel || e.a.title)) {
          e.b.setAttribute('aria-label', pick(asLabel(e.a.ariaLabel || e.a.title), app.lang));
        }
      } catch (err) { warn(err); }
    }
    this.actionSync = keep;
    return this;
  };

  App.prototype.learnButton = function (topicKey) {
    var app = this;
    /* the accessible name carries the topic title in the current language; the
       internal key is only a fallback for a topic the tool did not declare */
    var tp = null;
    try { tp = app.learn && isFn(app.learn.topic) ? app.learn.topic(topicKey) : null; } catch (e) { tp = null; }
    var name = tp && tp.title ? String(tp.title) : String(topicKey);
    var b = el('button', {
      class: 'dgu-q', type: 'button', text: '?',
      'aria-label': app.t('learn') + ': ' + name
    });
    on(b, 'click', function (e) { e.stopPropagation(); app.learn.show(topicKey, b); });
    return b;
  };

  /* ---- build ---- */

  App.prototype.build = function () {
    var app = this, o = this.opts;
    /* everything created between here and the end of build() is declared in
       opts, so rebuild() gets it back for free and must not replay it */
    this.building = true;
    try { this.buildInner(); } finally { this.building = false; }
    return this;
  };

  App.prototype.buildInner = function () {
    var app = this, o = this.opts;
    ensureStyle('dgu-tokens', TOKENS);
    ensureStyle('dgu-chrome-compat', CHROME_COMPAT);
    ensureStyle('dgu-shell',
      SHELL_CSS + SHELL_CSS2 + REPAIR_CSS + LAYOUT_CSS.join('') + CONTENT_CSS.join('')
      + TIER2_CSS.join('') + SCENE_CSS.join(''));
    /* §21. A separate sheet, installed after the shell, so a tool that still
       has a genuinely tool-specific print rule of its own can be read next to
       it without unpicking a 300 kB string. */
    installPrint(this);
    applyTheme();

    /* CLOSE-THE-LOOP 3. The document language is set on ARRIVAL, not only when
       the switcher is used. flangejoint.html asked "Whether `<html lang>` is set
       on arrival at ?lang=de" and found: "It is not set: the runtime assigns the
       document language only when the switcher is used, so a German page sat
       inside <html lang=\"en\">."  Measured across the tree before this fix:
       ui-demo.html and NEW_TOOL_TEMPLATE.html at ?lang=de both reported
       lang="en" with app.lang "de", and three of the four new tools inherited
       it. setLang() already does this; boot did not. */
    if (global.Diagram && isFn(global.Diagram.setDocumentLang)) global.Diagram.setDocumentLang(this.lang);
    else if (doc.documentElement.lang !== this.lang) { try { doc.documentElement.lang = this.lang; } catch (e) {} }

    var mount = resolveHost(o.mount) || doc.body;
    this.mount = mount;
    this.node = el('div', {
      class: 'dgu-app',
      dataset: {
        layout: o.layout || 'calculator',
        state: 'pending',
        compute: o.compute || 'live',
        learn: 'off'
      }
    });
    if (o.density) doc.documentElement.setAttribute('data-density', o.density);
    mount.appendChild(this.node);
    safeState.target = mount === doc.body ? doc.body : mount;
    measureChrome();

    this.buildHeader();

    this.main = el('div', { class: 'dgu-main' });
    this.node.appendChild(this.main);
    /* v3.2 P9 — every region is placed through a wrapper. The wrapper is the
       grid item and carries `grid-area`; the region itself is an ordinary block
       inside it. Two framework defects fall out of that one change, see §17.9:
       Chromium constrains a sticky *grid item* to the grid CONTAINER rather
       than to its grid area, so a sticky region slid down over the dock, the
       results and the footer of the rows below it; and a splitter handle, being
       absolutely placed in the grid gutter, was clipped away by the region's
       own `overflow-y:auto` the moment the region became a scrolling pane.
       A static, row-stretched wrapper gives the sticky box a containing block
       that IS its row, and gives the handle a home outside the scroll box. */
    ['strip', 'nav', 'inputs', 'stage', 'results', 'detail', 'dock', 'footer'].forEach(function (r) {
      var n = el('div', { class: 'dgu-region dgu-r-' + r, dataset: { region: r } });
      if (r === 'strip') n.className = 'dgu-region dgu-r-strip';
      n.hidden = true;
      var w = el('div', { class: 'dgu-rwrap dgu-rw-' + r, dataset: { regionWrap: r } });
      w.hidden = true;
      /* v3.6.2 — a THIRD box, between the wrapper and the region. v3.6.1 tried
         to do without it by making the wrapper itself sticky, and re-created
         the exact defect the paragraph above was written about: Chromium
         constrains a sticky GRID ITEM to the grid container, not to its grid
         area, so cfd's rails slid down over the dock, the results and the
         footer while the stage scrolled visibly behind them. The wrapper must
         stay a static grid item. But the handle cannot live in the region
         either (a pane's `overflow-y:auto` forces overflow-x and clips it), and
         if it lives in the stretched wrapper it inherits the whole area's
         height — on normenwijzer that was 11 x 140 611 px. The pane box is what
         satisfies both: it sticks, so it is bounded by the wrapper and cannot
         leave its row; it is a block, so it is exactly as tall as the region;
         and it does not scroll, so a handle placed in it is neither clipped nor
         oversized. One box, three constraints, no compromise between them. */
      var pb = el('div', { class: 'dgu-panebox dgu-pb-' + r, dataset: { paneBox: r } });
      pb.appendChild(n);
      w.appendChild(pb);
      app.regions[r] = n;
      app.regionWraps[r] = w;
      app.paneBoxes[r] = pb;
      app.main.appendChild(w);
    });
    /* Tools write `app.regions.x.hidden = …` directly (cfd, luchtgroepselector,
       kernnormenwijzer all do), so the wrapper follows the region's hidden
       state by observation rather than by trusting every call site. A wrapper
       left visible over an area name the archetype does not define would create
       an implicit track — measured: a phantom 12 px column and an extra row. */
    if (global.MutationObserver) {
      var mirror = new global.MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          var reg = recs[i].target, name = reg.dataset && reg.dataset.region;
          var w = name && app.regionWraps[name];
          if (w) w.hidden = reg.hidden;
        }
      });
      Object.keys(this.regions).forEach(function (r) {
        mirror.observe(app.regions[r], { attributes: true, attributeFilter: ['hidden'] });
      });
      this.regionMirror = mirror;
    }
    this.stripBox = el('div', { class: 'dgu-strip' });
    this.regions.strip.appendChild(this.stripBox);

    /* regions declared up front */
    var reg = o.regions || {};
    Object.keys(reg).forEach(function (name) {
      var host = app.regions[name];
      if (!host) return;
      var v = reg[name];
      if (v && v.nodeType) { host.appendChild(v); app.useRegion(name); }
      else if (isFn(v)) { call(v, [host, app], 'region.' + name); app.useRegion(name); }
    });

    /* notices before panels: a standing qualification reads above the thing it
       qualifies, whichever region it is placed in */
    (o.notices || []).forEach(function (n) { app.notice(n); });

    /* scroll:['inputs'] or scroll:{inputs:'md', results:'lg'} */
    if (o.scroll) {
      if (o.scroll.length != null && isFn(o.scroll.forEach)) o.scroll.forEach(function (r) { app.scrollRegion(r); });
      else Object.keys(o.scroll).forEach(function (r) { app.scrollRegion(r, { from: o.scroll[r] }); });
    }

    /* resize:['inputs'] or resize:[{region:'inputs',min:240,max:680}, …] */
    (o.resize || []).forEach(function (r) { app.resizable(typeof r === 'string' ? { region: r } : r); });

    /* ---- v3.6.1 §22.2 the archetype adopts its own panes and handles ------
       Both primitives shipped in v3.6 and both were opt-in, and the tree
       measures the result of that: **2 of 59 pages declare `scroll:` and 0
       declare `resize:`**. So the framework had an independently scrolling
       column that nobody scrolled and a drag handle that appeared on no page —
       which is exactly the report this release answers ("исчезли рукоятки
       окон … левая панель очень длинная и результаты вообще не видны").
       A primitive 0 tools adopt is not a feature, it is dead code with
       documentation.

       An archetype knows which of its tracks are side rails and which one is
       the stage, so it can declare this itself, and every part of it is already
       measured before it is shown: applyPanes() withdraws a pane whose column
       has nothing to scroll, and applyLayout() hides a handle whose track is
       the flexible one or does not exist at this width. Below the archetype's
       own breakpoint both go away entirely and the document scrolls as one, so
       nothing here reaches a phone.

       Opt out per tool with `panes:false` / `handles:false`; a tool that
       declared `scroll:`/`resize:` itself has already been honoured above and
       is not touched — its own bounds win. */
    /* A tool's own `scroll:` names SOME regions; it is not a statement about the
       others. The first cut treated any `scroll:` as a blanket opt-out, and the
       gate caught what that costs: normenwijzer declares `scroll:` for one
       region, so its `nav` got a default handle and no default pane, and the
       handle — which spans its whole grid row — came out **11 × 140 611 px**,
       with its three hit-test points 20 000 to 119 000 px below the fold. A
       control no pointer can reach is the exact defect class C-P exists for.
       Per-region merge, and never a handle on a region with no pane: the pane
       is what bounds the row the handle spans. */
    var pd = DEFAULT_PANES[o.layout] || null;
    if (pd && o.panes !== false) {
      /* declared for every region the archetype defines, not only for the ones
         that already have content: many tools fill their regions imperatively
         AFTER app() returns, and gating on `firstChild` here adopted 2 pages of
         59 while looking like it had adopted all of them. A region that never
         gets content ends up `hidden`, and both measure-time passes skip a
         hidden region — so the withdrawal happens where it can be measured. */
      Object.keys(pd).forEach(function (r) {
        if (!app.regions[r]) return;
        if (o.scroll) {                                           /* the tool named it */
          var named = (o.scroll.length != null && isFn(o.scroll.indexOf))
            ? o.scroll.indexOf(r) >= 0 : o.scroll[r] !== undefined;
          if (named) return;
        }
        app.scrollRegion(r, { from: pd[r] });
      });
    }
    var hd = DEFAULT_HANDLES[o.layout] || null;
    if (hd && o.handles !== false && !(o.resize && o.resize.length)) {
      hd.forEach(function (d) {
        var n = app.regions[d.region];
        /* no pane, no handle: the pane's max-height is what stops the handle
           spanning a row taller than any screen */
        if (n && n.getAttribute('data-dgu-scroll')) app.resizable(d);
      });
    }

    /* panels */
    (o.panels || []).forEach(function (p) { app.panel(p); });

    /* v3.4 §19 — the answer surface, for EVERY archetype including `reference`.
       Until this release `App.build` created no Results view for a lookup, and
       three things followed from that one line, all of them measured by
       `weldsymbols` (built from AUTHORING.md alone): `ui.results()` returned
       null, `on.compute`'s return value was silently discarded, and
       `learn.intro` — which only Results renders — never appeared at all.

       The view is now always built. What `reference` gets that the other
       archetypes do not is a CLOSED region: the four shipped reference tools
       (periodictable, hydraulicsolutions, kernnormenwijzer, normenwijzer) fill
       the `results` region with panels of their own, and none of them calls
       `app.results()`, so growing a second, empty "Selection" heading above
       their content would be a regression on all four. The region opens the
       first time the tool hands over an answer — or at build time if the tool
       asks for it with `results:true`, which is how a lookup puts its
       `learn.intro` on the first screen. */
    if (o.results !== false) {
      var rDef = (o.results && typeof o.results === 'object') ? o.results : {};
      var rSlot = rDef.slot || 'results';
      var rDefer = o.layout === 'reference' && o.results !== true && rDef.open !== true;
      /* an area the archetype's grid does not define would become an implicit
         track — a phantom column and an extra row, the same defect §17.9's
         wrapper rule was written for. Only the areas each template names. */
      var rAreas = LAYOUT_AREAS[o.layout || 'calculator'] || LAYOUT_AREAS.calculator;
      if (rAreas.indexOf(rSlot) < 0) rSlot = 'results';
      if (!rDefer) this.useRegion(rSlot);
      this.resultsView = new Results(this, this.regions[rSlot], rDef);
      this.resultsView.slot = rSlot;
      this.resultsView.deferred = rDefer;
      if (rDefer) this.resultsView.node.hidden = true;
      /* TIER2 T5: paint the pending state now, not on the first results() call.
         heat2d: "Results never renders its pending state until results() is
         called at least once, so the region shows only its heading — including
         the learn.intro that §9.2(4) says must be on the first screen of a run
         tool."  steam_tables: "a compute:'run' tool comes up with an empty
         results panel instead of the pending state and learn.intro that §7 and
         §9.2.4 require. … ready() should do this for run-mode tools upstream."
         nuclideatlas saw the empty region for the whole 17 s of its data load.
         Build time, not ready time, so the loading page is never blank.
         A deferred (reference) view has nothing to paint yet and no region to
         paint it into, so it waits for its first answer. */
      if (!rDefer) this.resultsView.render();
    }

    /* footer notes */
    if (o.footer) {
      this.useRegion('footer');
      this.regions.footer.classList.add('dgu-footer');
      if (isFn(o.footer)) call(o.footer, [this.regions.footer, this], 'footer');
      else this.regions.footer.appendChild(el('div', { text: pick(asLabel(o.footer), this.lang) }));
    }

    /* sticky action bar for run-mode tools below md */
    this.actionBar = el('div', { class: 'dgu-actionbar' });
    if ((o.compute || 'live') === 'run') {
      this.actionBar.appendChild(this.actionButton({
        label: this.t('run'), variant: 'primary', primary: true, run: function () { app.run(); }
      }));
      this.node.appendChild(this.actionBar);
    }

    /* flow dock for the shared chrome below md (see safe-area section) */
    this.chromeDock = el('div', { class: 'dgu-chromedock', hidden: true });
    this.node.appendChild(this.chromeDock);
    safeState.dock = this.chromeDock;
    measureChrome();

    /* shortcuts */
    (o.shortcuts || []).forEach(function (s) { app.shortcuts.add(s); });
    this.shortcuts
      .add({ keys: '?', label: this.t('shortcuts'), run: function () { app.shortcuts.sheet(); } })
      .add({ keys: 'l', label: this.t('learn'), run: function () { app.learn.toggle(); } })
      .add({ keys: 'mod+z', label: this.t('undo'), run: function () { app.undo(); } })
      .add({ keys: 'mod+y,mod+shift+z', label: this.t('redo'), run: function () { app.redo(); } })
      /* §21. Ctrl/Cmd+P prints the REPORT, so the keyboard shortcut and the
         Report button produce the same artifact. `when` declines — leaving the
         browser's own print dialog to open onto the framework fallback sheet —
         for a tool with no record, which is the only honest thing to do when
         there is nothing to report. */
      .add({
        keys: 'mod+p', label: this.t('print_report'), anywhere: true,
        when: function () { return !!printRecord(); },
        run: function () { app.print(); }
      });

    /* keep the header height published for sticky offsets */
    if (global.ResizeObserver) {
      var ro = new global.ResizeObserver(function () {
        doc.documentElement.style.setProperty('--dgu-head-h', app.head.getBoundingClientRect().height + 'px');
      });
      ro.observe(this.head);
      this.headRo = ro;
    }
    this.unbinds.push(theme.watch(function () { app.syncHeader(); }));
    this.setState('pending');
  };

  App.prototype.buildHeader = function () {
    var app = this, o = this.opts;
    var head = el('header', { class: 'dgu-head' });
    this.head = head;

    var left = el('div', { class: 'dgu-head-l' });
    left.appendChild(el('a', {
      class: 'dgu-home', href: 'index.html?lang=' + this.siteLang, text: '← ' + pick(UI_STRINGS.tools, this.siteLang)
    }));
    var title = pick(asLabel(o.title), this.lang)
      || (this.manifest && this.manifest.title ? pick(this.manifest.title, this.lang) : '')
      || this.id;
    /* UI_AUDIT.md S-16: exactly one h1 per page, and it is the tool's name. */
    left.appendChild(el('h1', { class: 'dgu-title', text: title }));
    if (o.subtitle) left.appendChild(el('span', { class: 'dgu-sub', text: pick(asLabel(o.subtitle), this.lang) }));
    head.appendChild(left);

    var right = el('div', { class: 'dgu-head-r' });
    this.headRight = right;

    /* undo / redo, only for tools that declared a history */
    if (this.history && this.opts.history && isFn(this.opts.history.capture)) {
      this.undoBtn = this.actionButton({ icon: '↶', title: this.t('undo'), run: function () { app.undo(); } });
      this.redoBtn = this.actionButton({ icon: '↷', title: this.t('redo'), run: function () { app.redo(); } });
      this.undoBtn.classList.add('ghost'); this.redoBtn.classList.add('ghost');
      right.appendChild(this.undoBtn); right.appendChild(this.redoBtn);
    }

    (o.header && o.header.actions || []).forEach(function (a) { right.appendChild(app.actionButton(a)); });

    /* §21. `header:{print:true}` — the declared print affordance, so no tool
       ever writes window.print() again. It is opt-in rather than automatic
       because the shared bar already carries a Report entry on every page that
       has a record: a tool that wants the same thing in its own header, or on
       a page whose users never look at the bar, asks for it here. */
    if (o.header && o.header.print) {
      var pb = this.printAction(o.header.print === true ? null : o.header.print);
      pb.classList.add('ghost');
      this.printBtn = pb;
      right.appendChild(pb);
    }

    /* units */
    if (o.units !== false && this.hasConvertibleUnits()) {
      var us = el('select', { class: 'dgu-sel', 'aria-label': this.t('units') });
      [['si', 'SI'], ['practical', 'SI +'], ['us', 'US']].forEach(function (p) {
        us.appendChild(el('option', { value: p[0], text: p[1] }));
      });
      us.value = unitSystem();
      on(us, 'change', function () { store('diagram_units', us.value); app.rebuild(); });
      right.appendChild(us);
    }

    /* learn */
    if (!(o.header && o.header.learn === false)) {
      var lb = this.actionButton({
        icon: '?', title: this.t('learn'),
        run: function () {
          if (app.learn.hasTour()) {
            popover(lb, function (pop) {
              pop.appendChild(el('h3', { text: app.t('learn') }));
              var b1 = el('button', { class: 'dgu-btn', type: 'button', text: app.t('tour') });
              on(b1, 'click', function () { closePopover(); app.learn.startTour(0); });
              var b2 = el('button', { class: 'dgu-btn', type: 'button', text: app.t('learn') });
              on(b2, 'click', function () { closePopover(); app.learn.toggle(); });
              pop.appendChild(el('div', { style: { display: 'flex', gap: '8px' } }, [b1, b2]));
            });
          } else app.learn.toggle();
        }
      });
      lb.classList.add('ghost');
      this.learnBtn = lb;
      right.appendChild(lb);
    }

    /* language */
    if (!(o.header && o.header.lang === false)) {
      var langs = SITE_LANGS;
      if (langs.length > 1) {
        var ls = el('select', { class: 'dgu-sel', 'aria-label': this.t('language') });
        langs.forEach(function (l) {
          /* native names, so the site stops arguing about UA versus UK */
          ls.appendChild(el('option', { value: l, text: LANG_NATIVE[l] || l }));
        });
        ls.value = this.siteLang;
        on(ls, 'change', function () { app.setLang(ls.value); });
        right.appendChild(ls);
      }
    }

    /* theme */
    if (!(o.header && o.header.theme === false)) {
      var tb = this.actionButton({
        icon: '◐', title: this.t('theme'),
        run: function () { theme.cycle(); app.syncHeader(); }
      });
      tb.classList.add('ghost');
      this.themeBtn = tb;
      right.appendChild(tb);
    }

    head.appendChild(right);
    this.node.appendChild(head);
    this.syncHeader();
  };

  App.prototype.hasConvertibleUnits = function () {
    var found = false;
    (this.opts.panels || []).forEach(function (p) {
      (p.fields || []).forEach(function (f) {
        if (f.unit && UNIT_TABLE[f.unit] && UNIT_TABLE[f.unit].length > 1 && !f.display) found = true;
      });
    });
    return found;
  };

  App.prototype.syncHeader = function () {
    if (this.themeBtn) {
      var p = theme.pref();
      this.themeBtn.title = this.t('theme_' + p);
      this.themeBtn.setAttribute('aria-label', this.t('theme_' + p));
    }
    if (this.undoBtn) this.undoBtn.disabled = !(this.history && this.history.canUndo());
    if (this.redoBtn) this.redoBtn.disabled = !(this.history && this.history.canRedo());
  };

  /* ---- public instance API ---- */

  /* §21 ONE PATH TO PAPER — the instance surface.
     app.print()        print the calculation record through Diagram.report().
                        Returns true when it did. Returns false, and hands the
                        page to the browser's own printer, when the tool has no
                        record — which is the only case in which a framework
                        page ever prints its screen deliberately.
     app.canPrintReport() the same test, without printing.
     app.printAction()  a button wired to it, six-language label included. */
  App.prototype.canPrintReport = function () { return !!printRecord(); };
  App.prototype.print = function (opts) {
    installPrint(this);
    if (printNow(opts)) return true;
    /* No record: the honest fallback is the framework print sheet, which is
       what PRINT_CSS is for. window.print() reaches it. */
    try { global.print(); } catch (e) { warn(e); }
    return false;
  };
  App.prototype.printAction = function (def) {
    var app = this;
    def = def || {};
    var b = this.actionButton({
      /* actionButton localises label and title itself, so both are handed over
         raw: a tool may pass a six-language object and it will be picked once */
      label: def.icon ? null : (def.label != null ? def.label : this.t('print')),
      icon: def.icon || null,
      title: def.title != null ? def.title : this.t('print_report'),
      variant: def.variant || null,
      run: function () { app.print(def.opts); }
    });
    return b;
  };


  /* TIER2 T3. Reveal a region and, for `nav`, publish the fact on the shell so
     the calculator and studio grids can switch to a nav-carrying template.
     Every place that used to write `host.hidden = false` goes through here. */
  App.prototype.useRegion = function (name) {
    var host = this.regions[name];
    if (!host) return null;
    host.hidden = false;
    if (this.regionWraps[name]) this.regionWraps[name].hidden = false;
    if (name === 'nav' && this.node) this.node.setAttribute('data-nav', '1');
    return host;
  };

  /* TIER2 T4. The journal: one entry per piece of furniture, in creation order,
     each marked with whether build() made it from opts (`boot`) or a tool made
     it imperatively afterwards. rebuild() replays the second kind. */
  App.prototype.journalAdd = function (kind, def, extra) {
    if (!this.journal) this.journal = [];
    this.journal.push({ kind: kind, def: def, extra: extra, boot: !!this.building });
    return this;
  };

  /* CLOSE-THE-LOOP 5. `key:` on an imperative constructor, and `app.byKey` as
     the live registry. §9 listed this as proposed and not built; three of four
     new tools needed it.
     damperselect.html: "There is no `app.steps` and no `app.tabs`.
     `replayJournal` calls `app.steps(e.def)` and throws the instance away. …
     After a language change the tool's Steps handle points at a detached node,
     so a step moved by Back/Continue, by an example, by a reset, by undo or by
     a permalink cannot reach the marker. I reproduced it: switch to German,
     press Back, form and results follow, marker does not."
     weldsymbols.html wanted "A key: on the imperative constructors".
     trussframe.html: "The guide never mentions that tool-owned listeners,
     tabindex and aria-label on the canvas die with the old Stage."
     Because rebuild() copies the new App's own properties onto the instance the
     tool holds, and the replay re-runs the same defs (which carry the same
     key), `app.byKey.<key>` is the live component after every rebuild — with no
     re-pointing in on.rebuild at all. */
  App.prototype.register = function (def, obj) {
    if (!this.byKey) this.byKey = {};
    if (def && def.key) this.byKey[def.key] = obj;
    return obj;
  };

  App.prototype.panel = function (def) {
    var slot = def.slot || 'inputs';
    var host = this.useRegion(slot) || this.useRegion('inputs');
    var p = new Panel(this, def);
    host.appendChild(p.node);
    this.panels.push(p);
    this.journalAdd('panel', def);
    return this.register(def, p);
  };

  App.prototype.stage = function (def) {
    var host = this.useRegion((def && def.slot) || 'stage');
    var s = new Stage(this, def, host);
    this.stages = this.stages || [];
    this.stages.push(s);
    this.journalAdd('stage', def);
    return this.register(def, s);
  };

  /* v3.6.4 — canonical controls immediately below a primary stage.
     `render` is for existing tool-owned controls that must keep their listeners;
     `actions` is for framework action descriptors. A note, when present, is
     deliberately in the same strip so Visual/Fast or Run/Ensemble semantics
     are discoverable at the point of action. */
  App.prototype.stageActions = function (def) {
    def = def || {};
    var host = this.useRegion(def.slot || 'stage');
    var row = el('div', { class: 'dgu-stage-actions' });
    if (def.id) { row.dataset.stageActions = def.id; row.dataset.dguStageActions = def.id; }
    if (def.learn) row.dataset.learn = def.learn;
    call(def.render, [row, this], 'stageActions.render');
    var aa = def.actions || [];
    for (var i = 0; i < aa.length; i++) row.appendChild(this.actionButton(aa[i]));
    if (def.note) row.appendChild(el('p', {
      class: 'dgu-hint',
      text: pick(asLabel(def.note), this.lang)
    }));
    host.appendChild(row);
    return row;
  };

  App.prototype.tabs = function (def) {
    var host = this.useRegion((def && def.slot) || 'nav');
    this.journalAdd('tabs', def);
    return this.register(def, new Tabs(this, def, host));
  };

  App.prototype.steps = function (def) {
    var host = this.useRegion((def && def.slot) || 'nav');
    this.journalAdd('steps', def);
    return this.register(def, new Steps(this, def, host));
  };

  /* A legend node bound to the chart-series scale. Place it where the drawing
     is: under a canvas, inside a results panel, in a stage (see Stage.legend). */
  App.prototype.legend = function (def) { return legend(def, this.lang); };

  /* A meter node: one value against its own limit. Also available declaratively
     as ui.results({meters:[…]}). node.update({value,…}) repaints it in place. */
  App.prototype.meter = function (def) { return meter(this, def || {}); };

  /* A results table as a standalone node, for tools that render their own
     result surface but want the framework's table (sticky header, chosen row,
     dimmed rows, reason column, width hint). */
  App.prototype.table = function (def) { return table(this, def || {}); };

  /* A transport: play/pause, frame slider, speed and a label the tool writes.
     With a `slot` it lands in a panel of its own; without one, `t.node` is the
     tool's to place — inside a stage, above a chart, wherever the frames are. */
  App.prototype.transport = function (def) {
    def = def || {};
    var t = new Transport(this, def);
    this.transports = this.transports || [];
    this.transports.push(t);
    if (def.slot || def.panel) {
      var pd = def.panel || {};
      t.panel = this.panel({
        id: pd.id || 'dgu-transport',
        slot: def.slot || pd.slot || 'dock',
        title: pd.title != null ? pd.title : (def.title != null ? def.title : this.t('frame')),
        learn: pd.learn || def.learn,
        render: function (box) { box.appendChild(t.node); }
      });
    }
    return this.register(def, t);
  };

  /* The other half of the shared bar's export. Returns an ACTION, so it drops
     straight into `actions:[…]`, `headerActions:[…]` or `header.actions`:
        ui.importAction({ label:'Open project…', accept:'.json', as:'json',
                          run:function(data,file){ … } })                    */
  App.prototype.importAction = function (def) {
    var app = this;
    def = def || {};
    return {
      id: def.id || 'import',
      label: def.label != null ? def.label : app.t('import'),
      icon: def.icon,
      title: def.title,
      variant: def.variant || 'ghost',
      run: function () {
        openFile(def).then(function (r) {
          if (!r) return;                       /* cancelled: say nothing */
          call(def.run, [r.data, r.file, app], 'import.run');
          if (def.quiet !== true) app.notify(app.t('import_ok') + ': ' + r.file.name, { kind: 'ok' });
        }, function (e) {
          warn('import failed:', e);
          app.notify(pick(asLabel(def.errorText), app.lang) || app.t('import_bad'), { kind: 'bad' });
        });
      }
    };
  };

  App.prototype.openFile = function (opts) { return openFile(opts); };

  App.prototype.region = function (name) {
    return this.useRegion(name);
  };

  /* ui.resizable({region:'inputs', min:240, max:680})  — a column
     ui.resizable({target:stage, axis:'y', min:220, max:900, key:'chart'}) — a height
     The handle appears only where the archetype actually has more than one
     column; on a phone the declaration is inert. */
  App.prototype.resizable = function (def) {
    var app = this;
    var s = new Splitter(this, def || {});
    this.splitters.push(s);
    if (!this.layoutBound) {
      /* the archetype's own track sizes change at 768 and 1120: re-measure and
         re-clamp there, so a width remembered on a wide screen cannot survive
         onto a narrow one */
      this.layoutBound = true;
      this.unbinds.push(on(global, 'resize', debounce(function () { app.applyLayout(true); }, 120)));
    }
    /* a fold outlives the visit, like a width does */
    if (s.def.remember !== false && nsGet('layout', s.key + '.fold', this) === '1') {
      global.setTimeout(function () { s.setFolded(true); }, 0);
    }
    this.scheduleLayout();
    return s;
  };

  App.prototype.scheduleLayout = function () {
    var app = this;
    if (this.layoutRaf) return;
    this.layoutRaf = global.setTimeout(function () { app.layoutRaf = null; app.applyLayout(true); }, 0);
  };

  /* One pass for every splitter on the page: the framework's own track sizes
     are measured pristine (inline style cleared first), so the archetype stays
     the source of truth and Home really does put the column back where the
     framework put it. */
  App.prototype.applyLayout = function (force) {
    var main = this.main;
    var list = this.splitters || [];
    if (!main || !list.length) return;

    var ys = [], xs = [];
    list.forEach(function (s) { if (!s.target) return; (s.axis === 'y' ? ys : xs).push(s); });

    /* The archetype's own tracks, measured with the inline template removed —
       so the framework, not the last drag, is always the reset target. It is a
       forced reflow, so it is cached per container width and only redone when
       the window changes or a splitter is added. */
    var c = this.layoutCache;
    if (force || !c || c.w !== main.clientWidth || c.n !== list.length) {
      main.style.gridTemplateColumns = '';
      var cs0 = global.getComputedStyle(main);
      var base0 = String(cs0.gridTemplateColumns).split(/\s+/).map(parseFloat)
        .filter(function (v) { return isFinite(v); });
      var gap0 = parseFloat(cs0.columnGap) || 0;
      var mr0 = main.getBoundingClientRect();
      var padL = parseFloat(cs0.paddingLeft) || 0, padR = parseFloat(cs0.paddingRight) || 0;
      /* the flexible track is the one the archetype lets grow; it is never
         dragged and never squeezed below SPLIT_MIN_FLEX */
      var flex0 = 0;
      for (var i = 1; i < base0.length; i++) if (base0[i] > base0[flex0]) flex0 = i;
      var edges0 = [], acc = mr0.left + padL;
      for (var j = 0; j < base0.length; j++) { edges0.push(acc); acc += base0[j] + gap0; }
      /* which track each region actually sits in, read off the pristine layout */
      xs.forEach(function (s) {
        var r = s.target.getBoundingClientRect();
        s.trackIndex = -1;
        for (var k = 0; k < edges0.length; k++) if (Math.abs(r.left - edges0[k]) < 3) { s.trackIndex = k; break; }
      });
      c = this.layoutCache = {
        w: main.clientWidth, n: list.length, base: base0, gap: gap0, flex: flex0,
        contentW: mr0.width - padL - padR
      };
    }
    var base = c.base, gap = c.gap, flex = c.flex;
    var multi = base.length >= 2;

    ys.forEach(function (s) { s.applyY(multi || s.def.always === true); });
    if (!xs.length) return;
    if (!multi) {
      xs.forEach(function (s) { s.node.hidden = true; s.active = false; if (s.fold) s.fold.hidden = true; });
      main.style.gridTemplateColumns = '';
      return;
    }

    var want = base.slice();
    xs.forEach(function (s) {
      /* the fold button moved off the handle and into the pane box in v3.6.2,
         so hiding the handle no longer hides it: at 390 px, where there are no
         columns to fold, it stayed on the page and fwgate found it buried under
         the disclaimer link. A control follows the control it belongs to. */
      if (s.trackIndex < 0 || s.trackIndex === flex) {
        s.node.hidden = true; s.active = false; if (s.fold) s.fold.hidden = true; return;
      }
      s.edge = s.trackIndex > flex ? 'start' : 'end';
      s.node.dataset.edge = s.edge;
      s.node.hidden = false;
      if (s.fold) s.fold.hidden = false;
      s.active = true;
      if (s.folded) want[s.trackIndex] = SPLIT_FOLD_W;
      else if (s.size != null) want[s.trackIndex] = s.size;
    });

    /* clamp against the room actually available, so no drag can hide the stage */
    var contentW = c.contentW;
    var gapsW = gap * (base.length - 1);
    xs.forEach(function (s) {
      if (!s.active) return;
      if (s.folded) { s.publish(SPLIT_FOLD_W, { lo: SPLIT_FOLD_W, hi: SPLIT_FOLD_W }); return; }
      var others = 0;
      for (var k = 0; k < want.length; k++) if (k !== s.trackIndex && k !== flex) others += want[k];
      var room = contentW - gapsW - others - SPLIT_MIN_FLEX;
      var b = s.bounds();
      var hi = Math.max(b.lo, Math.min(b.hi, room));
      var v = clamp(want[s.trackIndex], b.lo, hi);
      want[s.trackIndex] = v;
      if (s.size != null) s.size = v;
      s.publish(v, { lo: b.lo, hi: hi });
      call(s.def.onResize, [v, s], 'splitter.onResize');
    });

    var touched = xs.some(function (s) { return s.active && (s.size != null || s.folded); });
    if (!touched) { main.style.gridTemplateColumns = ''; return; }
    main.style.gridTemplateColumns = want.map(function (px, k) {
      return k === flex ? 'minmax(0,1fr)' : Math.round(px) + 'px';
    }).join(' ');
  };

  /* Give a region its own scrollbar where the archetype is multi-column.
     `from` is 'lg' (default, 1120 px up) or 'md' (768 px up, which is the gap
     ontvochtiging named). Below that width the region is an ordinary block and
     the document scrolls as one. */
  App.prototype.scrollRegion = function (name, opts) {
    var n = this.regions[name];
    if (!n) return null;
    var from = (opts && opts.from) === 'md' ? 'md' : 'lg';
    if (opts && opts.from === false) {
      n.removeAttribute('data-dgu-scroll');
      n.removeAttribute('data-dgu-pane');
    } else {
      n.setAttribute('data-dgu-scroll', from);
      /* declared state = v3.6 behaviour. applyPanes() takes it away again where
         it measures that there is nothing to scroll; a page whose JS dies
         between here and there keeps a working pane rather than losing one. */
      n.setAttribute('data-dgu-pane', '');
      this.panedRegions = this.panedRegions || [];
      if (this.panedRegions.indexOf(name) < 0) this.panedRegions.push(name);
      this.bindPanes();
      this.schedulePanes();
    }
    return n;
  };

  /* ---- v3.6.1 §22 the conditional pane ---------------------------------- */
  /* What the pane's own gutter actually costs, measured once against a probe
     that carries the pane's declarations rather than against a generic
     scrolling box. The two are NOT the same number: this container's headless
     Chromium hands a plain `overflow:scroll` element an overlay scrollbar and
     reports 0, while `scrollbar-gutter:stable` on the same element reserves 15
     px — measuring the wrong one is how the first cut of this fix quietly
     applied a 0 px allowance to a 15 px debt. 0 is still the right answer on a
     platform with real overlay scrollbars, and there it costs the stage
     nothing. */
  var SBW = null;
  function paneGutter() {
    if (SBW != null) return SBW;
    SBW = 0;
    try {
      var d = doc.createElement('div');
      d.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;' +
        'overflow-y:auto;scrollbar-gutter:stable';
      doc.body.appendChild(d);
      SBW = d.clientWidth ? 100 - d.clientWidth : 0;
      doc.body.removeChild(d);
    } catch (e) { SBW = 0; }
    if (!isFinite(SBW) || SBW < 0 || SBW > 40) SBW = 0;
    return SBW;
  }

  /* Which region sits in the first and last side track of each archetype. The
     flexible middle track never gets an allowance: it is what the allowance is
     taken from. */
  var SIDE_REGIONS = {
    calculator: { a: 'inputs', z: 'results' },
    studio: { a: 'inputs', z: 'detail' },
    wizard: { a: 'nav', z: 'results' },
    reference: { a: 'nav', z: null }
  };

  /* Which side regions each archetype scrolls, and from which breakpoint. The
     value is the width at which that region first BECOMES a side track in the
     archetype's own grid — never earlier, or a pane would be laid over a
     single-column page. */
  var DEFAULT_PANES = {
    calculator: { inputs: 'md', results: 'lg' },
    studio: { inputs: 'md', detail: 'lg' },
    wizard: { nav: 'md', results: 'lg' },
    reference: { nav: 'md' }
  };

  /* …and which of them the reader may drag. `min` is the archetype's own track
     width rounded down to something that still holds a label; `max` leaves the
     stage at least SPLIT_MIN_FLEX, which applyLayout re-clamps against the real
     container anyway. Dragging the rail wider is what makes the L3 field grid
     break into columns, so this is the control the reader uses to trade the
     stage for a shorter column of inputs. */
  var DEFAULT_HANDLES = {
    calculator: [{ region: 'inputs', min: 260, max: 620, key: 'inputs' },
                 { region: 'results', min: 260, max: 560, key: 'results' }],
    studio: [{ region: 'inputs', min: 220, max: 620, key: 'inputs' },
             { region: 'detail', min: 240, max: 560, key: 'detail' }],
    wizard: [{ region: 'nav', min: 200, max: 520, key: 'nav' },
             { region: 'results', min: 260, max: 560, key: 'results' }],
    reference: [{ region: 'nav', min: 220, max: 560, key: 'nav' }]
  };

  App.prototype.bindPanes = function () {
    var app = this;
    if (this.panesBound) return;
    this.panesBound = true;
    this.unbinds.push(on(global, 'resize', debounce(function () { app.applyPanes(); }, 120)));
    /* content grows and shrinks under us — a panel opens, a language with
       longer words is chosen, a validation message appears — and each of those
       can move a column across the cap in either direction. */
    if (global.ResizeObserver) {
      var ro = new global.ResizeObserver(debounce(function () { app.applyPanes(); }, 120));
      this.paneRo = ro;
      this.unbinds.push(function () { try { ro.disconnect(); } catch (e) {} });
    }
  };

  App.prototype.schedulePanes = function () {
    var app = this;
    if (this.paneRaf) return;
    this.paneRaf = global.setTimeout(function () { app.paneRaf = null; app.applyPanes(); }, 0);
  };

  /* Decide, per declared region, whether the pane is EARNING its reservation.
     Measured, not assumed: the attribute comes off, the natural height is read,
     and it goes back on only if that height exceeds the cap the CSS would
     impose. Everything this touches is reversible and idempotent, so the pass
     is safe to run on every resize. */
  /* Find the control a tool exists for, when the tool never said which it was.
     The marker `data-dgu-primary` is the contract and always wins; this is the
     fallback, and it is deliberately narrow, because guessing wrong pins the
     wrong thing to the bottom of a column. It fires only when ALL of these
     hold: the region is a pane, nothing in it is already marked, and exactly
     ONE button in it reads as the tool's run verb in the current language.
     Two candidates, or none, and the framework does nothing.

     The alternative was to mark 13 tool pages by hand — measured: weldsymbols,
     waterhammer, verwarmenkoelenselector, roomacoustics, relativity,
     nuclideatlas, luchtgroepselector, fastenergrades, debrisrunout,
     neutron_transport, wallthermalcalculator, kernnormenwijzer and trussframe
     all bury their action inside a paned column. Thirteen edits that each say
     the same thing is the shape of a missing framework rule. */
  App.prototype.findPrimary = function (region) {
    var verbs = String(this.t('run_verbs') || '').split('|').filter(Boolean);
    if (!verbs.length) return null;
    var re = new RegExp('^\\s*[\\u25b6\\u2023\\u2192>]?\\s*(' + verbs.join('|') + ')\\b', 'i');
    var hits = [];
    var all = region.querySelectorAll('button,.dgu-btn,[role="button"]');
    for (var i = 0; i < all.length && hits.length < 3; i++) {
      var e = all[i];
      var txt = (e.innerText || e.value || '').trim();
      if (!txt || !re.test(txt)) continue;
      var r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) continue;
      /* the bar around it, if the tool grouped the action with a reset button,
         is a better thing to pin than the button alone */
      var box = e.parentElement;
      hits.push(box && box !== region && box.children.length <= 3 &&
        box.querySelectorAll('button,.dgu-btn').length === box.children.length ? box : e);
    }
    if (hits.length !== 1) return null;
    hits[0].setAttribute('data-dgu-primary', '');
    hits[0].setAttribute('data-dgu-primary-inferred', '');
    return hits[0];
  };

  App.prototype.applyPanes = function () {
    var app = this, names = this.panedRegions;
    if (!names || !names.length || !this.main) return;
    if (this.panesBusy) return;
    this.panesBusy = true;
    try {
      var headH = parseFloat(global.getComputedStyle(doc.documentElement)
        .getPropertyValue('--dgu-head-h')) || 64;
      var sp4 = 16;
      var cap = global.innerHeight - headH - sp4;
      var w = global.innerWidth;
      var state = {};

      names.forEach(function (name) {
        var n = app.regions[name];
        if (!n || n.hidden) { state[name] = false; return; }
        var from = n.getAttribute('data-dgu-scroll');
        if (!from) { state[name] = false; return; }
        /* below the archetype's own threshold the region is an ordinary block
           and the document scrolls as one — there is no pane to justify */
        if (w < (from === 'md' ? 768 : 1120)) { state[name] = false; return; }
        var had = n.hasAttribute('data-dgu-pane');
        if (had) n.removeAttribute('data-dgu-pane');
        /* the flow is settled FIRST, because it changes the answer: on cfd at a
           537 px rail, one column is 2 406 px tall and two columns are 820 —
           measuring the height under the old flow decides the pane on a number
           that is about to stop being true */
        var pcol = parseFloat(global.getComputedStyle(n).getPropertyValue('--dgu-panelcol')) || 230;
        if (n.clientWidth >= pcol * 2 + 16) n.setAttribute('data-dgu-flow', 'cols');
        else n.removeAttribute('data-dgu-flow');
        var natural = n.getBoundingClientRect().height;
        /* 4 px of hysteresis: a column sitting exactly on the cap must not
           flap between paned and not on every observer tick */
        var want = natural > cap + (had ? -4 : 4);
        if (want) n.setAttribute('data-dgu-pane', '');
        state[name] = want;
        if (app.paneRo) { try { app.paneRo.observe(n); } catch (e) {} }
      });

      /* §22.9 — the primary action is lifted to be a direct child of the pane
         it lives in, and put back when the pane goes away. `position:sticky` is
         confined to its element's own containing block, not to the scroll
         container it is in, so a control nested inside a 44 px field wrapper
         cannot stick anywhere no matter what the scroll box does — measured on
         cfd, where the rule computed `position:sticky; bottom:0px` and the
         button still sat at y=2 222 inside a `.dgu-fctl` with no room to
         travel. Being a child of the region gives it the whole column to stick
         against. Nothing is cloned and nothing is rebuilt: the node itself
         moves, so its listeners, its id and the tool's own handles on it are
         the same object they always were, and the original position is
         remembered so a narrow screen gets its markup back exactly. */
      names.forEach(function (name) {
        var n = app.regions[name];
        if (!n) return;
        var mark = n.querySelector('[data-dgu-primary]') || app.findPrimary(n);
        var mem = app.hoisted && app.hoisted[name];
        if (state[name] && mark && mark.parentNode !== n) {
          app.hoisted = app.hoisted || {};
          app.hoisted[name] = { node: mark, parent: mark.parentNode, next: mark.nextSibling };
          var was = mark.parentNode;
          n.appendChild(mark);
          n.style.setProperty('--dgu-primary-h',
            Math.round(mark.getBoundingClientRect().height) + 'px');
          for (var q = was; q && q !== n; q = q.parentNode) {
            if (q.children.length === 0 &&
                (q.classList.contains('dgu-fctl') || q.classList.contains('dgu-field')))
              q.setAttribute('data-dgu-emptied', '');
            else break;
          }
        } else if (!state[name] && mem && mem.node.parentNode === n) {
          mem.parent.insertBefore(mem.node, mem.next || null);
          n.style.removeProperty('--dgu-primary-h');
          for (var z = mem.parent; z && z !== n; z = z.parentNode) {
            if (z.removeAttribute) z.removeAttribute('data-dgu-emptied');
          }
          app.hoisted[name] = null;
        }
      });

      var map = SIDE_REGIONS[this.opts.layout] || {};
      var sbw = paneGutter();
      var st = this.main.style;
      var wantA = map.a && state[map.a] ? sbw : 0;
      var wantZ = map.z && state[map.z] ? sbw : 0;
      /* …but never at the stage's expense. The allowance moves 15 px per side
         out of the flexible track, and at 1120 with both rails paned that is
         30 px off a stage that may already be at its floor: measured on
         moodydiagram the stage went 340 -> 310 and the count of elements
         overflowing inside it went 10 -> 26 (worst 220 -> 250 px), and
         reactorstand 470 -> 440, 5 -> 7. Charging the fields for the scrollbar
         was the defect; charging a stage that has no room to give is the same
         defect wearing the other hat. SPLIT_MIN_FLEX is already the framework's
         answer to "how little stage is too little", so the allowance is taken
         only while the stage stays at or above it, and the end rail gives its
         15 px back first. */
      var main = this.main;
      /* the stage is track 1 in every archetype the framework defines —
         `inputs stage …`, `nav inputs …` — and it is NOT simply the widest
         track: on moodydiagram at 1120 the rails are 355 and 375 px against a
         310 px stage, so picking the largest track finds a rail and the guard
         never fires. Read the position, not the size. */
      var flexOf = function () {
        var t = String(global.getComputedStyle(main).gridTemplateColumns)
          .split(/\s+/).map(parseFloat).filter(function (v) { return isFinite(v); });
        return t.length < 2 ? Infinity : t[1];
      };
      var tries = [[wantA, wantZ], [wantA, 0], [0, 0]];
      for (var ti = 0; ti < tries.length; ti++) {
        st.setProperty('--dgu-sb-a', tries[ti][0] + 'px');
        st.setProperty('--dgu-sb-z', tries[ti][1] + 'px');
        if (!tries[ti][0] && !tries[ti][1]) break;
        if (flexOf() >= SPLIT_MIN_FLEX) break;
      }
      /* the tracks just changed width, so any splitter's pristine measurement
         is stale — applyLayout caches on main.clientWidth, which did not move */
      if (this.splitters && this.splitters.length) this.applyLayout(true);
    } finally {
      this.panesBusy = false;
    }
  };

  /* A standing qualification on the answer. Default placement follows where the
     five tools that had one put it: the top of the column the reader is in. */
  App.prototype.notice = function (def) {
    def = def || {};
    var slot = def.slot || (this.opts.layout === 'reference' ? 'stage' : 'inputs');
    var host = this.useRegion(slot) || this.useRegion('inputs');
    var n = new Notice(this, def);
    if (def.place === 'end' || !host.firstChild) host.appendChild(n.node);
    else host.insertBefore(n.node, host.firstChild);
    this.notices.push(n);
    this.journalAdd('notice', def);
    return this.register(def, n);
  };

  /* find a built panel by its declared id — the handle a tour step, a deep link
     or a validation message needs in order to open a collapsed group */
  App.prototype.findPanel = function (id) {
    for (var i = 0; i < this.panels.length; i++) if (this.panels[i].def.id === id) return this.panels[i];
    return null;
  };

  /* namespaced persistence for tool code: app.remember('facet.name') /
     app.remember('facet.name', value). Reserved facets: layout, panel, notice. */
  App.prototype.remember = function (name, value) {
    var parts = String(name).split('.');
    var facet = parts.length > 1 ? parts.shift() : 'tool';
    var rest = parts.join('.');
    if (arguments.length === 1) return nsGet(facet, rest, this);
    nsSet(facet, rest, value, this);
    return value;
  };

  App.prototype.results = function (data) {
    if (!this.resultsView) return null;
    /* v3.4 §19: bare `ui.results()` is a READ. It used to fall through to
       set(undefined) and wipe the answer off the screen — the exact call the
       report that prompted this release names ("ui.results() returns null"),
       and a trap for anyone who tries it in a console. `results(null)` is
       still the way to clear, and is what reset() and example() use.
       Checked against the tree: no ported tool calls it with no argument. */
    if (arguments.length === 0) return this.resultsView;
    /* v3.4 §19: a `reference` view is built closed and opens on its first
       answer, so a lookup that never returns one is byte-for-byte the page it
       was before this release. `results(null)` is not an answer — reset() and
       example() call it — so it does not open the region either. */
    if (this.resultsView.deferred && data) {
      this.resultsView.deferred = false;
      this.resultsView.node.hidden = false;
      this.useRegion(this.resultsView.slot || 'results');
    }
    if (this.state_ === 'pending' || this.state_ === 'computing') this.setState('ready');
    this.resultsView.set(data);
    return this.resultsView;
  };

  App.prototype.renderStrip = function (data) {
    /* UI_AUDIT.md S-16: below md the answer is on the first screen. */
    if (!this.stripBox) return;
    var tiles = (data && data.tiles) || [];
    var head = tiles.filter(function (t) { return t.headline !== false; }).slice(0, 3);
    clear(this.stripBox);
    if (!head.length || this.opts.layout === 'reference' || this.opts.layout === 'studio') {
      this.regions.strip.hidden = true;
      if (this.regionWraps.strip) this.regionWraps.strip.hidden = true;
      doc.documentElement.style.setProperty('--dgu-strip-h', '0px');
      return;
    }
    var app = this;
    head.forEach(function (t) {
      var ue = t.unit ? unitFor(t, app.opts.units && app.opts.units.overrides) : null;
      var v = t.value;
      if (typeof v === 'number' && ue) v = toDisplay(v, ue);
      app.stripBox.appendChild(el('div', { class: 'dgu-strip-i' }, [
        el('div', { class: 'dgu-strip-l', text: pick(asLabel(t.label), app.lang) }),
        el('div', {
          class: 'dgu-strip-v',
          text: (v == null ? '—' : (typeof v === 'number' ? fmt(v, { precision: t.precision }) : String(v)))
            + (t.unit ? ' ' + unitLabel(ue, t.unit) : '')
        })
      ]));
    });
    this.useRegion('strip');
    /* the sticky result strip and a sticky notice both dock under the header
       below md; publish the strip's height so the notice can stand clear of it
       instead of landing on the answer */
    var sr = this.regions.strip.getBoundingClientRect();
    doc.documentElement.style.setProperty('--dgu-strip-h', Math.round(sr.height) + 'px');
  };

  App.prototype.setState = function (s, detail) {
    this.state_ = s;
    if (s === 'error') this.errorText = detail || this.errorText;
    this.node.setAttribute('data-state', s);
    if (this.resultsView) this.resultsView.renderStateLine();
    call(this.opts.on && this.opts.on.state, [s, this], 'on.state');
    return this;
  };

  App.prototype.sync = function () {
    this.panels.forEach(function (p) { p.sync(); });
    this.syncActions();
    this.syncHeader();
    return this;
  };

  /* Public since TIER2: a tool that mutates the model itself (a stage drag, a
     row added to a list) can put the pre-edit state on the undo stack without
     reaching into ui.history and repeating the "is a history declared" test.
     A no-op unless the tool declared history.capture. */
  App.prototype.pushHistory = function () {
    if (this.history && this.opts.history && isFn(this.opts.history.capture)) this.history.push();
    return this;
  };

  App.prototype.onFieldCommit = function (field, value, immediate) {
    var app = this;
    if (this.histFromField_) this.histFromField_ = false;
    else if (this.history && this.opts.history && isFn(this.opts.history.capture) && immediate) this.history.push();
    this.sync();
    call(this.opts.on && this.opts.on.change, [field.def.key, value, this], 'on.change');
    if ((this.opts.compute || 'live') === 'live') {
      if (!this.computeSoon) {
        this.computeSoon = debounce(function () { app.run(); }, this.opts.debounce || 120);
      }
      this.setState('computing');
      this.computeSoon();
    } else if (this.state_ === 'ready') {
      this.setState('stale');
    }
  };

  App.prototype.run = function () {
    var app = this;
    this.setState('computing');
    var out = call(this.opts.on && this.opts.on.compute, [this.state, this], 'on.compute');
    if (out && isFn(out.then)) {
      out.then(function (r) { app.results(r); app.setState('ready'); },
        function (e) { app.setState('error', String(e && e.message || e)); });
    } else {
      if (out !== undefined) this.results(out);
      this.setState(this.state_ === 'error' ? 'error' : 'ready');
    }
    return this;
  };

  /* state-orphan (15 files; moodydiagram.html: "App.reset() and App.example()
     assign a NEW object to this.state while every Field holds a reference to
     the old one"; spectrum.html: "the object this file holds — the one
     serialize(), record() and the handoff write through — is orphaned the
     moment either runs, and the permalink then freezes at the reset value").
     xenon, spectrum and moodydiagram each shipped the same repair — refill the
     object in place and point app.state back at it — so the framework does it
     once, here. The CONTENT is what full replacement produced: keys absent
     from the source are deleted first, so `state` still ends up a deep copy of
     defaults / example.state, only with its identity kept. Nested objects are
     still replaced, exactly as before; only the top-level object survives,
     which is the reference the 15 tools hold. */
  function adoptState(target, src) {
    var copy;
    try { copy = JSON.parse(JSON.stringify(src)); } catch (e) { copy = src; }
    if (!target || typeof target !== 'object' || Array.isArray(target) ||
        !copy || typeof copy !== 'object' || Array.isArray(copy)) return copy;
    Object.keys(target).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(copy, k)) delete target[k];
    });
    Object.keys(copy).forEach(function (k) { target[k] = copy[k]; });
    return target;
  }

  App.prototype.reset = function () {
    var d = this.opts.defaults;
    if (d) {
      var src = isFn(d) ? call(d, [], 'defaults') : d;
      this.state = adoptState(this.state, src);
    }
    call(this.opts.on && this.opts.on.reset, [this.state, this], 'on.reset');
    this.sync();
    if ((this.opts.compute || 'live') === 'live') this.run();
    else { this.setState('pending'); if (this.resultsView) this.resultsView.set(null); }
    this.notify(this.t('reset'), { kind: 'ok' });
    return this;
  };

  /* §8.3.1 — an example declaring `id:` can be applied by that id, and the id is
     on the element the panel rendered. outdoornoise.html:1529 is why the
     framework owes this and not the tool: it tagged
     `panel.node.querySelectorAll('button')` with its own preset ids under the
     comment "the preset id stays addressable, as it was on the old preset grid",
     which was true of the button-per-example panel and stopped being true the
     moment §8.3 [v3.1] started rendering a <select> + one Load for a list over
     12. Sixteen of its seventeen ids were dropped in silence; its parity probe
     then drove one scene for eighteen cases and 16 of 18 compared the wrong
     scene. `/root/verification/wh-parity.mjs:162` has the same assumption in a
     second, independent consumer — it indexes
     `[data-dgu-panel="dgu-examples"] button` — and waterhammer also passes 17
     examples, so its `--ui` cross-check silently covers case 0 only. The panel's
     shape belongs to the framework; so does the identity of what is in it. */
  App.prototype.example = function (ex) {
    if (typeof ex === 'string') {
      var byId = this.exampleIds && this.exampleIds[ex];
      if (!byId) { warn('example: no example with id ' + JSON.stringify(ex)); return this; }
      ex = byId;
    }
    if (!ex) return this;
    if (ex.state) this.state = adoptState(this.state, ex.state);
    call(ex.apply, [this.state, this], 'example.apply');
    this.sync();
    if ((this.opts.compute || 'live') === 'live') this.run();
    else {
      this.setState('pending');
      if (this.resultsView) this.resultsView.set(null);
      this.notify(pick(asLabel(ex.label), this.lang) + ' — ' + this.t('pending_run'), { kind: 'ok' });
    }
    return this;
  };

  /* probabilisticrisk.html could not use this for "Examples (40-preset select +
     hint + Load preset)" — forty buttons is not a preset list, it is a wall.
     decayheat has the same shape ("27 presets in 8 `<optgroup>`s") and
     roomacoustics needed a "Browse presets…" dialog for 15. So: the moment an
     entry declares a `group`, or the list is longer than `opts.max` (12), the
     panel renders a grouped <select> + the selected example's note + Load,
     instead of a button per preset. Lists that fit are unchanged, which is
     every list the 52 ported pages currently pass. */
  App.prototype.examples = function (list, opts) {
    var app = this;
    if (!list || !list.length) return null;
    opts = opts || {};
    var grouped = list.some(function (ex) { return ex && ex.group != null; });
    var asSelect = opts.as === 'select' || (opts.as !== 'buttons' &&
      (grouped || list.length > (opts.max || 12)));

    /* §8.3.1 the addressable identity. `id:` is optional and tool-chosen; a list
       that declares none behaves exactly as it did, down to the <option> values
       still being ordinals — which is every list the shipped tree passes today.
       An entry that declares one gets `data-example="<id>"` on whichever element
       this panel rendered for it (the <option> here, the <button> below), and
       the <option>'s value IS the id, so `select.value = '<id>'` addresses it
       without knowing the declaration order. */
    this.exampleIds = this.exampleIds || {};
    var ids = this.exampleIds;
    list.forEach(function (ex, i) {
      if (!ex || ex.id == null) return;
      var k = String(ex.id);
      if (ids[k] && ids[k] !== ex) warn('examples: duplicate example id ' + JSON.stringify(k));
      ids[k] = ex;
    });
    function exValue(ex, i) { return ex && ex.id != null ? String(ex.id) : String(i); }
    function exAt(v) {
      if (Object.prototype.hasOwnProperty.call(ids, String(v))) {
        var e = ids[String(v)];
        if (list.indexOf(e) >= 0) return e;
      }
      return list[Number(v) | 0];
    }

    /* UI_AUDIT.md S-11: presets always at the top of inputs, always called Examples. */
    var p = new Panel(this, {
      id: 'dgu-examples',
      title: this.t('examples'),
      render: asSelect ? function (box) {
        var wrap = el('div', { class: 'dgu-exsel' });
        var row = el('div', { class: 'dgu-exsel-row' });
        var sel = el('select', { class: 'dgu-sel', 'aria-label': app.t('choose') });
        /* preserve declaration order; an entry with no group joins the group
           that precedes it, exactly as an <optgroup> list reads */
        var groups = [], byGroup = {};
        list.forEach(function (ex, i) {
          var g = ex.group != null ? pick(asLabel(ex.group), app.lang) : '';
          if (!byGroup.hasOwnProperty(g)) { byGroup[g] = []; groups.push(g); }
          byGroup[g].push([exValue(ex, i), pick(asLabel(ex.label), app.lang)]);
        });
        fillSelect(sel, groups.map(function (g) { return [g || null, byGroup[g]]; }));
        Array.prototype.forEach.call(sel.options, function (o) {
          var ex = exAt(o.value);
          if (ex && ex.id != null) o.dataset.example = String(ex.id);
        });
        var note = el('div', { class: 'dgu-hint' });
        function showNote() {
          var ex = exAt(sel.value);
          note.textContent = ex && ex.note ? pick(asLabel(ex.note), app.lang) : '';
          note.hidden = !note.textContent;
        }
        on(sel, 'change', function () {
          showNote();
          if (opts.apply === 'change') app.example(exAt(sel.value));
        });
        row.appendChild(sel);
        if (opts.apply !== 'change') {
          var load = app.actionButton({
            label: opts.loadLabel || app.t('load'), variant: 'primary',
            run: function () { app.example(exAt(sel.value)); }
          });
          /* the one control that applies whatever is chosen, named so a driver
             can find it without counting buttons */
          load.dataset.exampleLoad = '';
          row.appendChild(load);
        }
        wrap.appendChild(row);
        wrap.appendChild(note);
        showNote();
        box.appendChild(wrap);
      } : function (box) {
        list.forEach(function (ex) {
          /* TIER2 T1: the wrap comes from .dgu-btn-wrap, not from an inline
             style, so a tool can still say something else about these buttons.
             .dgu-btn{white-space:nowrap} used to push the whole document
             sideways here — 513 px at 390 px in debrisrunout. */
          var b = el('button', {
            class: 'dgu-btn dgu-btn-wrap', type: 'button',
            dataset: ex.id != null ? { example: String(ex.id) } : null
          });
          b.appendChild(el('span', {}, [
            el('div', { style: { 'font-weight': '650' }, text: pick(asLabel(ex.label), app.lang) }),
            ex.note ? el('div', { class: 'dgu-hint', text: pick(asLabel(ex.note), app.lang) }) : null
          ]));
          on(b, 'click', function () { app.example(ex); });
          box.appendChild(b);
        });
      }
    });
    var host = this.useRegion('inputs');
    host.insertBefore(p.node, host.firstChild);
    this.panels.push(p);
    this.journalAdd('examples', list, opts);
    return p;
  };

  App.prototype.resetAction = function () {
    /* placed by the caller in the inputs panel footer, per the placement law */
    var app = this;
    return { label: this.t('reset'), variant: 'ghost', run: function () { app.reset(); } };
  };

  App.prototype.notify = function (msg, opts) {
    opts = opts || {};
    if (global.Diagram && isFn(global.Diagram.notify)) {
      return global.Diagram.notify(msg, opts.kind, opts.code);
    }
    warn(msg);
    return null;
  };

  App.prototype.dialog = function (def) { return dialog(this, def); };

  App.prototype.fail = function (reason) {
    /* UI_AUDIT.md S-2: a data failure costs the results, never the chrome. */
    this.failReason = pick(asLabel(reason), this.lang) || this.t('failed');
    this.setState('failed');
    if (this.resultsView) this.resultsView.render();
    if (global.Diagram && isFn(global.Diagram.toolbar && global.Diagram.toolbar.refresh)) {
      try { global.Diagram.toolbar.refresh(); } catch (e) {}
    }
    this.notify(this.failReason, { kind: 'err' });
    return this;
  };

  App.prototype.ready = function () {
    if (this.state_ === 'pending') this.setState('idle');
    if ((this.opts.compute || 'live') === 'live') this.run();
    this.sync();
    this.learn.maybeAutoStart();
    measureChrome();
    call(this.opts.on && this.opts.on.ready, [this], 'on.ready');
    if (readyResolve) { readyResolve(true); readyResolve = null; }
    global.__diagramUIReady = true;
    return this;
  };

  App.prototype.undo = function () { if (this.history && this.history.undo()) { this.sync(); if ((this.opts.compute || 'live') === 'live') this.run(); } };
  App.prototype.redo = function () { if (this.history && this.history.redo()) { this.sync(); if ((this.opts.compute || 'live') === 'live') this.run(); } };

  App.prototype.setLang = function (l) {
    if (SITE_LANGS.indexOf(l) < 0) return this.siteLang;
    this.siteLang = l;
    this.lang = domainLang(this.manifest, l);
    store('diagram_site_lang', l);
    store('diagram_lang', l);
    try {
      var u = new global.URL(global.location.href);
      u.searchParams.set('lang', l);
      global.history.replaceState(null, '', u);
    } catch (e) {}
    if (global.Diagram) {
      if (isFn(global.Diagram.setDocumentLang)) global.Diagram.setDocumentLang(l);
      if (isFn(global.Diagram.setLang)) global.Diagram.setLang(l);
    } else if (doc.documentElement.lang !== l) doc.documentElement.lang = l;
    call(this.opts.on && this.opts.on.lang, [this.lang, this], 'on.lang');
    this.rebuild();
    return this.siteLang;
  };

  /* TIER2 T4 — where a journal entry's furniture lands, and how to count what
     is already there. The test for "already present" is the DOM, not the
     declaration: a tool that re-creates its own furniture in on.ready (which is
     how seven ports worked around this defect) has already put it on screen by
     the time replay runs, and its count is what stops replay from doubling it. */
  var REPLAY_SEL = {
    panel:    ['.dgu-panel[data-dgu-panel]:not([data-dgu-panel="dgu-examples"])', false],
    examples: ['[data-dgu-panel="dgu-examples"]', false],
    stage:    ['.dgu-stage', false],
    notice:   ['.dgu-notice', false],
    tabs:     ['.dgu-tabs', true],
    steps:    ['.dgu-steps', true]
  };
  function countIn(host, sel, deep) {
    if (!host) return 0;
    if (deep) { try { return host.querySelectorAll(sel).length; } catch (e) { return 0; } }
    var n = 0, c = host.children;
    for (var i = 0; i < c.length; i++) {
      try { if (c[i].matches && c[i].matches(sel)) n += 1; } catch (e) {}
    }
    return n;
  }

  App.prototype.journalSlot = function (e) {
    var d = e.def || {};
    if (e.kind === 'examples') return 'inputs';
    if (e.kind === 'notice') return d.slot || (this.opts.layout === 'reference' ? 'stage' : 'inputs');
    if (e.kind === 'panel') return d.slot || 'inputs';
    if (e.kind === 'stage') return d.slot || 'stage';
    return d.slot || 'nav';
  };

  App.prototype.journalKey = function (e) { return e.kind + '|' + this.journalSlot(e); };

  App.prototype.journalCount = function (e) {
    var sel = REPLAY_SEL[e.kind];
    if (!sel) return 0;
    return countIn(this.regions[this.journalSlot(e)], sel[0], sel[1]);
  };

  /* Replay the imperative half of a previous instance's journal onto this one,
     up to — never past — the count that was on screen before the rebuild.
     App.rebuild() rebuilt only from opts, which cost every tool the furniture
     it had created after app(). SEVEN reports name it. roofstormwater:
     "App.rebuild() rebuilds only what is declared in opts — anything created
     imperatively after app() (ui.examples, ui.stage, ui.tabs) is silently lost
     on a language change; ui-demo.html has the same latent bug."  heat2d says
     the same and works around it by destroying its whole app instead.
     procesklimaat measured the cost: "Switching language silently lost 'Load a
     typical set', 'Show a conflict example' and Reset."  Also decayheat,
     debrisrunout, gasdynamics, wallthermalcalculator, steam_tables,
     heat_exchangers, and klimaatcalculator's "stages 4 -> 0". */
  App.prototype.replayJournal = function (entries, want) {
    var app = this, have = {};
    (entries || []).forEach(function (e) {
      if (e.boot) return;
      var k = app.journalKey(e);
      if (have[k] == null) have[k] = app.journalCount(e);
      var target = (want && want[k] != null) ? want[k] : 0;
      if (have[k] >= target) return;
      have[k] += 1;
      try {
        if (e.kind === 'panel') app.panel(e.def);
        else if (e.kind === 'examples') app.examples(e.def, e.extra);
        else if (e.kind === 'stage') app.stage(e.def);
        else if (e.kind === 'tabs') app.tabs(e.def);
        else if (e.kind === 'steps') app.steps(e.def);
        else if (e.kind === 'notice') app.notice(e.def);
      } catch (err) {
        have[k] -= 1;
        warn('rebuild: could not replay ' + e.kind + ' — ' + (err && err.message));
      }
    });
    return this;
  };

  App.prototype.rebuild = function () {
    var app = this;
    var opts = this.opts;
    var state = this.state;
    var langNow = this.lang;
    var learnOn = this.learn.on;
    var journal = this.journal || [];
    /* what is on screen now, per (kind, region), so the rebuilt shell can be
       brought back up to the same count and no further */
    var want = {};
    journal.forEach(function (e) {
      if (e.boot) return;
      var k = app.journalKey(e);
      if (want[k] == null) want[k] = app.journalCount(e);
    });
    /* steam_tables: "Upstream, rebuild() should re-render the last results
       payload" — the pre-port page kept its answer across a language change. */
    var lastResults = this.resultsView ? this.resultsView.data : null;
    var lastState = this.state_;

    /* v3.7.2 — rebuild IN PLACE.  The former implementation constructed a
       second App and copied its fields back onto this one.  DOM callbacks then
       closed over that temporary App while tool callbacks (and descriptors such
       as `label: () => ui.t(...)`) still closed over the original object.  After
       one language switch the two identities diverged; after a second switch a
       framework action could remain in the previous language.  Keep the public
       App identity stable instead: destroy its furniture, clear own runtime
       fields, and run the constructor against the same object. */
    this.destroy(true);
    Object.keys(this).forEach(function (k) { try { delete app[k]; } catch (e) {} });
    App.call(this, Object.assign({}, opts, { state: state, lang: langNow }));
    this.learn.toggle(learnOn);
    this.ready();
    this.replayJournal(journal, want);
    if (lastResults && this.resultsView && !this.resultsView.data) {
      if (this.resultsView.deferred) this.results(lastResults);
      else this.resultsView.set(lastResults);
      if (lastState === 'ready' || lastState === 'stale') this.setState(lastState);
    }
    App.current = this;
    call(this.opts.on && this.opts.on.rebuild, [this], 'on.rebuild');
    return this;
  };

  App.prototype.destroy = function (keepMount) {
    (this.stages || []).forEach(function (s) { s.destroy(); });
    (this.notices || []).forEach(function (n) { n.destroy(); });
    (this.splitters || []).forEach(function (s) { s.destroy(); });
    (this.transports || []).forEach(function (t) { t.destroy(); });
    if (this.shortcuts) this.shortcuts.destroy();
    if (this.headRo) { try { this.headRo.disconnect(); } catch (e) {} }
    this.unbinds.forEach(function (u) { call(u, [], 'unbind'); });
    this.unbinds = [];
    this.learn.endTour(false);
    closePopover();
    if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node);
    if (!keepMount) safeState.target = null;
    return this;
  };

  /* ================================================================ boot/API */

  var readyResolve = null;
  var readyPromise = new Promise(function (res) { readyResolve = res; });

  function app(opts) {
    var a = new App(opts || {});
    App.current = a;
    return a;
  }

  /* Enough of an app for a component built before (or without) DiagramUI.app():
     a language and the framework's own strings. */
  function fallbackCtx() {
    var l = currentLang();
    return { lang: l, opts: {}, t: function (k) { return pick(UI_STRINGS[k] || k, l); } };
  }

  /* ======================================================================
     §18  THE SCENE PRIMITIVE — one interaction layer for the `studio`
     ----------------------------------------------------------------------
     Why this exists, measured, not asserted.

     `studio` is declared in UI_FRAMEWORK_SPEC as "the user creates and
     manipulates objects in a drawing (place, drag, select, delete)". The
     layout existed; the mechanics did not. trussframe.html — a brand-new
     studio built from AUTHORING.md alone, by an agent forbidden to read any
     existing tool — wrote ~240 lines to get there and said so in the file:
     "the framework has no interaction primitive for a drawing that IS the
     workspace". It was right, and it was not the first: the same shape is
     hand-written all over the tree.

     THE SHAPE, COUNTED (the project's rule is three or more tools, named):

       screen -> tool coordinates (getBoundingClientRect, clientX - r.left)
         trussframe (toPx), roomacoustics (screenToWorld, 8 uses),
         debrisrunout (s2w), outdoornoise, cfd, moleculeconstructor,
         nuclideatlas, stress_transformation — 8 tools.  CLEARS.

       nearest-object hit test with a tap radius
         trussframe hitNode 18/24 px + hitMember 11/16 px,
         roomacoustics nearestObject 14 px + nearestVertex 12 px,
         debrisrunout pickAt 8/view.scale, outdoornoise pick3 per-shape,
         diagram-scene3d CanvasViewport.pick 16 px — 5 tools, SIX radii.
         CLEARS, and is the exact defect trussframe predicted: "each will
         pick a different tap radius".

       drag with pointer capture
         trussframe, debrisrunout, roomacoustics, outdoornoise, cfd,
         CanvasViewport — 6.  CLEARS.

       a keyboard equivalent for the same edits
         luchtbalans (arrows nudge by GRID, Shift x4; Enter/Space select;
         Delete removes and moves the selection to the neighbour; Escape
         cancels), trussframe (arrows nudge by the snap step, no Shift, no
         keyboard select, no keyboard delete), debrisrunout (arrows nudge by
         0.2, Shift = 1) — 3 tools, THREE schemes, two of them incomplete.
         CLEARS, and is the other half of trussframe's prediction.

       snap to a step
         trussframe snapv, roomacoustics snap, debrisrunout snap,
         luchtbalans snap — 4.  CLEARS.

       a cheap redraw during the gesture that does not re-run the model
         all six drag tools do it; every one spells it differently.  CLEARS.

       a per-object inspector bound to the selection
         roomacoustics / outdoornoise / debrisrunout (AuthoringShell
         `properties.schema`), trussframe (hand-built detail panel) — 4.
         CLEARS.

     WHAT DOES NOT CLEAR THE BAR, and is therefore NOT built here:
       - rectangle and polygon hit shapes: debrisrunout (AABB) and
         outdoornoise (poly) — 2 tools.  `hit:` is the escape hatch.
       - marquee / multi-selection: diagram-scene3d offers it and ZERO of the
         five scene tools use it (all three pass a single primary id).
       - transform gizmos: roomacoustics only — 1 tool.
       - voxel / bbox picking: cfd only — 1 tool.
       - an orbit camera and a 3D renderer: 4 tools, but diagram-scene3d.js
         already IS that code.  §18.3 hosts it; it does not reimplement it.
     ====================================================================== */

  /* ONE tap radius for the whole site, in CSS pixels, density-aware.
     `coarse` (below 768 px) gives a point a 44 px catch DIAMETER, which is
     the §16 floor for a touch target — the drawn dot stays 5-6 px, only what
     catches the finger grows. A segment catches along its whole length, so a
     radius as large as a point's would swallow the joints at its ends; the
     ratio here is trussframe's measured 11/18, rounded to the same pair. */
  var TAP = { point: { fine: 14, coarse: 22 }, line: { fine: 10, coarse: 16 } };
  function tapRadius(kind, density) {
    var row = (kind === 'segment' || kind === 'line') ? TAP.line : TAP.point;
    return density === 'coarse' ? row.coarse : row.fine;
  }

  /* a nudge must not leave 3.0000000000000004 in the permalink */
  function scRound(v) { return Math.round(Number(v) * 1e6) / 1e6; }

  function segDist(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    var t = L2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var dx = ax + t * vx - px, dy = ay + t * vy - py;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ---------------------------------------------------------- §18.2(1) the map — the transform is the framework's
     The transform is the FRAMEWORK'S, because the framework already owns the
     stage's size and its device-pixel ratio; a tool that owns half of a
     transform owns a bug. World +y is up on screen unless yUp:false, which is
     what every 2D tool in the tree draws (trussframe, roomacoustics plan,
     debrisrunout section) and is the opposite of the canvas default — the
     single most repeated sign error in the ports. */
  function SceneMap(size, win, opt) {
    opt = opt || {};
    var pad = opt.pad == null ? 14 : opt.pad;
    var yUp = opt.yUp !== false;
    var w = Math.max(1, size.w - 2 * pad), h = Math.max(1, size.h - 2 * pad);
    var ww = Math.max(1e-9, win.x1 - win.x0), wh = Math.max(1e-9, win.y1 - win.y0);
    var s = Math.min(w / ww, h / wh) * (opt.zoom > 0 ? opt.zoom : 1);
    var cx = (win.x0 + win.x1) / 2 + (opt.panX || 0);
    var cy = (win.y0 + win.y1) / 2 + (opt.panY || 0);
    var ox = size.w / 2 - cx * s;
    var oy = yUp ? size.h / 2 + cy * s : size.h / 2 - cy * s;
    this.scale = s; this.yUp = yUp; this.win = win;
    this.X = function (x) { return ox + Number(x || 0) * s; };
    this.Y = function (y) { return yUp ? oy - Number(y || 0) * s : oy + Number(y || 0) * s; };
    this.wx = function (px) { return (px - ox) / s; };
    this.wy = function (py) { return yUp ? (oy - py) / s : (py - oy) / s; };
  }
  SceneMap.prototype.toWorld = function (p) { return { x: this.wx(p.x), y: this.wy(p.y) }; };
  SceneMap.prototype.toScreen = function (p) { return { x: this.X(p.x), y: this.Y(p.y) }; };

  /* ------------------------------------------------- the interaction object */
  function Interaction(stage, def) {
    this.stage = stage;
    this.app = stage.app;
    this.def = def || {};
    this.map = null;
    this.sel = null;          /* the selected object's id, or null */
    this.drag = null;
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.unbind = [];
    this.fields = [];
    this.attach(stage.body);
    if (this.def.inspect) this.buildInspector();
  }

  Interaction.prototype.density = function () {
    return (this.stage.size && this.stage.size.density) || 'fine';
  };

  /* The declared object model, normalised. A point is {id,x,y}; a segment is
     {id,a:{x,y},b:{x,y}}. `ref` is the tool's own object — what the inspector
     edits and what every callback is handed. */
  Interaction.prototype.objects = function () {
    var raw = this.def.objects;
    var list = isFn(raw) ? call(raw, [this.app.state, this], 'interact.objects') : raw;
    if (!list || !list.length) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || o.id == null) continue;
      out.push(o);
    }
    return out;
  };

  Interaction.prototype.find = function (id) {
    if (id == null) return null;
    var objs = this.objects();
    for (var i = 0; i < objs.length; i++) if (String(objs[i].id) === String(id)) return objs[i];
    return null;
  };

  /* the tool's own object behind the descriptor */
  Interaction.prototype.model = function () {
    var o = this.find(this.sel);
    return o ? (o.ref || o) : null;
  };
  Interaction.prototype.selection = function () { return this.find(this.sel); };

  Interaction.prototype.snapStep = function () {
    var s = this.def.snap;
    var v = isFn(s) ? call(s, [this.app.state, this], 'interact.snap') : s;
    v = Number(v);
    return v > 0 ? v : 0;
  };
  Interaction.prototype.snap = function (v) {
    var g = this.snapStep();
    if (!g) return v;
    return Math.round(v / g) * g;
  };

  /* Rebuilt on every stage measure, so pan, zoom, a resize and a change in the
     model all reach the same code path exactly once per frame. */
  Interaction.prototype.remeasure = function (size) {
    var w = this.def.world;
    var win = isFn(w) ? call(w, [this.app.state, this], 'interact.world') : w;
    if (!win) win = this.bbox();
    if (!win) win = { x0: -1, y0: -1, x1: 1, y1: 1 };
    if (win.x1 - win.x0 < 1e-9) { win = { x0: win.x0 - 0.5, x1: win.x0 + 0.5, y0: win.y0, y1: win.y1 }; }
    if (win.y1 - win.y0 < 1e-9) { win = { x0: win.x0, x1: win.x1, y0: win.y0 - 0.5, y1: win.y0 + 0.5 }; }
    this.map = new SceneMap(size, win, {
      pad: this.def.pad, yUp: this.def.yUp,
      zoom: this.zoom, panX: this.panX, panY: this.panY
    });
    return this.map;
  };

  Interaction.prototype.bbox = function () {
    var objs = this.objects();
    if (!objs.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function add(x, y) {
      x = Number(x) || 0; y = Number(y) || 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.a && o.b) { add(o.a.x, o.a.y); add(o.b.x, o.b.y); }
      else add(o.x, o.y);
    }
    if (!isFinite(x0)) return null;
    var mx = Math.max((x1 - x0) * 0.12, 0.5), my = Math.max((y1 - y0) * 0.12, 0.5);
    return { x0: x0 - mx, y0: y0 - my, x1: x1 + mx, y1: y1 + my };
  };

  /* ------------------------------------------------------ §18.2(2) hit testing — ONE tap radius
     Points beat segments, unconditionally. Every tool in the tree already
     does this by hand (trussframe: `hn < 0 ? hitMember(...) : -1`;
     roomacoustics: object, then panel; debrisrunout: terrain point, then
     objects) because a joint sitting ON a member is otherwise unreachable. */
  Interaction.prototype.hitAt = function (px, py) {
    if (isFn(this.def.hit)) {
      return call(this.def.hit, [{ x: px, y: py }, this.map, this], 'interact.hit') || null;
    }
    var m = this.map;
    if (!m) return null;
    var dens = this.density(), objs = this.objects(), i, o, r, d;
    var best = null, bd = Infinity;
    for (i = 0; i < objs.length; i++) {
      o = objs[i];
      if (o.a && o.b) continue;
      r = o.tap > 0 ? o.tap : tapRadius('point', dens);
      var dx = m.X(o.x) - px, dy = m.Y(o.y) - py;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bd) { bd = d; best = o; }
    }
    if (best) return best;
    for (i = 0; i < objs.length; i++) {
      o = objs[i];
      if (!(o.a && o.b)) continue;
      r = o.tap > 0 ? o.tap : tapRadius('line', dens);
      d = segDist(px, py, m.X(o.a.x), m.Y(o.a.y), m.X(o.b.x), m.Y(o.b.y));
      if (d <= r && d < bd) { bd = d; best = o; }
    }
    return best;
  };

  /* ------------------------------------------------------ §18.2(3) the gesture */
  Interaction.prototype.local = function (e) {
    var r = this.node.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* the cheap redraw: the stage repaints, the model does not re-run */
  Interaction.prototype.redraw = function () { this.stage.schedule(); return this; };

  Interaction.prototype.select = function (id, ev) {
    var was = this.sel;
    this.sel = id == null ? null : String(id);
    if (was === this.sel) return this;
    call(this.def.on && this.def.on.select, [this.selection(), this, ev], 'interact.select');
    this.refreshInspector();
    this.redraw();
    return this;
  };

  Interaction.prototype.canMove = function (o) {
    if (!o || !(this.def.on && isFn(this.def.on.move))) return false;
    return o.movable !== false;
  };

  Interaction.prototype.attach = function (node) {
    var self = this, d = this.def;
    this.node = node;
    node.tabIndex = 0;
    node.style.touchAction = 'none';
    node.style.outlineOffset = '2px';
    if (!node.getAttribute('aria-label')) {
      node.setAttribute('aria-label', asLabel(d.label)
        ? pick(asLabel(d.label), this.app.lang) : this.app.t('scene_help'));
    }
    if (d.cursor !== false) node.style.cursor = d.cursor || 'crosshair';

    this.unbind.push(on(node, 'pointerdown', function (e) { self.onDown(e); }));
    this.unbind.push(on(node, 'pointermove', function (e) { self.onMove(e); }));
    this.unbind.push(on(node, 'pointerup', function (e) { self.onUp(e); }));
    this.unbind.push(on(node, 'pointercancel', function (e) { self.onUp(e); }));
    this.unbind.push(on(node, 'keydown', function (e) { self.onKey(e); }));
    if (isFn(d.on && d.on.context)) {
      this.unbind.push(on(node, 'contextmenu', function (e) {
        var p = self.local(e), h = self.hitAt(p.x, p.y);
        if (!h) return;
        e.preventDefault();
        self.select(h.id, e);
        call(d.on.context, [h, e, self], 'interact.context');
      }));
    }
    return this;
  };

  Interaction.prototype.onDown = function (e) {
    if (e.button != null && e.button !== 0) return;
    var p = this.local(e);
    try { this.node.focus({ preventScroll: true }); } catch (err) { try { this.node.focus(); } catch (e2) {} }
    var hit = this.hitAt(p.x, p.y);
    if (!hit) {
      this.select(null, e);
      if (this.map) call(this.def.on && this.def.on.tap, [this.map.toWorld(p), e, this], 'interact.tap');
      return;
    }
    this.select(hit.id, e);
    if (!this.canMove(hit) || !this.map) return;
    e.preventDefault();
    /* the grab offset keeps the object from jumping to the pointer — the one
       thing trussframe's hand-rolled drag got wrong and CanvasViewport got
       right; the framework should not ship the bug twice */
    var w = this.map.toWorld(p);
    var anchor = hit.a && hit.b
      ? { x: (Number(hit.a.x) + Number(hit.b.x)) / 2, y: (Number(hit.a.y) + Number(hit.b.y)) / 2 }
      : { x: Number(hit.x) || 0, y: Number(hit.y) || 0 };
    this.app.pushHistory();
    this.drag = { id: hit.id, dx: anchor.x - w.x, dy: anchor.y - w.y, moved: false };
    try { this.node.setPointerCapture(e.pointerId); } catch (err) {}
    this.redraw();
  };

  Interaction.prototype.onMove = function (e) {
    if (!this.drag || !this.map) return;
    e.preventDefault();
    var p = this.local(e), w = this.map.toWorld(p);
    this.drag.moved = true;
    this.applyMove(this.snap(w.x + this.drag.dx), this.snap(w.y + this.drag.dy), e);
  };

  Interaction.prototype.applyMove = function (x, y, e) {
    var o = this.find(this.drag ? this.drag.id : this.sel);
    if (!o) return;
    call(this.def.on.move, [o, { x: x, y: y }, e, this], 'interact.move');
    this.redraw();          /* cheap: render only, no on.compute */
  };

  Interaction.prototype.onUp = function (e) {
    if (!this.drag) return;
    var d = this.drag;
    this.drag = null;
    try { this.node.releasePointerCapture(e.pointerId); } catch (err) {}
    this.commit(this.find(d.id), d.moved, e);
  };

  /* the expensive half of the gesture, run once */
  Interaction.prototype.commit = function (obj, moved, e) {
    if (moved) call(this.def.on && this.def.on.commit, [obj, e, this], 'interact.commit');
    this.refreshInspector();
    this.redraw();
  };

  /* -------------------------------------------------- §18.4 ONE keyboard scheme
     Tab           focus the drawing
     Enter/Space   select the next object (Shift: the previous one)
     Arrows        move the selection by one snap step (Shift: four)
     Delete/Backsp remove the selection, then select its neighbour
     Escape        cancel the gesture and clear the selection
     Taken from luchtbalans, which is the only tool in the tree whose keyboard
     path is complete — including the detail that a delete must land the
     selection on the neighbour rather than nowhere. trussframe could nudge
     but could not select or delete without a mouse; debrisrunout could nudge
     with a different step. There is now one scheme and tools stop choosing. */
  Interaction.prototype.step = function (shift) {
    var g = this.snapStep();
    if (!g && this.map) g = 8 / this.map.scale;   /* eight screen px */
    if (!g) g = 1;
    return shift ? g * 4 : g;
  };

  Interaction.prototype.cycle = function (back) {
    var objs = this.objects();
    if (!objs.length) return;
    var at = -1;
    for (var i = 0; i < objs.length; i++) if (String(objs[i].id) === this.sel) { at = i; break; }
    var next = at < 0 ? (back ? objs.length - 1 : 0)
      : (at + (back ? -1 : 1) + objs.length) % objs.length;
    this.select(objs[next].id);
  };

  Interaction.prototype.neighbour = function (id) {
    var objs = this.objects();
    for (var i = 0; i < objs.length; i++) {
      if (String(objs[i].id) === String(id)) {
        var n = objs[i + 1] || objs[i - 1];
        return n ? n.id : null;
      }
    }
    return null;
  };

  Interaction.prototype.onKey = function (e) {
    var k = e.key, d = this.def.on || {};
    if (k === 'Escape') {
      if (this.drag) { this.drag = null; }
      e.preventDefault();
      call(d.cancel, [this], 'interact.cancel');
      this.select(null, e);
      return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      this.cycle(e.shiftKey);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') {
      var sel = this.selection();
      if (!sel || !isFn(d.remove)) return;
      e.preventDefault();
      var next = this.neighbour(sel.id);
      this.app.pushHistory();
      call(d.remove, [sel, this], 'interact.remove');
      this.sel = next == null ? null : String(next);
      call(d.select, [this.selection(), this, e], 'interact.select');
      this.refreshInspector();
      call(d.commit, [null, e, this], 'interact.commit');
      this.redraw();
      return;
    }
    var dx = 0, dy = 0, s = this.step(e.shiftKey);
    if (k === 'ArrowLeft') dx = -s;
    else if (k === 'ArrowRight') dx = s;
    else if (k === 'ArrowUp') dy = (this.def.yUp === false) ? -s : s;
    else if (k === 'ArrowDown') dy = (this.def.yUp === false) ? s : -s;
    else return;
    var o = this.selection();
    if (!o) { e.preventDefault(); this.cycle(false); return; }
    if (!this.canMove(o)) return;
    e.preventDefault();
    var anchor = o.a && o.b
      ? { x: (Number(o.a.x) + Number(o.b.x)) / 2, y: (Number(o.a.y) + Number(o.b.y)) / 2 }
      : { x: Number(o.x) || 0, y: Number(o.y) || 0 };
    this.app.pushHistory();
    this.drag = { id: o.id, dx: 0, dy: 0, moved: true };
    this.applyMove(scRound(anchor.x + dx), scRound(anchor.y + dy), e);
    this.drag = null;
    this.commit(this.find(o.id), true, e);
  };

  /* --------------------------------------------- §18.2(5) the bound inspector
     `inspect:` turns the selection into a panel of ordinary Fields, so a
     per-object inspector is DECLARED. The fields' keys are paths into the
     tool's own object (`ref`), not into app.state, and the framework supplies
     get/set — which is the only reason the four tools that built one by hand
     had to build one by hand. It is a real Panel in app.panels, so ui.sync()
     reaches it exactly like every other panel; it is deliberately NOT
     journalled, because it belongs to the stage declaration that made it and
     build() replays that. */
  Interaction.prototype.buildInspector = function () {
    var d = this.def.inspect, app = this.app;
    var slot = d.slot || (app.opts.layout === 'studio' ? 'detail' : 'inputs');
    var host = app.useRegion(slot) || app.useRegion('inputs');
    if (!host) return;
    var self = this;
    var panel = new Panel(app, {
      id: d.id || uid('dgu-inspect'),
      slot: slot,
      title: d.title || { en: 'Selection', uk: 'Вибране', de: 'Auswahl', nl: 'Selectie', fr: 'Sélection', es: 'Selección' ,pl:"Wybór"},
      learn: d.learn,
      /* a render hook is what keeps Panel.checkEmpty from hiding an inspector
         that is legitimately empty because nothing is selected */
      render: function () {}
    });
    host.appendChild(panel.node);
    app.panels.push(panel);
    this.inspector = panel;
    this.emptyNode = el('p', { class: 'dgu-hint' });
    panel.node.appendChild(this.emptyNode);
    this.refreshInspector();
  };

  Interaction.prototype.inspectFields = function (obj) {
    var d = this.def.inspect;
    if (!d) return [];
    var f = d.fields;
    var list = isFn(f) ? call(f, [obj, this], 'interact.inspect.fields') : f;
    return list && list.length ? list : [];
  };

  Interaction.prototype.refreshInspector = function () {
    var panel = this.inspector;
    if (!panel) return;
    var self = this, app = this.app, obj = this.selection();
    clear(panel.body);
    panel.fields = [];
    var defs = obj ? this.inspectFields(obj) : [];
    this.emptyNode.hidden = !!defs.length;
    if (!defs.length) {
      this.emptyNode.textContent = pick(asLabel(this.def.inspect.empty) || UI_STRINGS.scene_none, app.lang);
      return;
    }
    defs.forEach(function (raw) {
      var fd = {}, k;
      for (k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) fd[k] = raw[k];
      var path = raw.key;
      fd.id = uid('dgu-if');
      if (!isFn(raw.get)) {
        fd.get = function () { var m = self.model(); return m ? pathGet(m, path) : null; };
      }
      if (!isFn(raw.set)) {
        fd.set = function (v) {
          var m = self.model();
          if (!m) return;
          pathSet(m, path, v);
          call(self.def.inspect.change, [self.selection(), path, v, self], 'interact.inspect.change');
          self.redraw();
        };
      }
      var fld = new Field(app, fd, panel.body);
      fld.panel = panel;
      panel.fields.push(fld);
    });
    panel.sync();
  };

  Interaction.prototype.destroy = function () {
    this.unbind.forEach(function (u) { try { u(); } catch (e) {} });
    this.unbind = [];
  };

  /* --------------------------------------------- §18.3 the 3D stage, HOSTED
     THE ARCHETYPE QUESTION, answered by the code and not by the label.

     /root/SCENE3D_SURVEY.md counts five tools hand-rolling a scene tree, a
     resize, a render, an inspector and a grid, and asks whether that is a
     fifth archetype. Read what the three AuthoringShell tools actually ask
     for and the answer is no. Every one of roomacoustics, outdoornoise and
     debrisrunout passes the same six hosts:

         paletteHost + searchHost + treeHost   -> the studio's `inputs`
         toolbarHost + placementBadge + canvas -> the studio's `stage`
         propertiesHost                        -> the studio's `detail`

     That is the `studio` grid, exactly, with nothing left over and nothing
     missing. A scene editor is a studio whose stage happens to be a 3D
     projection; it needs no new regions, no new layout and no new archetype
     — it needs the framework to KNOW about the renderer that four tools
     already share. So: no fifth archetype. `layout:'studio'`, `scene:` on
     the stage.

     And the renderer is not rewritten here. diagram-scene3d.js is 58 kB of
     working, shipped projection, picking, orbit camera, placement ghost,
     scene tree, property inspector and toolbar. §18.3 creates the six hosts
     in the right regions, hands them to AuthoringShell, points CanvasViewport
     at the stage's own canvas, and wires invalidate() to the stage's
     rAF-coalesced schedule() so the 3D view repaints on resize and on a theme
     change like every other stage. Zero lines of geometry are copied. */
  function sceneLib() { return global.DiagramScene3D || null; }

  function SceneStage(stage, def) {
    this.stage = stage;
    this.app = stage.app;
    this.def = def || {};
    this.hosts = {};
    this.shell = null;
    this.viewport = null;
  }

  SceneStage.prototype.build = function () {
    var Lib = sceneLib(), app = this.app, stage = this.stage, d = this.def;
    if (!Lib || Lib.api !== 'tools.petrov.re/scene-editor/v1') {
      warn('stage.scene(): diagram-scene3d.js v1 is not loaded — the scene stage degrades to the tool\'s own render');
      app.notice({ tone: 'bad', text: UI_STRINGS.scene_lib, slot: 'stage' });
      return null;
    }
    if (isFn(Lib.ensureAuthoringStyles)) call(Lib.ensureAuthoringStyles, [], 'scene.styles');

    /* left column: palette, search, tree */
    var side = new Panel(app, {
      id: d.sideId || uid('dgu-scene-side'),
      title: d.sideTitle || UI_STRINGS.inputs,
      render: function () {}
    });
    var inputs = app.useRegion('inputs');
    if (inputs) inputs.appendChild(side.node);
    app.panels.push(side);
    this.hosts.paletteHost = el('div', { class: 'dgu-scene-palette' });
    this.hosts.searchHost = el('div', { class: 'dgu-scene-search' });
    this.hosts.treeHost = el('div', { class: 'dgu-scene-tree' });
    side.body.appendChild(this.hosts.paletteHost);
    side.body.appendChild(this.hosts.searchHost);
    side.body.appendChild(this.hosts.treeHost);
    this.side = side;

    /* right column: the property inspector */
    var slot = app.opts.layout === 'studio' ? 'detail' : 'inputs';
    var props = new Panel(app, {
      id: d.inspectId || uid('dgu-scene-props'),
      title: d.inspectTitle || UI_STRINGS.scene_sel,
      render: function () {}
    });
    var col = app.useRegion(slot) || app.useRegion('inputs');
    if (col) col.appendChild(props.node);
    app.panels.push(props);
    this.hosts.propertiesHost = el('div', { class: 'dgu-scene-props' });
    props.body.appendChild(this.hosts.propertiesHost);
    this.props = props;

    /* the stage itself: the mode toolbar, the placement badge, the canvas */
    this.hosts.toolbarHost = el('div', { class: 'dgu-scene-toolbar' });
    stage.tools.appendChild(this.hosts.toolbarHost);
    this.hosts.placementBadge = el('div', { class: 'dgu-scene-badge' });
    stage.node.appendChild(this.hosts.placementBadge);

    var cv = stage.cv;
    if (!cv) { cv = el('canvas', {}); stage.cv = cv; stage.body.appendChild(cv); }
    cv.style.touchAction = 'none';
    this.canvas = cv;

    var shellDef = {}, k;
    for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) shellDef[k] = d[k];
    delete shellDef.viewport;
    delete shellDef.sideTitle; delete shellDef.inspectTitle;
    delete shellDef.sideId; delete shellDef.inspectId;
    for (k in this.hosts) shellDef[k] = this.hosts[k];
    try { this.shell = new Lib.AuthoringShell(shellDef); }
    catch (e) { warn('stage.scene(): AuthoringShell failed:', e); this.shell = null; }

    if (d.viewport) {
      var vp = {}, vk;
      for (vk in d.viewport) if (Object.prototype.hasOwnProperty.call(d.viewport, vk)) vp[vk] = d.viewport[vk];
      var adapter = {}, ak;
      for (ak in (vp.adapter || {})) if (Object.prototype.hasOwnProperty.call(vp.adapter, ak)) adapter[ak] = vp.adapter[ak];
      delete vp.adapter;
      /* The scene tree, the inspector and the toolbar must follow a pick and a
         drag, and today every tool writes that line itself — roomacoustics
         `refreshAuthorDrag()`, debrisrunout `renderShared3D()`, outdoornoise
         `refreshAll()`. The framework does it here instead, and it does it at
         the GESTURE BOUNDARY, not per frame: CanvasViewport calls onSelect once
         on the pick and onCommit once at pointerup, while its per-move repaint
         goes through invalidate(). Refreshing the shell on every pointermove
         would re-render the whole tree sixty times a second, which is the very
         thing §18.2(4)'s cheap-redraw rule exists to prevent. */
      var host = this;
      var userSelect = adapter.onSelect, userCommit = adapter.onCommit;
      adapter.onSelect = function (id, additive, e) {
        if (isFn(userSelect)) userSelect(id, additive, e);
        host.refresh('pick');
      };
      adapter.onCommit = function (d, e) {
        if (isFn(userCommit)) userCommit(d, e);
        host.refresh('commit');
      };
      /* the one wire that makes the shared renderer a citizen of the shell:
         its invalidate() becomes the stage's rAF-coalesced repaint, so it also
         repaints on resize (Stage's ResizeObserver) and on a theme change
         (Stage's theme.watch) without the tool subscribing to either */
      var prev = vp.onInvalidate;
      vp.onInvalidate = function () { if (isFn(prev)) prev(); host.stage.schedule(); };
      if (this.shell && !vp.placement) vp.placement = this.shell.placement;
      try { this.viewport = new Lib.CanvasViewport(cv, adapter, vp); }
      catch (e2) { warn('stage.scene(): CanvasViewport failed:', e2); this.viewport = null; }
    }
    return this;
  };

  SceneStage.prototype.draw = function () {
    if (this.viewport) { try { this.viewport.draw(); } catch (e) { warn('scene.draw failed:', e); } }
    return this;
  };
  SceneStage.prototype.refresh = function (reason) {
    if (this.shell && isFn(this.shell.refresh)) { try { this.shell.refresh(reason || 'refresh'); } catch (e) {} }
    return this;
  };
  SceneStage.prototype.destroy = function () {
    if (this.viewport && isFn(this.viewport.destroy)) { try { this.viewport.destroy(); } catch (e) {} }
    if (this.shell && isFn(this.shell.destroy)) { try { this.shell.destroy(); } catch (e) {} }
  };

  /* ------------------------------------------------ the two entry points */
  Stage.prototype.interact = function (def) {
    if (this.interaction) this.interaction.destroy();
    this.interaction = new Interaction(this, def || {});
    this.interaction.remeasure(this.measure());
    this.schedule();
    return this.interaction;
  };

  Stage.prototype.scene = function (def) {
    if (this.sceneStage) this.sceneStage.destroy();
    var s = new SceneStage(this, def || {});
    this.sceneStage = s.build() ? s : null;
    if (this.sceneStage) this.schedule();
    return this.sceneStage;
  };


  /* §18 the scene primitive. Six declarations, all of them furniture the
     three AuthoringShell tools style by hand today; no colour literal, every
     value a token. The badge is a stage-local strip, not page chrome, so it
     sits inside .dgu-stage and clears the §4.4 safe area by construction. */
  var SCENE_CSS = [
    '.dgu-scene-palette{display:flex;flex-wrap:wrap;gap:var(--sp-1)}',
    '.dgu-scene-search{margin-top:var(--sp-2)}',
    '.dgu-scene-tree{margin-top:var(--sp-2);min-width:0}',
    '.dgu-scene-props{min-width:0}',
    '.dgu-scene-toolbar{display:flex;gap:var(--sp-1);flex-wrap:wrap;justify-content:flex-end}',
    /* the placement badge is diagram-scene3d.js's own component and carries
       its own class and its own display rule; the framework only guarantees it
       a positioned ancestor, which .dgu-stage already is. Styling it here would
       be the framework reimplementing the library it is hosting. */
    /* the drawing is a focus stop: it must show it, like every other one */
    '.dgu-stage-body:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
  ];

  var DiagramUI = {
    api: API,
    version: VERSION,
    langs: SITE_LANGS.slice(),
    langNames: Object.assign({}, LANG_NATIVE),
    mixed: mixed,
    /* delegates to Diagram.site whenever diagram-common.js is loaded */
    site: { base: siteBase, name: siteName, isLocal: siteIsLocal, sourceRef: siteSourceRef, fixTitle: siteFixTitle },

    app: app,
    get current() { return App.current || null; },
    whenReady: function () { return readyPromise; },

    /* §21 ONE PATH TO PAPER, for a page that is not on DiagramUI.app().
       protectioncoordination.html and generatorgrid.html are the two tools in
       the tree that load this file without calling app(); both still load
       diagram-common.js, so both still have Diagram.report(). This is how they
       reach it without hand-rolling a third print path. */
    print: function (opts) {
      if (App.current) return App.current.print(opts);
      installPrint(null);
      if (printNow(opts)) return true;
      try { global.print(); } catch (e) { warn(e); }
      return false;
    },
    canPrintReport: function () { return !!printRecord(); },
    /* install the fallback print sheet on a page with no App — the running
       header, the footer and the page-number rule, nothing else */
    printStyles: function () { installPrint(null); },

    theme: theme,
    /* the chart-series scale and a legend bound to it */
    series: series,
    legend: function (def) { return legend(def, (App.current && App.current.lang) || currentLang()); },
    lang: currentLang,
    siteLang: siteLang,
    domainLang: function () { return domainLang(readManifest(), siteLang()); },
    t: function (key, lang) { return pick(UI_STRINGS[key] || key, lang || currentLang()); },
    pick: pick,
    fmt: fmt,
    /* AGENTS §0.1, §2.2.1 -- the one number formatter. Everything a person reads
       goes through num.format() or num.sep(); everything a script reads back
       goes through num.machine() (AGENTS §2.3). num.sep() is the one-line
       migration for a tool that already chose its own digits: it re-separates
       and never re-rounds. */
    num: {
      locale: function (lang) {
        var l = lang ? numLocale(lang) : numLocaleCurrent();
        return { lang: l.lang, dec: l.dec, grp: l.grp, grpLocale: l.grpLocale,
                 min: l.min, list: l.list, source: l.source };
      },
      format: numFormat,
      sep: numSep,
      machine: numMachine,
      list: numList,
      parse: numParse,
      languages: function () { return Object.keys(NUM_MAP); },
      /* drop the held map -- for a test that switches language without a reload */
      reset: function () { NUM_RESOLVED = {}; NUM_CUR = { key: null, loc: null }; }
    },
    /* kept: the separators fmt() uses, {dec, grp, min}. Superseded by num.locale(). */
    numLocale: function (lang) {
      var l = lang ? numLocale(lang) : numLocaleCurrent();
      return { dec: l.dec, grp: l.grp, min: l.min };
    },
    esc: esc,

    units: {
      system: unitSystem,
      set: function (s) { store('diagram_units', s); return unitSystem(); },
      table: UNIT_TABLE,
      /* CLOSE-THE-LOOP 7. A tool may register a unit. Two of four new tools were
         stopped by the nine hard-coded bases.
         flangejoint.html: "An inch. More generally, a way to register a unit …
         a `display:` outside the table relabels without converting … Shipping
         display:'in' unregistered would have printed inches while showing
         millimetres."  It resorted to pushing onto `DiagramUI.units.table.m`
         directly and marked it UPSTREAM.  trussframe.html: "`UNIT_TABLE` is nine
         hard-coded SI bases. `N` is not one, `display:'kN'` would relabel
         without converting … and there is no registration hook."
         Registration is page-local and additive: nothing changes for a tool that
         does not call it, and a base the site does not know stays absent from
         every other page.
           DiagramUI.units.register('m', {u:'in', f:1/0.0254}, {us:'in'});
           DiagramUI.units.register('N', [{u:'N',f:1},{u:'kN',f:1e-3}], {practical:'kN'});
         `f` converts SI -> display, exactly as the built-in table does; `pref`
         maps a unit system to the alternative the header control should pick. */
      register: function (si, alts, pref) {
        if (!si) return null;
        var row = UNIT_TABLE[si] || (UNIT_TABLE[si] = [{ u: si, f: 1 }]);
        var list = alts == null ? [] : (Array.isArray(alts) ? alts : [alts]);
        list.forEach(function (a) {
          if (!a || !a.u) return;
          for (var i = 0; i < row.length; i++) if (row[i].u === a.u) { row[i] = a; return; }
          row.push(a);
        });
        if (pref) for (var k in pref) if (SYSTEM_PREF[k] && pref[k]) SYSTEM_PREF[k][si] = pref[k];
        return row.slice();
      },
      convert: function (v, si, target) { return toDisplay(v, unitEntry(si, target)); },
      toSI: function (v, si, source) { return fromDisplay(v, unitEntry(si, source)); },
      label: function (si, target) { return unitLabel(unitEntry(si, target), si); }
    },

    safeArea: function () {
      return { bottom: safeState.bottom, left: safeState.left, right: safeState.right };
    },
    measure: measureChrome,

    dialog: function (def) { return dialog(App.current || { lang: currentLang(), t: function (k) { return DiagramUI.t(k); } }, def); },
    popover: popover,
    closePopover: closePopover,

    /* one namespace for everything a tool remembers about its own layout */
    persist: {
      ns: NS,
      key: function (facet, name, app) { return nsKey(facet, name, app); },
      get: function (facet, name, app) { return nsGet(facet, name, app); },
      set: function (facet, name, value, app) { nsSet(facet, name, value, app); return value; },
      clear: function (facet, name, app) { nsSet(facet, name, null, app); },
      toolId: function (app) { return toolIdOf(app); }
    },

    /* content components (see the CONTENT COMPONENTS section) */
    openFile: openFile,
    table: function (def) { return table(App.current || fallbackCtx(), def || {}); },
    meter: function (def) { return meter(App.current || fallbackCtx(), def || {}); },
    measureTables: measureTables,

    History: History,
    Transport: Transport,
    Stage: Stage,

    /* §18 the scene primitive. `scene.tap` is the site's ONE tap radius and
       `scene.keys` its ONE keyboard scheme, published so a tool that must
       hand-roll something can at least agree with everything else, and so the
       gate can assert on them rather than on six literals in six files.
       `scene.lib` reports whether diagram-scene3d.js is on the page. */
    Interaction: Interaction,
    SceneMap: SceneMap,
    scene: {
      tap: TAP,
      radius: tapRadius,
      keys: {
        select: ['Enter', ' '],
        selectBack: ['Shift+Enter'],
        move: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
        moveFast: 'Shift (x4)',
        remove: ['Delete', 'Backspace'],
        cancel: ['Escape']
      },
      lib: function () { return sceneLib(); },
      has3D: function () { var L = sceneLib(); return !!(L && L.api === 'tools.petrov.re/scene-editor/v1'); }
    },
    Panel: Panel,
    Notice: Notice,
    Splitter: Splitter,
    Field: Field,
    ticks: Stage.ticks,

    el: el,
    on: on,
    pathGet: pathGet,
    pathSet: pathSet,
    commonFieldValue: commonFieldValue,
    debounce: debounce,
    clamp: clamp,

    /* development aid: report the QA gates this file can check by itself */
    check: (function () {
      /* a control that is merely scrolled out of an independently scrolling
         region is not occluded by the chrome: it is one pane-scroll away, and
         the pane's own bottom edge is held clear of the chrome by the L3 rule */
      /* v3.6.1 — what the READER can see of a control, not what the box model
         says it is. `getBoundingClientRect()` reports a control's full box even
         where a scroll pane is clipping most of it, and the old form of this
         helper only excused a control clipped away ENTIRELY. With panes on by
         default that is not the common case: debrisrunout's preset button
         measures 681→798 inside a pane whose box ends at 740, so 58 px of it is
         visible and 58 px is clipped — and the visible part ends 16 px ABOVE
         the reserved strip, while the phantom bottom edge at 798 lands inside
         it. The check reported a control buried under the chrome that a reader
         can see and click perfectly well. Intersect first, then judge. Returns
         null when nothing of the control is on screen. */
      function shownRect(node, r) {
        var top = r.top, bottom = r.bottom;
        var n = node.parentElement;
        while (n && n !== doc.body) {
          if (n.hasAttribute && n.hasAttribute('data-dgu-scroll')) {
            var pr = n.getBoundingClientRect();
            if (pr.top > top) top = pr.top;
            if (pr.bottom < bottom) bottom = pr.bottom;
          }
          n = n.parentElement;
        }
        return bottom - top > 1 ? { top: top, bottom: bottom } : null;
      }
      return function () {
      var out = { ok: true, problems: [] };
      function bad(m) { out.ok = false; out.problems.push(m); }
      var h1 = doc.querySelectorAll('h1');
      if (h1.length !== 1) bad('expected exactly one h1, found ' + h1.length);
      if (doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 2) {
        bad('horizontal overflow: ' + (doc.documentElement.scrollWidth - doc.documentElement.clientWidth) + 'px');
      }
      var bar = doc.getElementById('dgc-bar');
      if (!bar) bad('#dgc-bar missing — Diagram.init() may be gated on a data load');
      else if (!bar.children.length) bad('#dgc-bar is empty');
      var safe = safeState.bottom;
      var hits = [];
      /* Occlusion is only a real defect where the control cannot be scrolled
         clear of the chrome: evaluate at the bottom of the document. */
      var y0 = global.scrollY;
      global.scrollTo(0, doc.documentElement.scrollHeight);
      var focusables = doc.querySelectorAll('.dgu-app button,.dgu-app a,.dgu-app input,.dgu-app select,.dgu-app textarea');
      for (var i = 0; i < focusables.length; i++) {
        var r = focusables[i].getBoundingClientRect();
        if (!r.width || !r.height) continue;
        var sr = shownRect(focusables[i], r);
        if (sr && sr.bottom > global.innerHeight - safe && sr.top < global.innerHeight
            && !focusables[i].closest('.dgu-actionbar')) hits.push(focusables[i]);
      }
      global.scrollTo(0, y0);
      if (hits.length) bad(hits.length + ' control(s) unreachable under the shared chrome');
      var noName = [];
      for (var j = 0; j < focusables.length; j++) {
        var f = focusables[j];
        var txt = (f.innerText || f.value || '').trim();
        if (!txt && !f.getAttribute('aria-label') && !f.getAttribute('title')
          && !(f.id && doc.querySelector('label[for="' + f.id + '"]'))) noName.push(f);
      }
        if (noName.length) bad(noName.length + ' focusable control(s) without an accessible name');
        return out;
      };
    }())
  };

  /* Not frozen: `current` is a live getter and this object is the site's single
     UI namespace, mirroring how diagram-common.js publishes window.Diagram. */
  global.DiagramUI = DiagramUI;

  /* Token layer, focus styles and the safe-area repair apply to every page that
     loads this file, whether or not it ever calls app(). */
  function bootFile() {
    siteFixTitle();
    ensureStyle('dgu-tokens', TOKENS);
    ensureStyle('dgu-chrome-compat', CHROME_COMPAT);
    applyTheme();
    startSafeArea();
    if (mql && mql.addEventListener) mql.addEventListener('change', applyTheme);
  }
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bootFile);
    else bootFile();
  }
})(typeof window !== 'undefined' ? window : this);

/* ======================================================================
   SITE USAGE COUNTERS — tools.petrov.re/stats/v1
   ----------------------------------------------------------------------
   Appended to diagram-ui.js so that every page loading the UI framework is
   counted without a per-tool edit. What leaves the browser is a small JSON of
   counters: the view about a second after load, then what was counted since
   the previous beacon, five seconds after the last counted action and again
   when the page is hidden or left; each beacon carries only its increments:
     page file name, UI language, referrer class, viewport class (m/d),
     CPU core bucket, number of input edits, runs, resets, preset names as authored,
     download file extensions, print / report counts, presses of the shared
     bar's "Continue with" and "Attach" actions, run-time buckets,
     visible seconds, and at most five error messages with digits masked.
   Never sent: input or output values, cookies, identifiers, IP-derived data
   (the collector does not store the address it receives the request from).
   Disabled when: not https://tools.petrov.re, navigator.webdriver,
   Do-Not-Track or Global Privacy Control, or the per-browser opt-out set
   from the stats dashboard (localStorage "dgu_stats_optout" = "1").
   ?stats=qa forces sending even under webdriver and marks the hit as QA,
   which the collector keeps apart from the real counters.
   ====================================================================== */
(function (global) {
  'use strict';
  var doc = global.document, nav = global.navigator, loc = global.location;
  if (!doc || !nav || !loc || global.__dguStats) return;
  global.__dguStats = true;
  try {
    var HOST = 'tools.petrov.re', ENDPOINT = '/_stats/hit.php';
    var params = new URLSearchParams(loc.search);
    var qa = params.get('stats') === 'qa';
    if (loc.protocol !== 'https:' || loc.hostname !== HOST || !nav.sendBeacon) return;
    if (!qa) {
      if (nav.webdriver) return;
      if (nav.doNotTrack === '1' || global.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
      try { if (global.localStorage.getItem('dgu_stats_optout') === '1') return; } catch (e) { /* storage blocked: count */ }
    }
    var page = decodeURIComponent(loc.pathname.split('/').pop() || '') || 'index.html';
    if (!/^[A-Za-z0-9_.-]{1,80}\.html$/.test(page)) return;

    /* Where the visit came from, reduced to a class; never the full URL. */
    var src = (function () {
      var tag = (params.get('ref') || '').toLowerCase();
      if (/^[a-z0-9_-]{1,20}$/.test(tag)) return 't:' + tag;
      var ref = doc.referrer, h;
      if (!ref) return 'direct';
      try { h = new URL(ref).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return 'other'; }
      if (h === HOST) return 'internal';
      if (/(^|\.)linkedin\.com$/.test(h) || h === 'lnkd.in') return 'linkedin';
      if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
      if (/(^|\.)bing\.com$/.test(h)) return 'bing';
      if (/(^|\.)duckduckgo\.com$/.test(h)) return 'duckduckgo';
      if (/(^|\.)petrov\.re$/.test(h)) return 'petrov.re';
      return 'h:' + h.slice(0, 60);
    }());

    var cores = nav.hardwareConcurrency || 0;
    var S = null, sentView = false, engSent = false, gesture = false, timer = 0;
    function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = 0; flush(); }, 5000); }
    var visMs = 0, visFrom = doc.visibilityState === 'visible' ? Date.now() : 0;
    function fresh() {
      return { ed: 0, ru: 0, rs: 0, ce: 0, pr: 0, rp: 0, co: 0, at: 0, ex: {}, dl: {}, rt: {}, er: [] };
    }
    S = fresh();
    function bump(map, key, cap) {
      if (!key) return;
      schedule();
      if (!(key in map) && Object.keys(map).length >= (cap || 20)) return;
      map[key] = (map[key] || 0) + 1;
    }
    function rtBucket(ms) {
      var b = [10, 30, 100, 300, 1000, 3000, 10000, 30000];
      for (var i = 0; i < b.length; i++) if (ms < b[i]) return '<' + b[i];
      return '>=30000';
    }
    function clean(s, n) {
      return String(s == null ? '' : s).replace(/[0-9]+(?:[.,][0-9]+)?/g, '#')
        .replace(/[^\w .,:;@#()\[\]'"\/<>=+*-]/g, '').slice(0, n || 100);
    }

    function flush() {
      if (visFrom) { visMs += Date.now() - visFrom; visFrom = doc.visibilityState === 'visible' ? Date.now() : 0; }
      var busy = S.ed || S.ru || S.rs || S.ce || S.pr || S.rp || S.co || S.at || S.er.length ||
        Object.keys(S.ex).length || Object.keys(S.dl).length;
      if (sentView && !busy && visMs < 1000) return;
      var act = S.ed || S.ru || S.rs || S.pr || S.rp || S.co || S.at ||
        Object.keys(S.ex).length || Object.keys(S.dl).length;
      var body = {
        v: 1, p: page, view: sentView ? 0 : 1, qa: qa ? 1 : 0, eng: act && !engSent ? 1 : 0,
        l: String(doc.documentElement.lang || '').slice(0, 5),
        src: sentView ? '' : src,
        vw: global.innerWidth && global.innerWidth <= 768 ? 'm' : 'd',
        cpu: cores ? (cores <= 2 ? '1-2' : cores <= 4 ? '3-4' : cores <= 8 ? '5-8' : cores <= 16 ? '9-16' : '17+') : '',
        perm: !sentView && params.has('s') ? 1 : 0,
        hin: !sentView && params.has('in') ? 1 : 0,
        vis: Math.round(visMs / 1000),
        ed: S.ed, ru: S.ru, rs: S.rs, ce: S.ce, pr: S.pr, rp: S.rp, co: S.co, at: S.at,
        ex: S.ex, dl: S.dl, rt: S.rt, er: S.er
      };
      var json = JSON.stringify(body), ok = false;
      try { ok = nav.sendBeacon(ENDPOINT, new Blob([json], { type: 'text/plain' })); } catch (e) { ok = false; }
      if (!ok && global.fetch) {
        try { global.fetch(ENDPOINT, { method: 'POST', body: json, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); ok = true; } catch (e) {}
      }
      if (!ok) return;
      sentView = true; if (act) engSent = true; visMs = 0; S = fresh();
    }
    /* Mobile browsers may discard a page without a usable hide event, so the
       view goes out right after load and activity shortly after it happens. */
    function first() { setTimeout(flush, 1000); }
    if (doc.readyState === 'complete') first(); else global.addEventListener('load', first);
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden') { if (timer) { clearTimeout(timer); timer = 0; } flush(); }
      else if (!visFrom) visFrom = Date.now();
    });
    global.addEventListener('pagehide', flush);

    /* A run counts as the user's only after the first real gesture, so the
       boot-time computation of every live tool is not reported as use. */
    function onGesture() { gesture = true; }
    doc.addEventListener('pointerdown', onGesture, true);
    doc.addEventListener('keydown', onGesture, true);

    /* Downloads: the framework and 24+ tools save files through a temporary
       <a download>. Programmatic .click() is counted here and marked, so the
       document-level listener below does not count the same click twice. */
    function dlExt(a) {
      var n = a.getAttribute('download') || '';
      if (!n) { try { n = new URL(a.href, loc.href).pathname; } catch (e) { n = ''; } }
      var m = /\.([A-Za-z0-9]{1,5})$/.exec(n);
      return m ? m[1].toLowerCase() : 'other';
    }
    var AP = global.HTMLAnchorElement && global.HTMLAnchorElement.prototype;
    if (AP && AP.click) {
      var aClick = AP.click;
      AP.click = function () {
        try { if (this.hasAttribute('download')) { this.__dguCounted = true; bump(S.dl, dlExt(this)); } } catch (e) {}
        return aClick.apply(this, arguments);
      };
    }
    /* The same capture listener also reads the shared bar's two workflow
       actions. They are built in diagram-common.js, which carries no counter,
       and they stamp their own action name on the button (data-dgc-act), so
       what is counted here is the press of "Continue with" (co) or "Attach"
       (at) and nothing about the target, the project or any value. */
    doc.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var w = t.closest('[data-dgc-act]');
      if (w) {
        var act = w.getAttribute('data-dgc-act');
        if (act === 'continue') { S.co++; gesture = true; schedule(); }
        else if (act === 'attach') { S.at++; gesture = true; schedule(); }
      }
      var a = t.closest('a[download]');
      if (!a) return;
      if (a.__dguCounted) { a.__dguCounted = false; return; }
      bump(S.dl, dlExt(a));
    }, true);

    /* Printing the page itself, and the framework's PDF report, which prints
       from its own hidden iframe (#dgc-report-frame) and so fires no
       beforeprint in this window. */
    global.addEventListener('beforeprint', function () { S.pr++; schedule(); });
    function watchReport() {
      if (!doc.body || !global.MutationObserver) return;
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var nodes = list[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) if (nodes[j].id === 'dgc-report-frame') { S.rp++; schedule(); }
        }
      }).observe(doc.body, { childList: true });
    }
    if (doc.body) watchReport(); else doc.addEventListener('DOMContentLoaded', watchReport);

    function onErr(msg, file, line) {
      if (S.er.length >= 5) return;
      var f = String(file || '').split('?')[0].split('/').pop();
      var k = clean(msg, 100) + (f ? ' @' + clean(f, 40) + ':' + (line || 0) : '');
      if (S.er.indexOf(k) < 0) { S.er.push(k); schedule(); }
    }
    global.addEventListener('error', function (e) { if (e && e.message) onErr(e.message, e.filename, e.lineno); });
    global.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason; onErr('unhandled: ' + (r && r.message ? r.message : r), '', 0);
    });

    /* Framework app hooks. App is private to diagram-ui.js, so its prototype
       is reached through the first instance: the wrapper around
       DiagramUI.app() and, for a page that created its app before this block
       ran, DiagramUI.current. Initial boot runs are left out by design. */
    function patch(P) {
      if (!P || P.__dguStats) return;
      P.__dguStats = true;
      var run = P.run, setState = P.setState, commit = P.onFieldCommit, reset = P.reset, example = P.example;
      if (run) P.run = function () {
        if (gesture) { S.ru++; schedule(); this.__dguT0 = global.performance ? performance.now() : Date.now(); }
        return run.apply(this, arguments);
      };
      if (setState) P.setState = function (st) {
        if (this.__dguT0 && (st === 'ready' || st === 'error')) {
          bump(S.rt, rtBucket((global.performance ? performance.now() : Date.now()) - this.__dguT0), 12);
          this.__dguT0 = 0;
        }
        if (st === 'error') { S.ce++; schedule(); }
        return setState.apply(this, arguments);
      };
      if (commit) P.onFieldCommit = function () { S.ed++; gesture = true; schedule(); return commit.apply(this, arguments); };
      if (reset) P.reset = function () { S.rs++; schedule(); return reset.apply(this, arguments); };
      if (example) P.example = function (ex) {
        var id = typeof ex === 'string' ? ex : '';
        if (!id && ex) {
          var lb = ex.label;
          if (typeof lb === 'function') { try { lb = lb(); } catch (e) { lb = ''; } }
          id = ex.id || (lb && typeof lb === 'object' ? (lb.en || '') : lb);
        }
        bump(S.ex, String(id || 'unnamed').replace(/[^\w .,:;@#()\[\]'"\/<>=+*-]/g, '').slice(0, 60), 30);
        gesture = true;
        return example.apply(this, arguments);
      };
    }
    var UI = global.DiagramUI;
    if (UI && typeof UI.app === 'function') {
      var makeApp = UI.app;
      UI.app = function () {
        var a = makeApp.apply(this, arguments);
        try { patch(Object.getPrototypeOf(a)); } catch (e) {}
        return a;
      };
      var late = function () { try { if (UI.current) patch(Object.getPrototypeOf(UI.current)); } catch (e) {} };
      doc.addEventListener('DOMContentLoaded', late);
      global.addEventListener('load', late);
    }
  } catch (e) { /* counters must never break a tool */ }
})(typeof window !== 'undefined' ? window : this);
