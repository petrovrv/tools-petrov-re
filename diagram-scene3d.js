/* tools.petrov.re — shared scene-editor runtime
 * API: tools.petrov.re/scene-editor/v1
 *
 * This file deliberately owns editor semantics, not solver/domain state.
 * A tool keeps its native scene format and renderer and exposes objects through
 * a thin adapter.  The runtime is dependency-free and safe to load before the
 * tool's own script.
 */
(function (global) {
  'use strict';

  const API = 'tools.petrov.re/scene-editor/v1';
  const VERSION = '1.2.0';
  const clone = (v) => (global.structuredClone ? global.structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const arr = (v) => Array.isArray(v) ? v : [];
  const idOf = (o) => o && o.id;

  const geometry = Object.freeze({
    center(o, posKey = 'pos', sizeKey = 'size') {
      const p = arr(o?.[posKey]), s = arr(o?.[sizeKey]);
      return [0, 1, 2].map(k => Number(p[k] || 0) + Number(s[k] || 0) / 2);
    },
    bounds(objects, posKey = 'pos', sizeKey = 'size') {
      const xs = arr(objects);
      if (!xs.length) return null;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const o of xs) {
        const p = arr(o?.[posKey]), s = arr(o?.[sizeKey]);
        for (let k = 0; k < 3; k++) {
          const a = Number(p[k] || 0), b = a + Number(s[k] || 0);
          lo[k] = Math.min(lo[k], a, b); hi[k] = Math.max(hi[k], a, b);
        }
      }
      return { lo, hi, size: hi.map((v, k) => v - lo[k]), center: lo.map((v, k) => (v + hi[k]) / 2) };
    },
    snap(v, step, enabled = true) {
      const h = Math.max(1e-12, Number(step) || 1);
      return enabled ? Math.round(Number(v || 0) / h) * h : Number(v || 0);
    },
    clampAABB(o, room, posKey = 'pos', sizeKey = 'size', minSize = .001) {
      if (!o || !room) return o;
      const p = o[posKey], s = o[sizeKey];
      if (!Array.isArray(p) || !Array.isArray(s)) return o;
      for (let k = 0; k < 3; k++) {
        const lim = Math.max(minSize, Number(room[k]) || minSize);
        s[k] = clamp(Number(s[k]) || minSize, minSize, lim);
        p[k] = clamp(Number(p[k]) || 0, 0, Math.max(0, lim - s[k]));
      }
      return o;
    },
    rayAABB(origin, dir, lo, hi) {
      let t0 = -Infinity, t1 = Infinity;
      for (let k = 0; k < 3; k++) {
        const d = dir[k];
        if (Math.abs(d) < 1e-12) {
          if (origin[k] < lo[k] || origin[k] > hi[k]) return null;
          continue;
        }
        let a = (lo[k] - origin[k]) / d, b = (hi[k] - origin[k]) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t1 < t0) return null;
      }
      return { near: t0, far: t1 };
    },
    rayPlane(origin, dir, axis, value) {
      const d = Number(dir[axis] || 0); if (Math.abs(d) < 1e-12) return null;
      const t = (Number(value) - Number(origin[axis] || 0)) / d;
      if (!(t >= 0)) return null;
      return origin.map((v, k) => Number(v || 0) + Number(dir[k] || 0) * t);
    }
  });

  const groups = Object.freeze({
    clean(groupList, objects, getId = idOf) {
      const ids = new Set(arr(objects).map(getId));
      const out = arr(groupList).map(g => ({ ...g, members: arr(g.members).filter(id => ids.has(id)) })).filter(g => g.members.length);
      if (Array.isArray(groupList)) { groupList.splice(0, groupList.length, ...out); return groupList; }
      return out;
    },
    exact(groupList, selectedIds, objects, getId = idOf) {
      const valid = new Set(arr(objects).map(getId));
      const ids = arr(selectedIds).filter(id => valid.has(id)).slice().sort(compareId);
      return arr(groupList).find(g => {
        const m = arr(g.members).filter(id => valid.has(id)).slice().sort(compareId);
        return m.length === ids.length && m.every((v, i) => v === ids[i]);
      }) || null;
    },
    nextId(groupList) {
      return arr(groupList).reduce((m, g) => Math.max(m, Number(g?.id) || 0), 0) + 1;
    },
    add(groupList, selectedIds, name) {
      const id = groups.nextId(groupList), g = { id, name: name || `Group ${id}`, members: arr(selectedIds).slice() };
      groupList.push(g); return g;
    },
    removeIntersecting(groupList, selectedIds) {
      const ids = new Set(arr(selectedIds));
      return arr(groupList).filter(g => !arr(g.members).some(id => ids.has(id)));
    },
    members(group, objects, getId = idOf) {
      const ids = new Set(arr(group?.members)); return arr(objects).filter(o => ids.has(getId(o)));
    }
  });

  function compareId(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  class Selection {
    constructor(options = {}) {
      this.getObjects = options.getObjects || (() => []);
      this.getId = options.getId || idOf;
      this.onChange = options.onChange || (() => {});
      this.ids = new Set(); this.primary = null; this.group = null;
    }
    valid(id) { return arr(this.getObjects()).some(o => this.getId(o) === id); }
    set(ids, primary = null, silent = false) {
      const valid = new Set(arr(this.getObjects()).map(this.getId));
      this.ids = new Set(arr(ids).filter(id => valid.has(id)));
      this.primary = primary != null && this.ids.has(primary) ? primary : (this.ids.values().next().value ?? null);
      this.group = null; if (!silent) this.onChange(this); return this;
    }
    one(id, additive = false) {
      if (id == null) return additive ? this : this.set([]);
      const ids = additive ? new Set(this.ids) : new Set();
      if (additive && ids.has(id)) ids.delete(id); else ids.add(id);
      return this.set([...ids], id);
    }
    objects() { const ids = this.ids; return arr(this.getObjects()).filter(o => ids.has(this.getId(o))); }
    clear() { return this.set([]); }
    serialize() { return { ids: [...this.ids], primary: this.primary, group: this.group }; }
    restore(v, silent = false) { this.set(arr(v?.ids), v?.primary ?? null, true); this.group = v?.group ?? null; if (!silent) this.onChange(this); return this; }
  }

  class History {
    constructor(options = {}) {
      this.capture = options.capture || (() => null);
      this.restore = options.restore || (() => {});
      this.equal = options.equal || ((a, b) => JSON.stringify(a) === JSON.stringify(b));
      this.limit = Math.max(1, options.limit || 60);
      this.undoStack = []; this.redoStack = []; this.current = null; this.suspend = 0; this.pendingBefore = false;
      this.onChange = options.onChange || (() => {});
    }
    seed() { this.current = clone(this.capture()); this.onChange(this); return this.current; }
    checkpoint() {
      if (this.suspend) return this.current;
      const n = clone(this.capture());
      if (this.current == null) { this.current = n; this.pendingBefore = false; this.onChange(this); return n; }
      // beforeMutation() has already recorded the pre-change state. A following
      // checkpoint only advances the current snapshot; it must not push it twice.
      if (this.pendingBefore) { this.current = n; this.pendingBefore = false; this.onChange(this); return n; }
      if (!this.equal(this.current, n)) {
        this.undoStack.push(this.current); if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack.length = 0; this.current = n; this.onChange(this);
      }
      return n;
    }
    beforeMutation() {
      if (this.suspend) return;
      const n = clone(this.capture());
      // Support legacy callers that use beforeMutation() without checkpoint():
      // synchronize to the state left by the preceding mutation before recording it.
      if (this.current == null || !this.equal(this.current, n)) this.current = n;
      this.undoStack.push(clone(this.current)); if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0; this.pendingBefore = true; this.onChange(this);
    }
    begin() { this.suspend++; return this; }
    end() { this.suspend = Math.max(0, this.suspend - 1); if (!this.suspend) this.checkpoint(); return this; }
    transaction(fn) { this.begin(); try { return fn(); } finally { this.end(); } }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      if (!this.canUndo()) return false;
      const now = clone(this.capture()); this.redoStack.push(now);
      const target = this.undoStack.pop(); this.pendingBefore = false; this.suspend++;
      try { this.restore(clone(target)); } finally { this.suspend--; this.current = clone(this.capture()); this.onChange(this); }
      return true;
    }
    redo() {
      if (!this.canRedo()) return false;
      const now = clone(this.capture()); this.undoStack.push(now);
      const target = this.redoStack.pop(); this.pendingBefore = false; this.suspend++;
      try { this.restore(clone(target)); } finally { this.suspend--; this.current = clone(this.capture()); this.onChange(this); }
      return true;
    }
    clear(seed = true) { this.undoStack.length = this.redoStack.length = 0; this.current = seed ? clone(this.capture()) : null; this.onChange(this); }
  }

  function cloneArray(options) {
    const src = arr(options.objects), all = options.target || [], count = clamp(Math.round(options.count || 1), 1, 100);
    const axis = ({ x: 0, y: 1, z: 2 })[String(options.direction || 'x+')[0]] ?? 0;
    const sign = String(options.direction || 'x+').endsWith('-') ? -1 : 1;
    const spacing = Math.max(0, Number(options.spacing) || 0), id = options.nextId || defaultNextNumericId(all);
    const copy = options.clone || clone, postBatch = options.postBatch || (() => {}), newObjects = [], batches = [];
    let next = typeof id === 'function' ? null : Number(id);
    for (let c = 1; c <= count; c++) {
      const map = new Map(), batch = [];
      for (const o of src) {
        const q = copy(o), old = options.getId ? options.getId(o) : o.id;
        const nid = typeof id === 'function' ? id(o, c, map, all.concat(newObjects)) : next++;
        if (options.setId) options.setId(q, nid); else q.id = nid;
        map.set(old, nid);
        if (Array.isArray(q.pos)) q.pos[axis] += sign * spacing * c;
        if (options.rename) options.rename(q, o, c); else if (typeof q.name === 'string') q.name = q.name.replace(/\s+#\d+$/, '') + ` #${c + 1}`;
        batch.push(q);
      }
      if (options.remapKeys) for (const q of batch) for (const key of options.remapKeys) if (map.has(q[key])) q[key] = map.get(q[key]);
      postBatch(batch, { index: c, map }); newObjects.push(...batch); batches.push(batch);
    }
    all.push(...newObjects); return { objects: newObjects, batches };
  }
  function defaultNextNumericId(objects) { return arr(objects).reduce((m, o) => Math.max(m, Number(o?.id) || 0), 0) + 1; }

  function bindSplitter(options = {}) {
    const el = typeof options.element === 'string' ? document.querySelector(options.element) : options.element;
    if (!el) return () => {};
    const root = options.root || document.documentElement, css = options.cssVar, storageKey = options.storageKey;
    if (storageKey && css) try { const v = localStorage.getItem(storageKey); if (v != null && v !== '') root.style.setProperty(css, v + (options.unit || 'px')); } catch (_) {}
    let active = false;
    const move = (e) => {
      if (!active) return;
      let v = Number(options.measure ? options.measure(e) : 0);
      if (options.min != null) v = Math.max(Number(options.min), v);
      if (options.max != null) v = Math.min(Number(options.max), v);
      if (options.round !== false) v = Math.round(v);
      if (css) root.style.setProperty(css, v + (options.unit || 'px'));
      if (storageKey) try { localStorage.setItem(storageKey, String(v)); } catch (_) {}
      options.onMove?.(v, e); e.preventDefault();
    };
    const stop = (e) => {
      if (!active) return; active = false; el.classList.remove(options.activeClass || 'dragging');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      options.onEnd?.(e);
    };
    const start = (e) => {
      active = true; el.classList.add(options.activeClass || 'dragging');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      options.onStart?.(e); e.preventDefault();
    };
    el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop);
    return () => { el.removeEventListener('pointerdown', start); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop); };
  }

  function renderPalette(container, items, options = {}) {
    const host = typeof container === 'string' ? document.querySelector(container) : container; if (!host) return;
    host.textContent = '';
    for (const item of arr(items)) {
      const node = document.createElement(options.tag || 'button'); node.type = node.tagName === 'BUTTON' ? 'button' : undefined;
      node.className = options.className || 'scene3d-palette-item'; node.dataset.kind = item.kind ?? item.id ?? '';
      if (item.title) node.title = item.title; if (item.color) node.style.color = item.color;
      if (item.html != null) node.innerHTML = item.html; else node.textContent = item.label ?? item.kind ?? item.id ?? '';
      node.addEventListener('click', e => options.onPick?.(item, e)); host.appendChild(node);
    }
  }

  class ContextMenu {
    constructor(element) { this.el = typeof element === 'string' ? document.querySelector(element) : element; this._outside = e => { if (this.el && !this.el.contains(e.target)) this.hide(); }; document.addEventListener('pointerdown', this._outside); }
    clear() { if (this.el) this.el.textContent = ''; return this; }
    title(text, className = 'ctitle') { if (!this.el) return this; const n = document.createElement('div'); n.className = className; n.textContent = text; this.el.appendChild(n); return this; }
    separator() { if (this.el) this.el.appendChild(document.createElement('hr')); return this; }
    button(text, fn) { if (!this.el) return this; const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', () => { this.hide(); fn?.(); }); this.el.appendChild(b); return b; }
    row(label, input, className = 'crow') { if (!this.el) return null; const r = document.createElement('div'); r.className = className; const s = document.createElement('span'); s.textContent = label; r.append(s, input); this.el.appendChild(r); return r; }
    show(x, y, margin = 8) { if (!this.el) return; this.el.style.display = 'block'; const w = this.el.offsetWidth, h = this.el.offsetHeight; this.el.style.left = Math.max(4, Math.min(innerWidth - w - margin, x)) + 'px'; this.el.style.top = Math.max(4, Math.min(innerHeight - h - margin, y)) + 'px'; }
    hide() { if (this.el) this.el.style.display = 'none'; }
    destroy() { document.removeEventListener('pointerdown', this._outside); }
  }

  const shell = Object.freeze({
    hiddenFacesForEye(eye, room, options = {}) {
      const L = Number(room[0] || 0), W = Number(room[1] || 0), H = Number(room[2] || 0), dx = eye[0] - L / 2, dy = eye[1] - W / 2, dxy = Math.hypot(dx, dy) || 1;
      const sideThreshold = options.sideThreshold ?? .22, roofThreshold = options.roofThreshold ?? .72, hide = new Set();
      if (Math.abs(dx) / dxy > sideThreshold) hide.add(dx < 0 ? 0 : 1);
      if (Math.abs(dy) / dxy > sideThreshold) hide.add(dy < 0 ? 2 : 3);
      if (eye[2] > H * roofThreshold) hide.add(5);
      return hide;
    },
    visibleFacesForEye(eye, room, faces = [0, 1, 2, 3, 5], options = {}) {
      const hidden = shell.hiddenFacesForEye(eye, room, options); return faces.filter(f => !hidden.has(f));
    }
  });

  class OrbitCamera {
    constructor(options = {}) {
      this.target = arr(options.target).length === 3 ? options.target.slice() : [0, 0, 0];
      this.distance = Number(options.distance) || 10; this.yaw = Number(options.yaw) || -.8; this.pitch = Number(options.pitch) || .55;
      this.minDistance = options.minDistance || .1; this.maxDistance = options.maxDistance || 1e5;
    }
    eye() {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      return [this.target[0] + this.distance * cp * cy, this.target[1] + this.distance * cp * sy, this.target[2] + this.distance * sp];
    }
    orbit(dx, dy, speed = .006) { this.yaw -= dx * speed; this.pitch = clamp(this.pitch + dy * speed, -1.48, 1.48); return this; }
    zoom(delta, speed = .0015) { this.distance = clamp(this.distance * Math.exp(delta * speed), this.minDistance, this.maxDistance); return this; }
    pan(dx, dy, viewportHeight, speed = 1) {
      const eye = this.eye(), f = norm(sub(this.target, eye)), up0 = [0, 0, 1], r = norm(cross(f, up0)), u = norm(cross(r, f)), scale = this.distance * 2 * Math.tan(Math.PI / 8) / Math.max(1, viewportHeight) * speed;
      this.target = add(this.target, add(scaleVec(r, -dx * scale), scaleVec(u, dy * scale))); return this;
    }
  }
  const add = (a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), scaleVec=(a,s)=>a.map(v=>v*s), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], norm=a=>{const m=Math.hypot(...a)||1;return a.map(v=>v/m)};

  function cameraRay(camera, clientX, clientY, rect, fov = Math.PI / 4) {
    const eye = camera.eye(), forward = norm(sub(camera.target, eye)), right = norm(cross(forward, [0, 0, 1])), up = norm(cross(right, forward));
    const x = ((clientX - rect.left) / Math.max(1, rect.width) * 2 - 1), y = (1 - (clientY - rect.top) / Math.max(1, rect.height) * 2), aspect = rect.width / Math.max(1, rect.height), t = Math.tan(fov / 2);
    return { eye, dir: norm(add(forward, add(scaleVec(right, x * aspect * t), scaleVec(up, y * t)))) };
  }

  class PlacementGhost {
    constructor(options = {}) { this.kind = options.kind || null; this.object = options.object || null; this.valid = false; this.surface = null; this.freeZ = options.freeZ ?? 0; }
    update(v = {}) { Object.assign(this, v); return this; }
    cancel() { this.kind = null; this.object = null; this.valid = false; this.surface = null; return this; }
  }

  class Controller {
    constructor(adapter = {}, options = {}) {
      this.adapter = adapter; this.options = options;
      this.selection = new Selection({ getObjects: () => this.objects(), getId: o => this.id(o), onChange: () => this.changed('selection') });
      this.placement = new PlacementGhost();
      this.history = new History({
        limit: options.historyLimit || 60,
        capture: () => ({ scene: clone(this.adapter.serialize?.()), selection: this.selection.serialize() }),
        restore: snap => { this.adapter.deserialize?.(clone(snap.scene)); this.selection.restore(snap.selection, true); this.changed('restore'); },
        onChange: h => this.options.onHistory?.(h)
      });
      if (adapter.serialize && adapter.deserialize) this.history.seed();
    }
    objects() { return arr(this.adapter.getObjects?.()); }
    groupList() { return arr(this.adapter.getGroups?.()); }
    id(o) { return this.adapter.getId ? this.adapter.getId(o) : o?.id; }
    changed(reason) { this.options.onChange?.(reason, this); }
    cleanGroups() { const g = groups.clean(this.groupList(), this.objects(), o => this.id(o)); this.adapter.setGroups?.(g); return g; }
    exactGroup() { return groups.exact(this.groupList(), [...this.selection.ids], this.objects(), o => this.id(o)); }
    group(name) { if (this.selection.ids.size < 2) return null; const g = groups.add(this.groupList(), [...this.selection.ids], name); this.selection.group = g.id; this.changed('group'); return g; }
    ungroup() { const g = groups.removeIntersecting(this.groupList(), [...this.selection.ids]); this.adapter.setGroups?.(g); this.selection.group = null; this.changed('ungroup'); return g; }
    deleteSelection() { const ids = new Set(this.selection.ids); if (!ids.size) return; this.history.beforeMutation(); this.adapter.deleteByIds?.(ids); this.cleanGroups(); this.selection.clear(); this.history.checkpoint(); this.changed('delete'); }
  }


  class CanvasViewport {
    constructor(canvas, adapter = {}, options = {}) {
      this.canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
      this.adapter = adapter; this.options = options; this.camera = options.camera || new OrbitCamera(options.cameraOptions || {}); this.placement = options.placement || null;
      this.fov = options.fov || Math.PI / 4; this.drag = null; this.ghost = null; this.dirty = true;
      if (!this.canvas) throw new Error('DiagramScene3D.CanvasViewport: canvas not found');
      this._down = e => this.pointerDown(e); this._move = e => this.pointerMove(e); this._up = e => this.pointerUp(e); this._wheel = e => this.wheel(e); this._context = e => this.context(e);
      this.canvas.addEventListener('pointerdown', this._down, true); this.canvas.addEventListener('pointermove', this._move, true);
      this.canvas.addEventListener('pointerup', this._up, true); this.canvas.addEventListener('pointercancel', this._up, true);
      this.canvas.addEventListener('wheel', this._wheel, { passive: false, capture: true }); this.canvas.addEventListener('contextmenu', this._context, true);
      this.resizeObserver = global.ResizeObserver ? new ResizeObserver(() => this.invalidate()) : null; this.resizeObserver?.observe(this.canvas);
    }
    enabled() { return this.options.enabled ? !!this.options.enabled() : true; }
    invalidate() { this.dirty = true; this.options.onInvalidate?.(); }
    destroy() {
      this.resizeObserver?.disconnect(); this.canvas.removeEventListener('pointerdown', this._down, true); this.canvas.removeEventListener('pointermove', this._move, true);
      this.canvas.removeEventListener('pointerup', this._up, true); this.canvas.removeEventListener('pointercancel', this._up, true); this.canvas.removeEventListener('wheel', this._wheel, true); this.canvas.removeEventListener('contextmenu', this._context, true);
    }
    room() {
      const r = this.adapter.getRoom?.() || {}; let polygon = r.polygon;
      if (!Array.isArray(polygon) || polygon.length < 3) {
        const w = Number(r.width ?? r.w ?? r.L ?? 1), l = Number(r.length ?? r.l ?? r.W ?? 1);
        polygon = [[0,0],[w,0],[w,l],[0,l]];
      }
      polygon = polygon.map(p => Array.isArray(p) ? [Number(p[0])||0,Number(p[1])||0] : [Number(p.x)||0,Number(p.y)||0]);
      return { polygon, height: Math.max(.01, Number(r.height ?? r.h ?? r.H ?? 1)) };
    }
    entities() { return arr(this.adapter.getEntities?.()).filter(e => !e.hidden); }
    selection() { const v = this.adapter.getSelection?.(); return new Set(v instanceof Set ? v : arr(v)); }
    frame(padding = 1.35) {
      const r = this.room(), xs = r.polygon.map(p=>p[0]), ys=r.polygon.map(p=>p[1]), lo=[Math.min(...xs),Math.min(...ys),0], hi=[Math.max(...xs),Math.max(...ys),r.height];
      this.camera.target = lo.map((v,k)=>(v+hi[k])/2); const d=Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]); this.camera.distance=Math.max(1,d*padding); this.invalidate(); return this;
    }
    basis() {
      const eye=this.camera.eye(), forward=norm(sub(this.camera.target,eye)), right=norm(cross(forward,[0,0,1]));
      const rr=Math.hypot(...right)<1e-7?[1,0,0]:right, up=norm(cross(rr,forward)); return {eye,forward,right:rr,up};
    }
    project(p, rect) {
      const b=this.basis(), v=sub(p,b.eye), z=dot(v,b.forward); if(z<=1e-4)return null;
      const t=Math.tan(this.fov/2), aspect=rect.width/Math.max(1,rect.height), nx=dot(v,b.right)/(z*t*aspect), ny=dot(v,b.up)/(z*t);
      return {x:(nx+1)*rect.width/2,y:(1-ny)*rect.height/2,z};
    }
    ray(e) { return cameraRay(this.camera,e.clientX,e.clientY,this.canvas.getBoundingClientRect(),this.fov); }
    placementHit(e) {
      if (!this.placement?.active) return null; const ray = this.ray(e);
      const custom = this.adapter.getPlacementHit?.(ray, e, this.placement); if (custom) return custom;
      const z = Number(this.adapter.getPlacementZ?.(this.placement.item, this.placement) ?? this.placement.ghost?.freeZ ?? 0);
      const pos = geometry.rayPlane(ray.eye, ray.dir, 2, z); return pos ? { pos, ray, surface: 'z-plane' } : null;
    }
    entityCenter(e) {
      if (Array.isArray(e.center)) return e.center.slice(0,3);
      const p=Array.isArray(e.pos)?e.pos:[e.x||0,e.y||0,e.z||0], s=Array.isArray(e.size)?e.size:[0,0,0];
      return [0,1,2].map(k=>Number(p[k]||0)+Number(s[k]||0)/2);
    }
    entityPos(e) { return Array.isArray(e.pos)?e.pos.slice(0,3):[Number(e.x)||0,Number(e.y)||0,Number(e.z)||0]; }
    mode() { return this.adapter.getMode?.() || this.options.getMode?.() || 'select'; }
    gizmo(ent = null) {
      const e = ent || this.entities().find(q => this.selection().has(q.id)); if (!e) return null;
      return this.adapter.getGizmo?.(e, this.mode(), this, this.options.gizmoSpace || 'world') || null;
    }
    gizmoScreen(ent = null) {
      const g=this.gizmo(ent); if(!g||!Array.isArray(g.center))return null;
      const rect=this.canvas.getBoundingClientRect(), c=this.project(g.center,rect); if(!c)return null;
      const px=Math.max(42,Number(this.options.gizmoPixels)||72), out=[];
      for(const a of arr(g.axes)){
        const dir=norm(arr(a.dir).slice(0,3).map(Number)); if(dir.length!==3)continue;
        const q=this.project(add(g.center,dir),rect); if(!q)continue; const dx=q.x-c.x,dy=q.y-c.y,dm=Math.hypot(dx,dy); if(dm<1e-5)continue;
        out.push({axis:a,dir,c,end:{x:c.x+dx/dm*px,y:c.y+dy/dm*px},pxPerWorld:dm});
      }
      return {g,c,axes:out,rect};
    }
    pickGizmo(e) {
      const mode=this.mode(); if(!['move','rotate','scale'].includes(mode))return null;
      const ent=this.entities().find(q=>this.selection().has(q.id)); if(!ent)return null;
      const gs=this.gizmoScreen(ent); if(!gs)return null; const r=this.canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,rad=this.options.gizmoPickRadius||13;
      let best=null,bd=rad;
      for(const a of gs.axes){if(!a.axis?.[mode])continue;const d=Math.hypot(a.end.x-x,a.end.y-y);if(d<bd){bd=d;best={...a,ent,gs,mode}}}
      return best;
    }
    beginGizmo(e,gz) {
      const r=this.canvas.getBoundingClientRect(), mx=e.clientX-r.left,my=e.clientY-r.top;
      this.adapter.onBeginTransform?.(gz.ent.id,gz.mode,gz.axis,e);
      this.drag={kind:'gizmo',id:gz.ent.id,mode:gz.mode,axis:gz.axis,dir:gz.dir,center:gz.gs.g.center.slice(),centerScreen:{x:gz.gs.c.x,y:gz.gs.c.y},endScreen:{x:gz.end.x,y:gz.end.y},pxPerWorld:Math.max(1e-6,gz.pxPerWorld),startMouse:{x:mx,y:my}};
    }
    drawGizmo(ctx,rect) {
      const mode=this.mode(); if(!['move','rotate','scale'].includes(mode))return;
      const ent=this.entities().find(q=>this.selection().has(q.id)); if(!ent)return; const gs=this.gizmoScreen(ent); if(!gs)return;
      ctx.save(); ctx.font='700 10px system-ui,sans-serif'; ctx.textAlign='center';ctx.textBaseline='middle';
      for(const a of gs.axes){if(!a.axis?.[mode])continue;const col=a.axis.color||'#6fd3ff',rot=mode==='rotate';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gs.c.x,gs.c.y);ctx.lineTo(a.end.x,a.end.y);ctx.stroke();ctx.beginPath();if(rot)ctx.arc(a.end.x,a.end.y,8,0,Math.PI*2);else ctx.rect(a.end.x-6,a.end.y-6,12,12);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=1;ctx.stroke();if(a.axis.label){ctx.fillStyle='#fff';ctx.fillText(String(a.axis.label).slice(0,4),a.end.x,a.end.y)}}
      ctx.restore();
    }
    pick(e) {
      const rect=this.canvas.getBoundingClientRect(), x=e.clientX-rect.left,y=e.clientY-rect.top; let best=null,bd=this.options.pickRadius||16;
      for(const ent of this.entities()) { const q=this.project(this.entityCenter(ent),rect); if(!q)continue; const d=Math.hypot(q.x-x,q.y-y); if(d<bd){bd=d;best=ent;} }
      return best;
    }
    stopEvent(e) { e.preventDefault(); e.stopImmediatePropagation(); }
    pointerDown(e) {
      if(!this.enabled())return;
      if(this.placement?.active && e.button===0){this.stopEvent(e);const hit=this.placementHit(e);this.placement.update(hit,e);this.placement.commit(hit,e);this.invalidate();return;}
      this.stopEvent(e); const gz=e.button===0?this.pickGizmo(e):null, ent=gz?null:this.pick(e), additive=e.shiftKey||e.ctrlKey||e.metaKey;
      if(gz){this.beginGizmo(e,gz);}
      else if(ent && e.button===0) {
        this.adapter.onSelect?.(ent.id,additive,e);
        if(['select','move'].includes(this.mode())){const p=this.entityPos(ent); this.drag={kind:'entity',id:ent.id,z:p[2],offset:null,start:p,begun:false};const ray=this.ray(e),hit=geometry.rayPlane(ray.eye,ray.dir,2,p[2]); if(hit)this.drag.offset=[p[0]-hit[0],p[1]-hit[1]];}
        else this.drag={kind:'selectOnly',id:ent.id};
      } else this.drag={kind:(e.button===1||e.shiftKey)?'pan':'orbit',x:e.clientX,y:e.clientY};
      try{this.canvas.setPointerCapture(e.pointerId)}catch(_){}; this.invalidate();
    }
    pointerMove(e) {
      if(!this.enabled())return;
      if(this.placement?.active){this.stopEvent(e);this.placement.update(this.placementHit(e),e);this.invalidate();return;}
      if(!this.drag)return; this.stopEvent(e);
      if(this.drag.kind==='selectOnly')return;
      if(this.drag.kind==='orbit'){this.camera.orbit(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag.x=e.clientX;this.drag.y=e.clientY;this.invalidate();return;}
      if(this.drag.kind==='pan'){this.camera.pan(e.clientX-this.drag.x,e.clientY-this.drag.y,this.canvas.clientHeight);this.drag.x=e.clientX;this.drag.y=e.clientY;this.invalidate();return;}
      if(this.drag.kind==='gizmo'){
        const d=this.drag,r=this.canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top, sx=d.endScreen.x-d.centerScreen.x,sy=d.endScreen.y-d.centerScreen.y,sm=Math.hypot(sx,sy)||1,ux=sx/sm,uy=sy/sm;
        let tr={mode:d.mode,component:d.axis.component||d.axis.id,axis:d.axis.id,dir:d.dir.slice(),delta:[0,0,0],amount:0,angle:0};
        if(d.mode==='rotate'){
          const a0=Math.atan2(d.startMouse.y-d.centerScreen.y,d.startMouse.x-d.centerScreen.x),a1=Math.atan2(my-d.centerScreen.y,mx-d.centerScreen.x);let da=a1-a0;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;const snap=Number(this.adapter.getAngleSnap?.()||0);if(snap>0)da=Math.round(da/(snap*Math.PI/180))*(snap*Math.PI/180);tr.angle=da;
        }else{
          let amount=((mx-d.startMouse.x)*ux+(my-d.startMouse.y)*uy)/d.pxPerWorld;const snap=Number(this.adapter.getSnapStep?.()||0);if(d.mode==='move'&&snap>0)amount=geometry.snap(amount,snap,true);tr.amount=amount;tr.delta=scaleVec(d.dir,amount);
        }
        this.adapter.onTransform?.(d.id,tr,e);this.invalidate();return;
      }
      if(this.drag.kind==='entity'){
        const ray=this.ray(e),hit=geometry.rayPlane(ray.eye,ray.dir,2,this.drag.z); if(!hit)return;
        if(!this.drag.begun){this.drag.begun=true;this.adapter.onBeginMove?.(this.drag.id,e);}
        let p=[hit[0]+(this.drag.offset?.[0]||0),hit[1]+(this.drag.offset?.[1]||0),this.drag.z];
        const step=this.adapter.getSnapStep?.(); if(step) { p[0]=geometry.snap(p[0],step,true);p[1]=geometry.snap(p[1],step,true); }
        this.adapter.onMove?.(this.drag.id,p,e); this.invalidate();
      }
    }
    pointerUp(e) { if(!this.enabled()||!this.drag)return; this.stopEvent(e); const d=this.drag;this.drag=null;try{this.canvas.releasePointerCapture(e.pointerId)}catch(_){};this.adapter.onCommit?.(d,e);this.invalidate(); }
    wheel(e) { if(!this.enabled())return; this.stopEvent(e); this.camera.zoom(e.deltaY);this.invalidate(); }
    context(e) { if(!this.enabled())return; if(this.placement?.active){this.stopEvent(e);this.placement.cancel('context');this.invalidate();return;} const ent=this.pick(e); if(!ent)return;this.stopEvent(e);this.adapter.onContext?.(ent.id,e); }
    draw() {
      if(!this.enabled())return false; const cv=this.canvas,rect=cv.getBoundingClientRect(),dpr=global.devicePixelRatio||1,w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;this.dirty=true;} const ctx=cv.getContext('2d'); if(!ctx)return false;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height); this.drawBackground(ctx,rect);this.drawRoom(ctx,rect);this.drawEntities(ctx,rect);this.drawGizmo(ctx,rect);this.drawGhost(ctx,rect);this.options.onOverlayDraw?.(ctx,this,rect);this.dirty=false; return true;
    }
    drawBackground(ctx,r){ctx.save();const g=ctx.createRadialGradient(r.width*.5,r.height*.45,10,r.width*.5,r.height*.45,Math.max(r.width,r.height)*.75);g.addColorStop(0,this.options.bgNear||'#111922');g.addColorStop(1,this.options.bgFar||'#090c10');ctx.fillStyle=g;ctx.fillRect(0,0,r.width,r.height);ctx.restore();}
    drawRoom(ctx,rect){
      const room=this.room(),p=room.polygon,H=room.height,b=this.basis(),faces=[];
      const addFace=(pts,kind)=>{const qs=pts.map(x=>this.project(x,rect));if(qs.some(x=>!x))return;faces.push({pts,qs,kind,depth:qs.reduce((s,q)=>s+q.z,0)/qs.length});};
      addFace(p.map(q=>[q[0],q[1],0]),'floor'); addFace(p.map(q=>[q[0],q[1],H]),'ceiling');
      for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];addFace([[a[0],a[1],0],[c[0],c[1],0],[c[0],c[1],H],[a[0],a[1],H]],'wall');}
      faces.sort((a,c)=>c.depth-a.depth); const eye=b.eye;
      for(const f of faces){let alpha=f.kind==='floor'?.12:f.kind==='ceiling'?.04:.075;if(f.kind==='wall'){const c=f.pts.reduce((s,q)=>add(s,q),[0,0,0]).map(v=>v/4),dist=Math.hypot(...sub(c,eye));const all=faces.filter(x=>x.kind==='wall').map(x=>x.depth),near=Math.min(...all),far=Math.max(...all),u=(f.depth-near)/Math.max(1e-9,far-near);alpha=.018+.075*u;if(dist<room.height*.8)alpha=.012;}
        ctx.beginPath();f.qs.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=`rgba(130,155,178,${alpha})`;ctx.fill();ctx.strokeStyle='rgba(150,178,202,.28)';ctx.lineWidth=1;ctx.stroke();}
      // floor grid (bounded, adaptive)
      const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys),span=Math.max(maxx-minx,maxy-miny),step=niceStep(span/10);
      ctx.strokeStyle='rgba(110,135,158,.13)';ctx.lineWidth=1;
      for(let x=Math.ceil(minx/step)*step;x<=maxx+1e-9;x+=step)this.line3(ctx,[x,miny,0],[x,maxy,0],rect);
      for(let y=Math.ceil(miny/step)*step;y<=maxy+1e-9;y+=step)this.line3(ctx,[minx,y,0],[maxx,y,0],rect);
    }
    line3(ctx,a,b,r){const p=this.project(a,r),q=this.project(b,r);if(!p||!q)return;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    drawEntities(ctx,rect){
      const selected=this.selection(); const es=this.entities().map(e=>({e,q:this.project(this.entityCenter(e),rect)})).filter(x=>x.q).sort((a,b)=>b.q.z-a.q.z);
      for(const {e,q} of es){const sel=selected.has(e.id),kind=e.shape||((e.size&&Math.max(...e.size)>0)?'box':'point'),col=e.color||'#6fd3ff';
        if(kind==='box'&&Array.isArray(e.pos)&&Array.isArray(e.size)){this.drawBox(ctx,e.pos,e.size,rect,col,sel);}else{const radius=sel?8:6;ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle=sel?'#ffe17a':'rgba(255,255,255,.65)';ctx.lineWidth=sel?2:1;ctx.stroke();if(e.type==='receiver'){ctx.beginPath();ctx.moveTo(q.x-9,q.y);ctx.lineTo(q.x+9,q.y);ctx.moveTo(q.x,q.y-9);ctx.lineTo(q.x,q.y+9);ctx.stroke();}}
        if(e.label||e.name){ctx.font='10px system-ui,sans-serif';ctx.fillStyle=sel?'#fff2b0':'rgba(220,231,242,.82)';ctx.fillText(e.label||e.name,q.x+9,q.y-8);}
      }
    }
    drawBox(ctx,pos,size,rect,color,selected){const p=pos,s=size,corners=[];for(const z of [0,1])for(const y of [0,1])for(const x of [0,1])corners.push(this.project([p[0]+s[0]*x,p[1]+s[1]*y,p[2]+s[2]*z],rect));if(corners.some(x=>!x))return;const E=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];ctx.strokeStyle=selected?'#ffe17a':color;ctx.lineWidth=selected?2:1.2;for(const [a,b] of E){ctx.beginPath();ctx.moveTo(corners[a].x,corners[a].y);ctx.lineTo(corners[b].x,corners[b].y);ctx.stroke();}}
    drawGhost(ctx,rect){const g=this.adapter.getGhost?.()||this.placement?.ghost||this.ghost;if(!g||!g.pos)return;ctx.save();ctx.globalAlpha=.55;this.drawBox(ctx,g.pos,g.size||[.25,.25,.25],rect,g.color||'#6fd3ff',true);ctx.restore();}
  }
  function niceStep(v){const p=Math.pow(10,Math.floor(Math.log10(Math.max(v,1e-9)))),u=v/p;return (u<1.5?1:u<3.5?2:u<7.5?5:10)*p;}

  // -------------------------------------------------------- authoring shell v1.1
  const mixed = Symbol('DiagramScene3D.mixed');
  function pathGet(obj, path) {
    if (!obj) return undefined; const ks = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
    let v = obj; for (const k of ks) { if (v == null) return undefined; v = v[k]; } return v;
  }
  function pathSet(obj, path, value) {
    const ks = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean); if (!obj || !ks.length) return obj;
    let v = obj; for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (v[k] == null || typeof v[k] !== 'object') v[k] = {}; v = v[k]; }
    v[ks[ks.length - 1]] = value; return obj;
  }
  function commonFieldValue(objects, field) {
    const xs = arr(objects); if (!xs.length) return undefined;
    const read = field.get ? o => field.get(o, xs) : o => pathGet(o, field.key);
    const first = read(xs[0]);
    const same = xs.every(o => { const v = read(o); return field.equal ? field.equal(first, v) : JSON.stringify(first) === JSON.stringify(v); });
    return same ? first : mixed;
  }
  function bool(v) { return !!v; }
  function resolveHost(host) { return typeof host === 'string' ? document.querySelector(host) : host; }
  function asLabel(v, fallback = '') { return typeof v === 'function' ? v() : (v ?? fallback); }
  function createNode(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k in n && k !== 'style') { try { n[k] = v; } catch (_) { n.setAttribute(k, v); } }
      else n.setAttribute(k, v);
    }
    for (const c of arr(children).flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }

  let stylesInstalled = false;
  function ensureAuthoringStyles() {
    if (stylesInstalled || !global.document) return; stylesInstalled = true;
    const s = document.createElement('style'); s.dataset.diagramScene3d = 'authoring';
    s.textContent = `
.scene3d-toolbar{display:flex;align-items:center;gap:4px;padding:5px;background:#0b0e13d9;border:1px solid #2a3240;border-radius:9px;box-shadow:0 4px 16px #0005;backdrop-filter:blur(4px)}
.scene3d-toolbar button{width:34px;height:32px;padding:0;border:0;border-radius:6px;background:#242b38;color:#dce4ef;font:600 15px system-ui,sans-serif;cursor:pointer}
.scene3d-toolbar button:hover:not(:disabled){filter:brightness(1.16)}.scene3d-toolbar button.on{background:#36547c;color:#fff;box-shadow:0 0 0 1px #79a9f7 inset}.scene3d-toolbar button:disabled{opacity:.34;cursor:default}.scene3d-toolbar .scene3d-sep{width:1px;height:24px;background:#3a4250;margin:0 2px}
.scene3d-tree{font:12px/1.3 system-ui,sans-serif}.scene3d-tree-empty{padding:10px 12px;color:#8490a1}.scene3d-tree-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto auto auto;gap:5px;align-items:center;min-height:31px;padding:3px 7px;border-left:2px solid transparent;cursor:pointer}.scene3d-tree-row:hover{background:#17202c}.scene3d-tree-row.selected{background:#202c40;border-left-color:#6688c8}.scene3d-tree-row.primary{background:#283b55;border-left-color:#6fd3ff}.scene3d-tree-row.hidden{opacity:.55}.scene3d-tree-row .scene3d-tree-icon{width:20px;text-align:center}.scene3d-tree-row .scene3d-tree-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scene3d-tree-row .scene3d-tree-meta{color:#7e8999;font-size:10px;white-space:nowrap}.scene3d-tree-row button{border:0;background:transparent;color:#9ba8ba;padding:2px 4px;border-radius:4px;cursor:pointer}.scene3d-tree-row button:hover{background:#303c4d;color:#fff}.scene3d-tree-group{padding:7px 8px 3px;color:#8490a1;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
.scene3d-props{font:12px/1.35 system-ui,sans-serif}.scene3d-props-empty{color:#8490a1;padding:5px 0}.scene3d-props-section{padding:0 0 10px}.scene3d-props-section+.scene3d-props-section{border-top:1px solid #293240;padding-top:10px}.scene3d-props-title{font-weight:700;color:#d9e1ec;margin:0 0 7px}.scene3d-props-row{display:grid;grid-template-columns:minmax(88px,.95fr) minmax(0,1.05fr) auto;gap:7px;align-items:center;margin:5px 0}.scene3d-props-row>span:first-child{color:#9ca8b8}.scene3d-props-row input,.scene3d-props-row select,.scene3d-props-row textarea{min-width:0;width:100%;box-sizing:border-box}.scene3d-props-unit{color:#7f8a9a;font-size:10px}.scene3d-props-vec{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.scene3d-props-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.scene3d-props-actions button{flex:1 1 auto}.scene3d-props-note{color:#8290a2;font-size:10px;margin:5px 0}.scene3d-mixed::placeholder{color:#8995a5;font-style:italic}
.scene3d-placement-badge{position:absolute;z-index:20;left:12px;top:57px;max-width:440px;padding:7px 10px;background:#101925e8;border:1px solid #5484bd;border-radius:7px;color:#dfe9f8;font:11.5px/1.45 ui-monospace,Menlo,monospace;display:none;pointer-events:none}.scene3d-placement-badge.on{display:block}
`;
    document.head.appendChild(s);
  }

  class PlacementSession {
    constructor(options = {}) {
      this.options = options; this.item = null; this.ghost = null; this.valid = false; this.hit = null; this.data = null;
      this.onChange = options.onChange || (() => {});
    }
    get active() { return !!this.item; }
    begin(item, data = null) {
      this.item = item || null; this.data = data; this.hit = null; this.valid = false;
      this.ghost = this.item ? (this.options.createGhost?.(this.item, data) ?? new PlacementGhost({ kind: this.item.kind ?? this.item.id })) : null;
      this.onChange('begin', this); return this;
    }
    update(hit, event = null) {
      if (!this.active) return false; this.hit = hit || null;
      const r = this.options.updateGhost?.(this.ghost, hit, this.item, event, this.data);
      if (r && r !== this.ghost) this.ghost = r;
      this.valid = this.options.validate ? !!this.options.validate(this.ghost, hit, this.item, event, this.data) : !!hit;
      if (this.ghost) this.ghost.valid = this.valid;
      this.onChange('update', this); return this.valid;
    }
    commit(hit = this.hit, event = null) {
      if (!this.active) return null; if (hit !== this.hit) this.update(hit, event); if (!this.valid) return null;
      const out = this.options.commit?.(this.ghost, hit, this.item, event, this.data);
      const keepActive = out?.keepActive === true || !!this.options.keepActive?.(out, this, event);
      if (keepActive) { if (out?.ghost) this.ghost = out.ghost; this.valid = true; this.onChange('stage', this); return out; }
      const repeat = !!(event?.shiftKey || this.item?.repeat || this.options.repeat);
      if (repeat) { const item = this.item, data = this.data; this.begin(item, data); }
      else this.cancel('commit');
      return out;
    }
    cancel(reason = 'cancel') {
      if (!this.active && !this.ghost) return; const old = this.item;
      this.options.cancel?.(this.ghost, old, reason, this.data); this.item = null; this.ghost = null; this.valid = false; this.hit = null; this.data = null;
      this.onChange(reason, this);
    }
    keydown(e) { if (this.active && e.key === 'Escape') { this.cancel('escape'); e.preventDefault(); return true; } return false; }
  }

  class SceneTree {
    constructor(host, options = {}) {
      ensureAuthoringStyles(); this.host = resolveHost(host); this.options = options; this.query = ''; if (this.host) this.host.classList.add('scene3d-tree');
    }
    setQuery(q) { this.query = String(q || '').trim().toLocaleLowerCase(); this.render(); }
    items() { return arr(this.options.getItems?.()); }
    render() {
      const host = this.host; if (!host) return; host.textContent = '';
      let items = this.items(); const q = this.query;
      if (q) items = items.filter(it => String([it.label, it.name, it.kind, it.meta, it.id].filter(Boolean).join(' ')).toLocaleLowerCase().includes(q));
      const groupBy = this.options.groupBy;
      const groupsMap = new Map();
      if (groupBy) for (const item of items) { const g = typeof groupBy === 'function' ? groupBy(item) : item[groupBy]; if (!groupsMap.has(g ?? '')) groupsMap.set(g ?? '', []); groupsMap.get(g ?? '').push(item); }
      else groupsMap.set('', items);
      for (const [groupName, xs] of groupsMap) {
        if (groupName) host.appendChild(createNode('div', { class: 'scene3d-tree-group', text: groupName }));
        for (const item of xs) host.appendChild(this.row(item));
      }
      if (!items.length) host.appendChild(createNode('div', { class: 'scene3d-tree-empty', text: asLabel(this.options.emptyText, 'No objects') }));
    }
    row(item) {
      const row = createNode('div', { class: 'scene3d-tree-row' + (item.selected ? ' selected' : '') + (item.primary ? ' primary' : '') + (item.hidden ? ' hidden' : ''), dataset: { id: item.id } });
      const ico = createNode('span', { class: 'scene3d-tree-icon' });
      if (item.iconHtml != null) ico.innerHTML = item.iconHtml; else ico.textContent = item.icon ?? '◆'; if (item.color) ico.style.color = item.color;
      const name = createNode('span', { class: 'scene3d-tree-name', text: item.label ?? item.name ?? String(item.id) });
      const meta = createNode('span', { class: 'scene3d-tree-meta', text: item.meta ?? item.kind ?? '' });
      row.append(ico, name, meta);
      if (this.options.onToggleLock && item.lockable !== false) row.appendChild(this.iconButton(item.locked ? '▣' : '□', item.locked ? 'Unlock' : 'Lock', e => this.options.onToggleLock(item, e)));
      if (this.options.onToggleHidden && item.hideable !== false) row.appendChild(this.iconButton(item.hidden ? '◌' : '●', item.hidden ? 'Show' : 'Hide', e => this.options.onToggleHidden(item, e)));
      if (this.options.onContext) row.appendChild(this.iconButton('⋮', 'Actions', e => this.options.onContext(item, e)));
      row.addEventListener('click', e => { if (e.target.closest('button')) return; this.options.onSelect?.(item, !!(e.shiftKey || e.ctrlKey || e.metaKey), e); });
      if (this.options.onRename) name.addEventListener('dblclick', e => { e.stopPropagation(); this.rename(item, name); });
      return row;
    }
    iconButton(text, title, fn) { const b = createNode('button', { type: 'button', text, title }); b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b; }
    rename(item, node) {
      const inp = createNode('input', { type: 'text', value: item.label ?? item.name ?? '' }); node.replaceWith(inp); inp.focus(); inp.select();
      const done = commit => { if (!inp.isConnected) return; const val = inp.value.trim(); if (commit && val) this.options.onRename?.(item, val); this.render(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }); inp.addEventListener('blur', () => done(true), { once: true });
    }
  }

  class PropertyInspector {
    constructor(host, options = {}) { ensureAuthoringStyles(); this.host = resolveHost(host); this.options = options; if (this.host) this.host.classList.add('scene3d-props'); }
    context() { const objects = arr(this.options.getSelection?.()); return { objects, primary: this.options.getPrimary?.() || objects[0] || null, count: objects.length, inspector: this }; }
    render() {
      const host = this.host; if (!host) return; host.textContent = ''; const ctx = this.context();
      if (!ctx.count) { host.appendChild(createNode('div', { class: 'scene3d-props-empty', text: asLabel(this.options.emptyText, 'No object selected') })); return; }
      const schema = arr(this.options.schema?.(ctx));
      for (const section of schema) {
        if (section.visible && !section.visible(ctx)) continue;
        const box = createNode('div', { class: 'scene3d-props-section' }); if (section.title) box.appendChild(createNode('div', { class: 'scene3d-props-title', text: asLabel(section.title) }));
        if (section.note) box.appendChild(createNode('div', { class: 'scene3d-props-note', text: asLabel(section.note) }));
        for (const field of arr(section.fields)) { if (field.visible && !field.visible(ctx)) continue; const n = this.field(field, ctx); if (n) box.appendChild(n); }
        if (section.actions) box.appendChild(this.actions(section.actions, ctx)); if (section.render) section.render(box, ctx, this);
        host.appendChild(box);
      }
    }
    actions(actions, ctx) {
      const r = createNode('div', { class: 'scene3d-props-actions' });
      for (const a of arr(actions)) { if (a.visible && !a.visible(ctx)) continue; const b = createNode('button', { type: 'button', text: asLabel(a.label ?? a.text, a.id || 'Action'), title: asLabel(a.title, '') }); b.disabled = a.enabled ? !a.enabled(ctx) : false; b.addEventListener('click', e => a.run?.(ctx, e)); r.appendChild(b); }
      return r;
    }
    field(field, ctx) {
      if (field.type === 'custom') { const n = createNode('div'); field.render?.(n, ctx, this); return n; }
      if (field.type === 'note' || field.type === 'readonly') {
        const val = field.value ? field.value(ctx) : (field.get ? field.get(ctx.primary, ctx.objects) : pathGet(ctx.primary, field.key));
        return createNode('div', { class: 'scene3d-props-note', text: field.type === 'readonly' ? `${asLabel(field.label)}: ${val ?? '—'}${field.unit ? ' ' + field.unit : ''}` : asLabel(field.text ?? field.label) });
      }
      if (field.type === 'actions') return this.actions(field.actions, ctx);
      const row = createNode('label', { class: 'scene3d-props-row' }); row.appendChild(createNode('span', { text: asLabel(field.label, field.key || '') }));
      const value = field.value ? field.value(ctx) : commonFieldValue(ctx.objects, field);
      let input;
      if (field.type === 'boolean' || field.type === 'checkbox') {
        input = createNode('input', { type: 'checkbox' }); input.checked = value === mixed ? false : bool(value); input.indeterminate = value === mixed;
      } else if (field.type === 'select') {
        input = createNode('select'); if (value === mixed) input.appendChild(createNode('option', { value: '', text: field.mixedText || '— mixed —' }));
        for (const op0 of arr(typeof field.options === 'function' ? field.options(ctx) : field.options)) { const op = Array.isArray(op0) ? { value: op0[0], label: op0[1] } : op0; input.appendChild(createNode('option', { value: op.value, text: op.label ?? op.value })); }
        input.value = value === mixed ? '' : String(value ?? '');
      } else if (field.type === 'vec3') {
        const wrap = createNode('div', { class: 'scene3d-props-vec' }); const axes = field.axes || ['x', 'y', 'z']; const vals = value === mixed ? [mixed, mixed, mixed] : arr(value);
        for (let k = 0; k < 3; k++) { const i = createNode('input', { type: 'number', step: field.step ?? 'any', title: axes[k] }); if (vals[k] === mixed) { i.value = ''; i.placeholder = '—'; i.classList.add('scene3d-mixed'); } else i.value = vals[k] ?? 0; i.addEventListener('change', () => { const v = Number(i.value); if (!Number.isFinite(v)) return; this.commit(field, { axis: k, value: v }, ctx); }); wrap.appendChild(i); }
        input = wrap;
      } else {
        input = createNode(field.type === 'textarea' ? 'textarea' : 'input', { type: field.type === 'text' || field.type === 'textarea' ? undefined : (field.type || 'number'), step: field.step, min: field.min, max: field.max });
        if (value === mixed) { input.value = ''; input.placeholder = field.mixedText || '— mixed —'; input.classList.add('scene3d-mixed'); } else input.value = value ?? '';
      }
      if (field.disabled) input.disabled = !!field.disabled(ctx); row.appendChild(input); if (field.unit) row.appendChild(createNode('span', { class: 'scene3d-props-unit', text: field.unit })); else row.appendChild(createNode('span'));
      if (field.type !== 'vec3') input.addEventListener(field.event || 'change', () => {
        let v; if (field.type === 'boolean' || field.type === 'checkbox') v = input.checked; else if (field.type === 'number' || !field.type) { v = Number(input.value); if (!Number.isFinite(v)) return; } else v = input.value;
        this.commit(field, v, ctx);
      });
      return row;
    }
    commit(field, value, ctx) {
      this.options.beforeChange?.(field, ctx, value);
      const xs = field.primaryOnly ? (ctx.primary ? [ctx.primary] : []) : ctx.objects;
      if (field.set) field.set(value, xs, ctx.primary, ctx);
      else if (field.type === 'vec3' && value && typeof value === 'object' && 'axis' in value) for (const o of xs) { const v = arr(pathGet(o, field.key)).slice(); while (v.length < 3) v.push(0); v[value.axis] = value.value; pathSet(o, field.key, v); }
      else for (const o of xs) pathSet(o, field.key, value);
      this.options.afterChange?.(field, ctx, value); this.render();
    }
  }

  const DEFAULT_TOOLBAR = [
    { id: 'select', icon: '⌖', title: 'Select · V', mode: 'select', shortcut: 'v' },
    { id: 'move', icon: '↔', title: 'Move · G', mode: 'move', shortcut: 'g', needsSelection: true },
    { id: 'rotate', icon: '⟳', title: 'Rotate · R', mode: 'rotate', shortcut: 'r', needsSelection: true },
    { id: 'scale', icon: '⤢', title: 'Resize · S', mode: 'scale', shortcut: 's', needsSelection: true },
    { separator: true },
    { id: 'clone', icon: '⧉', title: 'Clone / array · Ctrl+D', command: 'clone', needsSelection: true },
    { id: 'group', icon: '▣', title: 'Group / ungroup · Ctrl+G', command: 'group', needsSelection: true },
    { id: 'same', icon: '≡', title: 'Select same type', command: 'same', needsSelection: true },
    { separator: true },
    { id: 'delete', icon: '⌫', title: 'Delete · Del', command: 'delete', needsSelection: true }
  ];

  class EditorToolbar {
    constructor(host, options = {}) {
      ensureAuthoringStyles(); this.host = resolveHost(host); this.options = options; this.buttons = new Map(); this.items = arr(options.items?.length ? options.items : DEFAULT_TOOLBAR); if (this.host) this.host.classList.add('scene3d-toolbar'); this.render();
      this._key = e => this.keydown(e); if (options.shortcuts !== false) document.addEventListener('keydown', this._key);
    }
    render() {
      if (!this.host) return; this.host.textContent = ''; this.buttons.clear();
      for (const item of this.items) {
        if (item.separator) { this.host.appendChild(createNode('span', { class: 'scene3d-sep' })); continue; }
        const b = createNode('button', { type: 'button', id: item.domId || undefined, text: item.icon || item.label || item.id, title: asLabel(item.title, '') }); b.addEventListener('click', e => this.run(item, e)); this.host.appendChild(b); this.buttons.set(item.id, b);
      }
      this.refresh();
    }
    state() { return this.options.state?.() || {}; }
    refresh() {
      const st = this.state(); for (const item of this.items) { if (item.separator) continue; const b = this.buttons.get(item.id); if (!b) continue; const enabled = item.enabled ? item.enabled(st) : !(item.needsSelection && !(st.selectionCount > 0)); b.disabled = !enabled; b.classList.toggle('on', item.active ? !!item.active(st) : !!(item.mode && st.mode === item.mode)); }
    }
    run(item, e) { if (item.mode) this.options.onMode?.(item.mode, item, e); else this.options.onCommand?.(item.command || item.id, item, e); this.refresh(); }
    keydown(e) {
      if (e.defaultPrevented || e.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      if (this.options.onKey?.(e) === true) return;
      const key = e.key.toLowerCase(); let item = null;
      if ((e.ctrlKey || e.metaKey) && key === 'd') item = this.items.find(x => x.command === 'clone');
      else if ((e.ctrlKey || e.metaKey) && key === 'g') item = this.items.find(x => x.command === 'group');
      else if (key === 'delete' || key === 'backspace') item = this.items.find(x => x.command === 'delete');
      else item = this.items.find(x => x.shortcut && x.shortcut.toLowerCase() === key && !e.ctrlKey && !e.metaKey && !e.altKey);
      if (!item) return; const b = this.buttons.get(item.id); if (b?.disabled) return; e.preventDefault(); this.run(item, e);
    }
    destroy() { document.removeEventListener('keydown', this._key); }
  }

  class AuthoringShell {
    constructor(options = {}) {
      ensureAuthoringStyles(); this.options = options; this.controller = options.controller || null; this.adapter = options.adapter || this.controller?.adapter || {};
      this.placement = options.placement instanceof PlacementSession ? options.placement : new PlacementSession({ ...(options.placement || {}), onChange: (reason, p) => { options.placement?.onChange?.(reason, p); this.refresh('placement'); } });
      this.placementBadge = resolveHost(options.placementBadge);
      if (this.placementBadge) this.placementBadge.classList.add('scene3d-placement-badge');
      this.paletteHost = resolveHost(options.paletteHost);
      this.renderPalette();
      this.tree = options.treeHost ? new SceneTree(options.treeHost, { ...(options.tree || {}), getItems: () => options.tree?.getItems?.(this) || this.defaultTreeItems(), onSelect: (item, additive, e) => this.select(item.id, additive, e), onToggleLock: options.tree?.onToggleLock ? (item, e) => options.tree.onToggleLock(item, e, this) : undefined, onToggleHidden: options.tree?.onToggleHidden ? (item, e) => options.tree.onToggleHidden(item, e, this) : undefined, onContext: options.tree?.onContext ? (item, e) => options.tree.onContext(item, e, this) : undefined, onRename: options.tree?.onRename ? (item, name) => options.tree.onRename(item, name, this) : undefined }) : null;
      this.inspector = options.propertiesHost ? new PropertyInspector(options.propertiesHost, { ...(options.properties || {}), getSelection: () => this.selectionObjects(), getPrimary: () => this.primaryObject(), schema: ctx => options.properties?.schema?.(ctx, this) || [], beforeChange: (f, c, v) => { this.historyBefore(); options.properties?.beforeChange?.(f, c, v, this); }, afterChange: (f, c, v) => { options.properties?.afterChange?.(f, c, v, this); this.historyCheckpoint(); this.changed('property'); } }) : null;
      this.toolbar = options.toolbarHost ? new EditorToolbar(options.toolbarHost, { ...(options.toolbar || {}), state: () => this.toolbarState(), onMode: (m, i, e) => this.setMode(m, i, e), onCommand: (c, i, e) => this.command(c, i, e), onKey: e => this.placement.keydown(e) || options.toolbar?.onKey?.(e, this) }) : null;
      const search = resolveHost(options.searchHost); if (search && this.tree) search.addEventListener('input', () => this.tree.setQuery(search.value));
      this.refresh('init');
    }
    renderPalette() {
      if (!this.paletteHost) return;
      renderPalette(this.paletteHost, arr(typeof this.options.palette === 'function' ? this.options.palette(this) : this.options.palette), { className: this.options.paletteClassName || 'scene3d-palette-item', onPick: (item, e) => this.pickPalette(item, e), ...(this.options.paletteOptions || {}) });
    }
    get mode() { return this.options.getMode?.() ?? this._mode ?? 'select'; }
    setMode(mode, item, event) { if (this.placement.active) this.placement.cancel('mode'); if (this.options.setMode) this.options.setMode(mode, item, event, this); else this._mode = mode; this.changed('mode'); }
    objects() { return this.controller?.objects?.() || arr(this.adapter.getObjects?.()); }
    id(o) { return this.controller?.id?.(o) ?? (this.adapter.getId ? this.adapter.getId(o) : o?.id); }
    selectionIds() { if (this.controller?.selection) return new Set(this.controller.selection.ids); const v = this.options.getSelectionIds?.(); return new Set(v instanceof Set ? v : arr(v)); }
    selectionObjects() { const ids = this.selectionIds(); return this.objects().filter(o => ids.has(this.id(o))); }
    primaryObject() { const pid = this.controller?.selection?.primary ?? this.options.getPrimaryId?.(); return this.objects().find(o => this.id(o) === pid) || this.selectionObjects()[0] || null; }
    defaultTreeItems() { const ids = this.selectionIds(), primary = this.primaryObject(); return this.objects().map(o => ({ id: this.id(o), label: o.name ?? String(this.id(o)), kind: o.kind ?? o.type ?? '', selected: ids.has(this.id(o)), primary: primary ? this.id(primary) === this.id(o) : false, hidden: !!(o.uiHidden ?? o.hidden), locked: !!o.locked })); }
    select(id, additive, event) { if (this.controller?.selection) this.controller.selection.one(id, additive); else this.options.onSelect?.(id, additive, event, this); this.changed('selection'); }
    toolbarState() { return { mode: this.mode, selectionCount: this.selectionIds().size, placement: this.placement.active, canUndo: this.controller?.history?.canUndo?.() ?? this.options.canUndo?.(), canRedo: this.controller?.history?.canRedo?.() ?? this.options.canRedo?.(), shell: this }; }
    pickPalette(item, e) { this.placement.begin(item); this.options.onPalette?.(item, e, this); this.changed('placement'); }
    command(cmd, item, e) {
      if (this.options.commands?.[cmd]) this.options.commands[cmd](this, e, item);
      else if (cmd === 'delete') this.controller?.deleteSelection?.();
      else if (cmd === 'group') { if (this.controller?.exactGroup?.()) this.controller.ungroup(); else this.controller?.group(); }
      else if (cmd === 'undo') this.controller?.history?.undo(); else if (cmd === 'redo') this.controller?.history?.redo();
      this.changed('command:' + cmd);
    }
    historyBefore() { this.controller?.history?.beforeMutation?.(); this.options.historyBefore?.(this); }
    historyCheckpoint() { this.controller?.history?.checkpoint?.(); this.options.historyCheckpoint?.(this); }
    changed(reason) { this.options.onChange?.(reason, this); this.refresh(reason); }
    renderPlacement() {
      const b = this.placementBadge; if (!b) return;
      b.classList.toggle('on', this.placement.active);
      if (!this.placement.active) { b.textContent = ''; return; }
      const custom = this.options.placement?.label?.(this.placement, this);
      b.textContent = custom ?? `${asLabel(this.placement.item?.title ?? this.placement.item?.label, this.placement.item?.kind ?? this.placement.item?.id ?? 'Object')} · click = place · Esc = cancel · Shift-click = repeat`;
    }
    refresh(reason = 'refresh') { this.tree?.render(); this.inspector?.render(); this.toolbar?.refresh(); this.renderPlacement(); this.options.onRefresh?.(reason, this); }
    destroy() { this.toolbar?.destroy(); this.placement.cancel('destroy'); }
  }

  global.DiagramScene3D = Object.freeze({
    api: API, version: VERSION, clone, clamp, geometry, groups, Selection, History, Controller,
    cloneArray, bindSplitter, renderPalette, ContextMenu, shell, OrbitCamera, cameraRay, PlacementGhost, CanvasViewport,
    mixed, pathGet, pathSet, commonFieldValue, ensureAuthoringStyles, PlacementSession, SceneTree, PropertyInspector, EditorToolbar, AuthoringShell
  });
})(window);
