/* =====================================================================
   REACTOR_MODELS — библиотека трёхмерных моделей семи ядерных установок
   для «гаража» обучающей игры.

   Three.js: UMD-сборка с cdnjs, версия прибита явно:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.1/three.min.js"></script>
   0.160.1 — последняя версия на cdnjs, в которой ещё лежит UMD-файл
   three.min.js; он определяет глобал THREE (r160). Более новые версии
   на cdnjs выкладывают только ESM, которые под CSP страницы не поедут.

   Файл — обычный скрипт, без импортов. THREE приходит параметром
   build(THREE, palette); напрямую к глобалу здесь не обращаемся.
   Внешних текстур, шрифтов и моделей нет — только примитивы и
   процедурная геометрия.

   Все семь моделей построены как РАЗРЕЗНЫЕ: у оболочек вращения вынут
   сектор 30-150 градусов, у прямоугольных зданий — ближний квадрант
   (+X/+Z), направление выреза совпадает с «гаражной» камерой. Иначе
   наружное здание закрывает установку целиком и силуэт не читается.
   При вращении модели вырез проезжает мимо камеры, как у выставочного
   разрезного макета.

   Каждая модель строится в МЕТРАХ, потом центрируется по вертикали и
   делится на постоянный множитель, чтобы все семь жили в габарите
   порядка 14-18 условных единиц. fit — диаметр описанной сферы;
   camera.* лежат на расстоянии примерно 1.32 fit при вертикальном
   поле зрения 38 градусов.

   Сцену освещает вызывающая страница (материалы MeshStandardMaterial).
   Для разреза страница ставит renderer.localClippingEnabled = true и
   раскладывает плоскость по material.clippingPlanes; поэтому все
   материалы здесь двусторонние, а полые объёмы (корпуса, оболочки,
   барботёр, трубопроводы) имеют настоящую толщину стенки.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------
     Набор инструментов. Создаётся заново на каждый build(), поэтому
     материалы у каждой модели свои — игра может независимо вешать
     на них clippingPlanes и подсветку.
     --------------------------------------------------------------- */
  function Kit(THREE, palette) {
    var P = palette || {};
    /* Собственных цветов не задаём: всё из палитры страницы.
       Если токена нет — деградируем на соседний токен, и лишь в самом
       конце на нейтральный серый, чтобы модель не исчезла совсем. */
    var CHAIN = {
      ground:  ['ground', 'surface', 'line'],
      surface: ['surface', 'ground', 'line'],
      line:    ['line', 'surface', 'text'],
      text:    ['text', 'line'],
      accent:  ['accent', 'ochre', 'text'],
      steel:   ['steel', 'line', 'text'],
      ochre:   ['ochre', 'accent', 'text'],
      magnox:  ['magnox', 'steel', 'line']
    };
    function tone(name) {
      var chain = CHAIN[name] || [name];
      for (var i = 0; i < chain.length; i++) {
        var v = P[chain[i]];
        if (typeof v === 'string' && v) return v;
      }
      return '#808080';
    }
    function col(name) { return new THREE.Color(tone(name)); }

    function std(token, o) {
      var base = { color: col(token), roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide };
      if (o) for (var k in o) base[k] = o[k];
      return new THREE.MeshStandardMaterial(base);
    }

    var M = {
      base:     std('ground',  { roughness: 1.0 }),
      concrete: std('surface', { roughness: 0.96, metalness: 0.0 }),
      frame:    std('line',    { roughness: 0.88, metalness: 0.05 }),
      graphite: std('text',    { roughness: 1.0, metalness: 0.0 }),
      steel:    std('steel',   { roughness: 0.40, metalness: 0.65 }),
      steelDull:std('steel',   { roughness: 0.80, metalness: 0.25 }),
      fuel:     std('ochre',   { roughness: 0.45, metalness: 0.40 }),
      clad:     std('magnox',  { roughness: 0.48, metalness: 0.38 }),
      hot:      std('accent',  { roughness: 0.50, metalness: 0.15,
                                 emissive: col('accent'), emissiveIntensity: 0.18 }),
      water:    std('steel',   { roughness: 0.15, metalness: 0.0,
                                 transparent: true, opacity: 0.38 }),
      glow:     std('accent',  { roughness: 0.4, metalness: 0.0,
                                 transparent: true, opacity: 0.22,
                                 emissive: col('accent'), emissiveIntensity: 0.85 })
    };
    var EDGE = new THREE.LineBasicMaterial({ color: col('text'), transparent: true, opacity: 0.42 });

    /* ---------- мелочь ---------- */
    function grp(id) { var g = new THREE.Group(); if (id) g.userData.id = id; return g; }
    function put(o, x, y, z) { o.position.set(x || 0, y || 0, z || 0); return o; }
    function rot(o, x, y, z) { o.rotation.set(x || 0, y || 0, z || 0); return o; }
    function tag(o, id) { if (id) o.userData.id = id; return o; }
    function mesh(geo, mat, id) { return tag(new THREE.Mesh(geo, mat), id); }
    function edged(m, deg) {
      var e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, deg === undefined ? 32 : deg), EDGE);
      e.userData.edge = true;
      m.add(e);
      return m;
    }

    /* ---------- геометрия ----------
       Все «полые» тела строятся LatheGeometry по ЗАМКНУТОМУ профилю
       (наружная стенка вверх, внутренняя вниз). Такое тело водонепроницаемо
       и в разрезе даёт настоящее кольцо стенки, а не пустоту.            */
    function lathe(pts, seg, phiStart, phiLen) {
      var v = [];
      for (var i = 0; i < pts.length; i++) v.push(new THREE.Vector2(Math.max(pts[i][0], 1e-4), pts[i][1]));
      v.push(v[0].clone());                       // замыкаем профиль
      return new THREE.LatheGeometry(v, seg || 48, phiStart || 0,
        phiLen === undefined ? Math.PI * 2 : phiLen);
    }

    /* труба со стенкой: ось +Y, нижний торец в 0 */
    function pipeGeo(ro, wall, len, seg) {
      var ri = Math.max(ro - wall, 1e-3);
      return lathe([[ri, 0], [ro, 0], [ro, len], [ri, len]], seg || 24);
    }
    /* цилиндрическая обечайка с эллиптическими днищами (корпус реактора) */
    function vesselProfile(R, wall, hCyl, kBot, kTop, seg) {
      var Ri = Math.max(R - wall, 1e-3), p = [], i, a;
      seg = seg || 12;
      for (i = 0; i <= seg; i++) { a = -Math.PI / 2 + i / seg * Math.PI / 2; p.push([R * Math.cos(a), kBot * R * Math.sin(a)]); }
      p.push([R, hCyl]);
      for (i = 0; i <= seg; i++) { a = i / seg * Math.PI / 2; p.push([R * Math.cos(a), hCyl + kTop * R * Math.sin(a)]); }
      for (i = seg; i >= 0; i--) { a = i / seg * Math.PI / 2; p.push([Ri * Math.cos(a), hCyl + kTop * Ri * Math.sin(a)]); }
      p.push([Ri, 0]);
      for (i = seg; i >= 0; i--) { a = -Math.PI / 2 + i / seg * Math.PI / 2; p.push([Ri * Math.cos(a), kBot * Ri * Math.sin(a)]); }
      return p;
    }
    /* цилиндр + сферический купол (гермооболочка, здание) */
    function domeProfile(R, wall, hCyl, seg) {
      var Ri = Math.max(R - wall, 1e-3), p = [], i, a;
      seg = seg || 14;
      p.push([R, 0]); p.push([R, hCyl]);
      for (i = 1; i <= seg; i++) { a = i / seg * Math.PI / 2; p.push([R * Math.cos(a), hCyl + R * Math.sin(a)]); }
      for (i = seg; i >= 1; i--) { a = i / seg * Math.PI / 2; p.push([Ri * Math.cos(a), hCyl + Ri * Math.sin(a)]); }
      p.push([Ri, hCyl]); p.push([Ri, 0]);
      return p;
    }
    /* кольцевой бак: два вертикальных цилиндра + дно + крышка */
    function annulusTank(ro, ri, h, lid) {
      var p = [[ri, 0], [ro, 0], [ro, h], [ri, h]];
      return lathe(p, 40);
    }

    function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
    function cyl(r, h, seg, r2) { return new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, h, seg || 20); }
    function sph(r, a, b) { return new THREE.SphereGeometry(r, a || 20, b || 14); }
    function torus(R, t, a, b) { return new THREE.TorusGeometry(R, t, a || 16, b || 48); }

    /* прямоугольная коробка со стенками настоящей толщины:
       4 стены + пол + (опционально) крыша, передняя стена может быть снята
       для «разрезного» показа внутренностей.                              */
    function hollowBox(w, h, d, wall, opts) {
      opts = opts || {};
      var mt = opts.material || M.concrete, g = new THREE.Group(), m;
      var cut = opts.cut !== false;      // по умолчанию вынут ближний квадрант +X/+Z
      var hw = w / 2, hd = d / 2, iw = w - 2 * wall;
      if (opts.floor !== false) {          // пол: целиком, три четверти или половина
        if (opts.floor === 'half') {
          m = edged(mesh(box(w, wall, hd), mt)); put(m, 0, wall / 2, -hd / 2); g.add(m);
        } else if (cut) {
          m = edged(mesh(box(w, wall, hd), mt)); put(m, 0, wall / 2, -hd / 2); g.add(m);
          m = edged(mesh(box(hw, wall, hd), mt)); put(m, -hw / 2, wall / 2, hd / 2); g.add(m);
        } else { m = edged(mesh(box(w, wall, d), mt)); put(m, 0, wall / 2, 0); g.add(m); }
      }
      if (opts.roof) {
        if (cut) {
          m = edged(mesh(box(w, wall, hd), mt)); put(m, 0, h - wall / 2, -hd / 2); g.add(m);
          m = edged(mesh(box(hw, wall, hd), mt)); put(m, -hw / 2, h - wall / 2, hd / 2); g.add(m);
        } else { m = edged(mesh(box(w, wall, d), mt)); put(m, 0, h - wall / 2, 0); g.add(m); }
      }
      m = edged(mesh(box(wall, h, d), mt)); put(m, -hw + wall / 2, h / 2, 0); g.add(m);          // дальняя -X
      m = edged(mesh(box(iw, h, wall), mt)); put(m, 0, h / 2, -hd + wall / 2); g.add(m);         // дальняя -Z
      if (opts.nearHalf) {
        /* ближние стены сняты целиком — так видно, что стоит в объёме */
      } else if (cut) {
        m = edged(mesh(box(wall, h, hd), mt)); put(m, hw - wall / 2, h / 2, -hd / 2); g.add(m);
        m = edged(mesh(box(hw - wall, h, wall), mt)); put(m, -(hw + wall) / 2, h / 2, hd - wall / 2); g.add(m);
      } else {
        m = edged(mesh(box(wall, h, d), mt)); put(m, hw - wall / 2, h / 2, 0); g.add(m);
        m = edged(mesh(box(iw, h, wall), mt)); put(m, 0, h / 2, hd - wall / 2); g.add(m);
      }
      return g;
    }

    /* InstancedMesh по списку [x,y,z,(rx,ry,rz),(sx,sy,sz)] */
    function inst(geo, mat, xs, id) {
      var im = new THREE.InstancedMesh(geo, mat, xs.length), d = new THREE.Object3D(), i, t;
      for (i = 0; i < xs.length; i++) {
        t = xs[i];
        d.position.set(t[0] || 0, t[1] || 0, t[2] || 0);
        d.rotation.set(t[3] || 0, t[4] || 0, t[5] || 0);
        d.scale.set(t[6] === undefined ? 1 : t[6], t[7] === undefined ? 1 : t[7], t[8] === undefined ? 1 : t[8]);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      return tag(im, id);
    }

    /* квадратная решётка точек внутри круга радиуса R */
    function lattice(R, pitch) {
      var out = [], n = Math.ceil(R / pitch), i, j, x, z;
      for (i = -n; i <= n; i++) for (j = -n; j <= n; j++) {
        x = i * pitch; z = j * pitch;
        if (Math.sqrt(x * x + z * z) <= R) out.push([x, z]);
      }
      return out;
    }
    function ring(n, R, phase) {
      var out = [], i, a;
      for (i = 0; i < n; i++) { a = (phase || 0) + i / n * Math.PI * 2; out.push([R * Math.cos(a), R * Math.sin(a), a]); }
      return out;
    }

    /* трасса трубопровода по ломаной, со стенкой и шаровыми отводами */
    function pipeRun(pts, ro, wall, mat, seg) {
      var g = new THREE.Group(), i, a, b, len, m, q;
      var up = new THREE.Vector3(0, 1, 0);
      for (i = 0; i < pts.length - 1; i++) {
        a = new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]);
        b = new THREE.Vector3(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
        len = a.distanceTo(b); if (len < 1e-3) continue;
        m = new THREE.Mesh(pipeGeo(ro, wall, len, seg || 18), mat);
        m.position.copy(a);
        q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
        m.quaternion.copy(q);
        g.add(m);
      }
      for (i = 1; i < pts.length - 1; i++) {
        m = new THREE.Mesh(sph(ro, 14, 10), mat);
        m.position.set(pts[i][0], pts[i][1], pts[i][2]);
        g.add(m);
      }
      return g;
    }

    /* типовая арматура: корпус задвижки/клапана на трубе */
    function valveBody(r, mat) {
      var g = new THREE.Group();
      g.add(edged(mesh(cyl(r * 1.55, r * 2.0, 14), mat)));
      g.add(put(edged(mesh(cyl(r * 1.9, r * 0.28, 16), mat)), 0, r * 1.0, 0));
      g.add(put(edged(mesh(cyl(r * 1.9, r * 0.28, 16), mat)), 0, -r * 1.0, 0));
      return g;
    }
    /* электропривод + сальник над задвижкой */
    function valveDrive(r, matA, matB) {
      var g = new THREE.Group();
      g.add(put(edged(mesh(cyl(r * 0.22, r * 2.2, 10), matA)), 0, r * 1.1, 0));
      g.add(put(edged(mesh(cyl(r * 0.62, r * 0.7, 12), matA)), 0, r * 0.35, 0));
      g.add(put(edged(mesh(box(r * 1.5, r * 1.1, r * 1.1), matB)), 0, r * 2.6, 0));
      return g;
    }
    /* решётчатая опора ЛЭП — целиком из тонких коробок */
    function pylon(h, w, mat) {
      var g = new THREE.Group(), i, t = h / 6, s;
      for (i = 0; i < 4; i++) {
        var sx = (i < 2 ? -1 : 1), sz = (i % 2 ? -1 : 1);
        s = edged(mesh(box(w * 0.09, h, w * 0.09), mat));
        put(s, sx * w * 0.42, h / 2, sz * w * 0.42);
        s.rotation.z = -sx * 0.06; s.rotation.x = sz * 0.06;
        g.add(s);
      }
      for (i = 1; i <= 5; i++) {
        s = edged(mesh(box(w * 0.92, w * 0.07, w * 0.07), mat)); put(s, 0, i * t, -w * 0.42); g.add(s);
        s = edged(mesh(box(w * 0.92, w * 0.07, w * 0.07), mat)); put(s, 0, i * t, w * 0.42); g.add(s);
      }
      for (i = 0; i < 2; i++) {
        s = edged(mesh(box(w * 2.2, w * 0.10, w * 0.10), mat)); put(s, 0, h - w * (0.3 + i * 0.85), 0); g.add(s);
      }
      return g;
    }

    return {
      THREE: THREE, M: M, EDGE: EDGE, tone: tone, col: col,
      grp: grp, put: put, rot: rot, tag: tag, mesh: mesh, edged: edged,
      lathe: lathe, pipeGeo: pipeGeo, vesselProfile: vesselProfile, domeProfile: domeProfile,
      annulusTank: annulusTank, box: box, cyl: cyl, sph: sph, torus: torus,
      hollowBox: hollowBox, inst: inst, lattice: lattice, ring: ring,
      pipeRun: pipeRun, valveBody: valveBody, valveDrive: valveDrive, pylon: pylon
    };
  }

  /* Обёртка: строим в метрах внутри body, потом сдвигаем центр в 0
     и делим на D, чтобы все семь установок жили примерно в одном
     габарите порядка 12 условных единиц. */
  function frame(THREE, D, yc) {
    var root = new THREE.Group(), body = new THREE.Group();
    body.position.y = -yc;
    root.add(body);
    root.scale.setScalar(1 / D);
    return { root: root, body: body };
  }

  /* =================================================================
     1. PILE — Chicago Pile-1 / Windscale Pile
     ================================================================= */
  function buildPILE(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 2.9, 10.3), B = F.body, i, j, m, g, t;

    /* --- здание: бетонная биологическая защита, труба, фильтр --- */
    var building = K.grp('building');
    var shield = K.hollowBox(15, 11, 15, 1.6, { material: M.concrete });
    building.add(shield);
    /* перекрытие-«стол» над кладкой и балкон зарядной стороны */
    building.add(K.put(K.edged(K.mesh(K.box(15, 0.7, 4.2), M.concrete)), 0, 11.35, -5.4));
    /* труба Уиндскейла с фильтровальной галереей Кокрофта на оголовке */
    var st = K.grp();
    st.add(K.put(K.mesh(K.pipeGeo(1.35, 0.26, 22, 26), M.concrete), 0, 0.6, 0));
    var gal = K.grp();
    gal.add(K.put(K.mesh(K.pipeGeo(2.45, 0.4, 3.6, 30), M.concrete), 0, 17.2, 0));
    gal.add(K.put(K.edged(K.mesh(K.cyl(2.7, 0.45, 30), M.concrete)), 0, 21.0, 0));
    gal.add(K.put(K.edged(K.mesh(K.cyl(2.7, 0.45, 30), M.concrete)), 0, 17.0, 0));
    var lv = [];
    for (i = 0; i < 24; i++) {
      var a = i / 24 * Math.PI * 2;
      lv.push([2.5 * Math.cos(a), 19.0, 2.5 * Math.sin(a), 0, -a, 0]);
    }
    gal.add(K.inst(K.box(0.14, 2.9, 0.7), M.frame, lv));
    st.add(gal);
    K.put(st, 5.8, 0, -7.6);
    building.add(st);
    B.add(building); P.building = building;

    /* --- графитовая кладка: слои блоков, приближённый эллипсоид --- */
    var stack = K.grp('graphite_stack');
    var N = 19, th = 0.34, y0 = 2.5, RMAX = 4.55, H = 3.55, ymid = y0 + N * th / 2;
    for (i = 0; i < N; i++) {
      var y = y0 + (i + 0.5) * th;
      var k = (y - ymid) / H;
      var r = RMAX * Math.sqrt(Math.max(1 - k * k, 0.02));
      if (i % 2 === 0) {                               // курс из четырёх блоков-квадрантов
        for (j = 0; j < 4; j++) {
          m = K.edged(K.mesh(K.box(r - 0.05, th - 0.04, r - 0.05), M.graphite));
          K.put(m, (j < 2 ? -1 : 1) * r / 2, y, (j % 2 ? -1 : 1) * r / 2);
          stack.add(m);
        }
      } else {                                         // курс, положенный «в перевязку»
        m = K.edged(K.mesh(K.cyl(r * 1.06, th - 0.04, 8), M.graphite));
        K.put(m, 0, y, 0); m.rotation.y = Math.PI / 8;
        stack.add(m);
      }
    }
    B.add(stack); P.graphite_stack = stack;

    /* активная зона — линза внутри кладки */
    var core = K.tag(K.mesh(K.sph(2.6, 24, 16), M.glow), 'core');
    core.scale.set(1, 0.62, 1); K.put(core, 0, ymid, 0);
    B.add(core); P.core = core;

    /* --- горизонтальные каналы охлаждения сквозь кладку --- */
    var pos = K.lattice(3.9, 0.72), ch = [];
    for (i = 0; i < pos.length; i++) {
      var cy = ymid + pos[i][1], ck = (cy - ymid) / H;
      var cr = RMAX * Math.sqrt(Math.max(1 - ck * ck, 0.02));
      var half = Math.sqrt(Math.max(cr * cr - pos[i][0] * pos[i][0], 0.09)) + 0.35;
      ch.push([pos[i][0], cy, -half, Math.PI / 2, 0, 0, 1, half * 2 / 9.6, 1]);
    }
    var chan = K.inst(K.pipeGeo(0.14, 0.05, 9.6, 10), M.steelDull, ch, 'coolant_channel');
    B.add(chan); P.coolant_channel = chan;

    /* --- топливо: пруток, оболочка, готовый патрон --- */
    var slug = K.tag(K.grp(), 'fuel_slug');
    slug.add(K.edged(K.mesh(K.cyl(0.155, 0.92, 16), M.fuel)));
    K.put(slug, -2.0, 7.1, 8.3); K.rot(slug, Math.PI / 2, 0, 0);
    B.add(slug); P.fuel_slug = slug;

    var can = K.tag(K.grp(), 'fuel_can');
    can.add(K.edged(K.mesh(K.pipeGeo(0.215, 0.055, 1.05, 18), M.clad)));
    for (i = 0; i < 6; i++) can.add(K.put(K.mesh(K.torus(0.235, 0.035, 8, 20), M.clad), 0, 0.16 + i * 0.15, 0));
    K.put(can, -0.8, 7.1, 8.3); K.rot(can, Math.PI / 2, 0, 0);
    B.add(can); P.fuel_can = can;

    var cart = K.tag(K.grp(), 'fuel_cartridge');
    cart.add(K.edged(K.mesh(K.cyl(0.21, 1.1, 18), M.clad)));
    cart.add(K.put(K.edged(K.mesh(K.cyl(0.10, 0.22, 12), M.clad)), 0, 0.64, 0));
    cart.add(K.put(K.edged(K.mesh(K.cyl(0.10, 0.22, 12), M.clad)), 0, -0.64, 0));
    for (i = 0; i < 7; i++) cart.add(K.put(K.mesh(K.torus(0.235, 0.032, 8, 20), M.clad), 0, -0.45 + i * 0.15, 0));
    K.put(cart, 0.6, 7.1, 8.4); K.rot(cart, Math.PI / 2, 0, 0);
    B.add(cart); P.fuel_cartridge = cart;

    /* --- стержни сверху на тросах --- */
    var gantry = K.grp();
    gantry.add(K.put(K.edged(K.mesh(K.box(12.4, 0.45, 0.6), M.steelDull)), 0, 15.4, -1.6));
    gantry.add(K.put(K.edged(K.mesh(K.box(12.4, 0.45, 0.6), M.steelDull)), 0, 15.4, 1.6));
    for (i = 0; i < 2; i++)
      gantry.add(K.put(K.edged(K.mesh(K.box(0.4, 4.4, 0.4), M.steelDull)), (i ? 1 : -1) * 5.9, 13.2, 0));
    B.add(gantry);

    var rods = K.grp('control_rods');
    var rx = [-2.7, -1.35, 1.35, 2.7, 0];
    for (i = 0; i < rx.length; i++) {
      var rg = K.grp();
      var drop = 5.2 + (i % 2) * 0.8;
      rg.add(K.put(K.edged(K.mesh(K.cyl(0.085, drop, 10), M.hot)), 0, 9.6 - drop / 2, 0));
      rg.add(K.put(K.mesh(K.cyl(0.018, 5.4, 6), M.steel), 0, 12.4, 0));           // трос
      rg.add(K.put(K.edged(K.mesh(K.cyl(0.32, 0.5, 14), M.steelDull)), 0, 15.35, 0)); // лебёдка
      rg.add(K.put(K.edged(K.mesh(K.pipeGeo(0.17, 0.05, 2.6, 12), M.steelDull)), 0, 9.0, 0));
      K.put(rg, rx[i], 0, -1.1 + (i % 2) * 2.2);
      rods.add(rg);
    }
    B.add(rods); P.control_rods = rods;

    /* один стержень, вынутый на три четверти */
    var one = K.grp('single_rod');
    one.add(K.put(K.edged(K.mesh(K.cyl(0.085, 5.2, 10), M.hot)), 0, 11.4, 0));
    one.add(K.put(K.mesh(K.cyl(0.018, 2.0, 6), M.steel), 0, 15.0, 0));
    one.add(K.put(K.edged(K.mesh(K.cyl(0.32, 0.5, 14), M.steelDull)), 0, 15.35, 0));
    one.add(K.put(K.edged(K.mesh(K.pipeGeo(0.17, 0.05, 2.6, 12), M.steelDull)), 0, 9.0, 0));
    K.put(one, 4.05, 0, 1.1);
    B.add(one); P.single_rod = one;

    /* --- направляющая ZIP-стержня: труба, груз на верёвке, топор --- */
    var zip = K.grp('zip_rod_guide');
    zip.add(K.put(K.mesh(K.pipeGeo(0.29, 0.075, 11.2, 16), M.steelDull), 0, 2.4, 0));
    zip.add(K.put(K.edged(K.mesh(K.cyl(0.12, 2.3, 10), M.hot)), 0, 12.6, 0));
    zip.add(K.put(K.mesh(K.cyl(0.02, 2.2, 6), M.steel), 0, 14.9, 0));
    zip.add(K.put(K.edged(K.mesh(K.box(0.5, 0.5, 0.5), M.frame)), 0, 16.2, 0));     // груз
    zip.add(K.put(K.edged(K.mesh(K.box(0.08, 0.12, 0.55), M.hot)), 0.45, 16.0, 0)); // топор у каната
    K.put(zip, -4.4, 0, 2.6);
    B.add(zip); P.zip_rod_guide = zip;

    /* --- пост оператора: площадка, ограждение, фигура --- */
    var op = K.grp('operator_position');
    op.add(K.put(K.edged(K.mesh(K.box(4.6, 0.22, 2.4), M.steelDull)), 0, 0, 0));
    for (i = 0; i < 5; i++) op.add(K.put(K.edged(K.mesh(K.box(0.09, 1.05, 0.09), M.steelDull)), -2.1 + i * 1.05, 0.63, 1.1));
    op.add(K.put(K.edged(K.mesh(K.box(4.6, 0.09, 0.09), M.steelDull)), 0, 1.15, 1.1));
    op.add(K.put(K.edged(K.mesh(K.cyl(0.24, 1.25, 12), M.hot)), -1.2, 0.74, 0.1));
    op.add(K.put(K.mesh(K.sph(0.22, 14, 10), M.hot), -1.2, 1.5, 0.1));
    op.add(K.put(K.edged(K.mesh(K.box(1.5, 0.95, 0.6), M.steelDull)), 1.2, 0.6, -0.2));  // пульт
    K.put(op, 0, 9.5, 8.6);
    B.add(op); P.operator_position = op;

    /* --- воздушное охлаждение: пленум, вентиляторы, газоходы --- */
    var cooling = K.grp('all_cooling');
    cooling.add(K.put(K.edged(K.mesh(K.box(14.0, 4.2, 2.6), M.concrete)), 0, 2.4, 9.6)); // напорный пленум
    cooling.add(K.put(K.edged(K.mesh(K.box(13.0, 2.4, 2.4), M.steelDull)), 0, 2.4, 7.2)); // подводящий короб
    /* сбросной газоход от тыльной стороны кладки к основанию трубы */
    cooling.add(K.pipeRun([[0, 9.6, -7.6], [0, 9.6, -9.4], [6.4, 9.6, -9.4], [6.4, 4.0, -8.4]], 1.05, 0.14, M.steelDull, 20));

    var fans = K.grp('cooling_fans');
    for (i = 0; i < 4; i++) {
      var fg = K.grp();
      fg.add(K.mesh(K.torus(1.02, 0.18, 10, 26), M.steel));
      fg.add(K.rot(K.edged(K.mesh(K.cyl(0.3, 0.7, 14), M.steelDull)), Math.PI / 2, 0, 0));
      for (j = 0; j < 7; j++) {
        var bl = K.edged(K.mesh(K.box(0.9, 0.06, 0.34), M.steel));
        bl.rotation.z = j / 7 * Math.PI * 2; bl.rotation.x = 0.4;
        K.put(bl, 0.62 * Math.cos(j / 7 * Math.PI * 2), 0.62 * Math.sin(j / 7 * Math.PI * 2), 0);
        fg.add(bl);
      }
      fg.add(K.put(K.edged(K.mesh(K.box(1.0, 1.1, 1.2), M.steelDull)), 0, -1.6, -0.9)); // электродвигатель
      K.put(fg, -4.8 + i * 3.2, 2.5, 10.95);
      fans.add(fg);
    }
    cooling.add(fans);
    B.add(cooling); P.all_cooling = cooling; P.cooling_fans = fans;

    /* грунт площадки */
    B.add(K.put(K.edged(K.mesh(K.box(28, 0.5, 30), M.base)), 0, -0.25, 1.0));

    return { group: F.root, parts: P };
  }

  /* Разрезная оболочка вращения: сектор ~70° вынут и смотрит в сторону
     «гаражной» камеры (+X/+Z), чтобы внутренности были видны, а силуэт
     сохранялся. phi=0 у LatheGeometry смотрит в +Z. */
  var TAU = Math.PI * 2;
  function openLathe(K, pts, seg, gapDeg) {
    var g = (gapDeg === undefined ? 72 : gapDeg) * Math.PI / 360;
    return K.lathe(pts, seg || 56, Math.PI * 0.25 + g, TAU - 2 * g);
  }

  /* =================================================================
     2. MAGNOX — Calder Hall: стальной корпус, 4 наружных парогенератора,
        магистрали CO2, газодувки снизу
     ================================================================= */
  function buildMAGNOX(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 4.7, 14.5), B = F.body, i, j, a, m, g;

    /* --- здание реактора: бетонный блок + биологическая защита --- */
    var bld = K.grp('reactor_building');
    bld.add(K.hollowBox(22, 26, 22, 1.0, { material: M.concrete }));
    bld.add(K.mesh(openLathe(K, [[9.0, 0], [9.0, 21], [6.8, 21], [6.8, 0]], 56, 124), M.concrete)); // биозащита
    bld.add(K.put(K.edged(K.mesh(K.box(22, 0.8, 11), M.concrete)), 0, 26.4, -5.5));                 // зарядный пол
    bld.add(K.put(K.edged(K.mesh(K.box(11, 0.8, 11), M.concrete)), -5.5, 26.4, 5.5));
    /* перегрузочная машина на зарядном полу */
    bld.add(K.put(K.edged(K.mesh(K.box(20, 0.6, 1.0), M.frame)), 0, 30.0, -2.4));
    bld.add(K.put(K.edged(K.mesh(K.box(20, 0.6, 1.0), M.frame)), 0, 30.0, 2.4));
    bld.add(K.put(K.edged(K.mesh(K.cyl(1.35, 4.2, 18), M.steelDull)), 2.6, 28.6, 0));
    B.add(bld); P.reactor_building = bld;

    /* --- корпус давления: сталь, цилиндр 11.3 м с торосферическими днищами --- */
    var vessel = K.grp('pressure_vessel');
    vessel.add(K.mesh(openLathe(K, K.vesselProfile(5.65, 0.22, 14, 0.55, 0.55, 12), 56, 66), M.steel));
    K.put(vessel, 0, 4.0, 0);
    B.add(vessel); P.pressure_vessel = vessel;

    /* --- проходки: стояки перегрузки на куполе и боковой патрубок --- */
    var pen = K.grp('vessel_penetration');
    var sp = [];
    for (i = 0; i < 20; i++) { a = i / 20 * TAU; sp.push([2.1 * Math.cos(a), 0, 2.1 * Math.sin(a)]); }
    for (i = 0; i < 12; i++) { a = (i + 0.5) / 12 * TAU; sp.push([3.7 * Math.cos(a), -0.35, 3.7 * Math.sin(a)]); }
    pen.add(K.put(K.inst(K.pipeGeo(0.25, 0.07, 2.3, 10), M.steelDull, sp), 0, 20.2, 0));
    pen.add(K.put(K.inst(K.cyl(0.33, 0.22, 12), M.hot, sp), 0, 22.6, 0));
    m = K.mesh(K.pipeGeo(0.95, 0.12, 2.4, 20), M.steel);
    K.put(m, 5.2, 16.4, 0); K.rot(m, 0, 0, -Math.PI / 2); pen.add(m);
    B.add(pen); P.vessel_penetration = pen;

    /* --- графитовая кладка внутри корпуса --- */
    var core = K.grp();
    for (i = 0; i < 4; i++) core.add(K.put(K.edged(K.mesh(K.cyl(4.6, 1.55, 24), M.graphite)), 0, 6.5 + i * 1.6, 0));
    B.add(core);

    /* --- топливные каналы --- */
    var lat = K.lattice(4.25, 0.56), fc = [];
    for (i = 0; i < lat.length; i++) fc.push([lat[i][0], 5.9, lat[i][1]]);
    var fchan = K.inst(K.pipeGeo(0.055, 0.018, 6.9, 8), M.steelDull, fc, 'fuel_channel');
    B.add(fchan); P.fuel_channel = fchan;

    /* --- каналы и стержни СУЗ --- */
    var rc = K.grp('rod_channel');
    for (i = 0; i < 10; i++) {
      a = i / 10 * TAU;
      var rr = (i % 2 ? 2.0 : 3.4);
      var x = rr * Math.cos(a), z = rr * Math.sin(a);
      rc.add(K.put(K.mesh(K.pipeGeo(0.15, 0.05, 15.5, 10), M.steelDull), x, 6.0, z));
      rc.add(K.put(K.edged(K.mesh(K.cyl(0.085, 6.4, 8), M.hot)), x, 9.4, z));
      rc.add(K.put(K.edged(K.mesh(K.box(0.55, 0.9, 0.55), M.steelDull)), x, 22.1, z));
    }
    B.add(rc); P.rod_channel = rc;

    /* --- топливо: урановый пруток и магноксовая оболочка с рёбрами --- */
    var fe = K.tag(K.grp(), 'fuel_element');
    fe.add(K.edged(K.mesh(K.cyl(0.145, 0.98, 16), M.fuel)));
    K.put(fe, -3.4, 27.3, 7.4); K.rot(fe, 0, 0, Math.PI / 2);
    B.add(fe); P.fuel_element = fe;

    var fcan = K.tag(K.grp(), 'fuel_can');
    fcan.add(K.edged(K.mesh(K.pipeGeo(0.185, 0.04, 1.06, 18), M.clad)));
    for (i = 0; i < 9; i++) {
      var fin = K.mesh(K.torus(0.235, 0.028, 6, 18), M.clad);
      K.put(fin, 0, 0.08 + i * 0.115, 0); fin.rotation.z = 0.12; fcan.add(fin);
    }
    K.put(fcan, -1.8, 27.3, 7.4); K.rot(fcan, 0, 0, Math.PI / 2);
    B.add(fcan); P.fuel_can = fcan;

    /* --- парогенераторы (снаружи блока, как в Колдер-Холле) --- */
    var BR = 15.2, boilers = K.grp(), tubes = K.grp('boiler_tube');
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2;
      var bx = BR * Math.cos(a), bz = BR * Math.sin(a);
      var sh = K.mesh(openLathe(K, K.domeProfile(2.85, 0.16, 21.5, 12), 48, 62), M.steel);
      K.put(sh, bx, 2.2, bz); boilers.add(sh);
      boilers.add(K.put(K.edged(K.mesh(K.cyl(3.15, 0.5, 40), M.steelDull)), bx, 2.0, bz));
      /* пучок трубок: вертикальные ветви + гибы наверху */
      var tb = [], tl = K.lattice(1.85, 0.62);
      for (j = 0; j < tl.length; j++) tb.push([tl[j][0], 0, tl[j][1]]);
      tubes.add(K.put(K.inst(K.pipeGeo(0.085, 0.028, 17.5, 8), M.steelDull, tb), bx, 3.4, bz));
      var bends = [];
      for (j = 0; j < tl.length; j += 2) bends.push([tl[j][0], 0, tl[j][1], Math.PI / 2, 0, 0]);
      tubes.add(K.put(K.inst(K.torus(0.31, 0.085, 6, 14), M.steelDull, bends), bx, 21.0, bz));
      /* коллекторы пара и питательной воды */
      boilers.add(K.put(K.edged(K.mesh(K.cyl(0.55, 1.0, 14), M.steelDull)), bx, 24.6, bz));
      boilers.add(K.put(K.edged(K.mesh(K.cyl(0.55, 1.0, 14), M.steelDull)), bx, 3.0, bz));
    }
    B.add(boilers); B.add(tubes); P.boiler_tube = tubes;

    /* --- магистральные газоходы CO2 --- */
    var duct = K.grp('co2_duct');
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      /* горячий: верх корпуса -> верх парогенератора */
      duct.add(K.pipeRun([[5.2 * ca, 19.4, 5.2 * sa], [11.4 * ca, 19.4, 11.4 * sa],
                          [BR * ca, 19.4, BR * sa], [BR * ca, 23.0, BR * sa]], 0.82, 0.10, M.steelDull, 20));
      /* холодный: низ парогенератора -> газодувки -> низ корпуса */
      duct.add(K.pipeRun([[BR * ca, 2.6, BR * sa], [11.2 * ca, 2.6, 11.2 * sa],
                          [11.2 * ca, 5.4, 11.2 * sa], [5.4 * ca, 5.4, 5.4 * sa]], 0.82, 0.10, M.steelDull, 20));
    }
    B.add(duct); P.co2_duct = duct;

    /* --- газодувки и их питание --- */
    var blow = K.grp('blower_supply');
    for (i = 0; i < 8; i++) {
      a = Math.floor(i / 2) * Math.PI / 2 + (i % 2 ? 0.22 : -0.22);
      var bx2 = 11.6 * Math.cos(a), bz2 = 11.6 * Math.sin(a);
      blow.add(K.put(K.edged(K.mesh(K.cyl(1.15, 1.5, 20), M.steel)), bx2, 2.2, bz2));   // улитка
      blow.add(K.put(K.edged(K.mesh(K.cyl(0.72, 2.0, 16), M.steelDull)), bx2, 3.9, bz2)); // электродвигатель
      blow.add(K.put(K.edged(K.mesh(K.box(1.3, 2.4, 0.9), M.hot)), bx2 * 1.28, 1.2, bz2 * 1.28)); // ячейка КРУ
    }
    for (i = 0; i < 4; i++) {   // кабельные эстакады к ячейкам
      a = i * Math.PI / 2;
      blow.add(K.pipeRun([[9.0 * Math.cos(a), 5.4, 9.0 * Math.sin(a)],
                          [14.8 * Math.cos(a), 5.4, 14.8 * Math.sin(a)]], 0.28, 0.07, M.frame, 10));
    }
    B.add(blow); P.blower_supply = blow;

    B.add(K.put(K.edged(K.mesh(K.box(42, 0.6, 42), M.base)), 0, -0.3, 0));
    return { group: F.root, parts: P };
  }

  /* =================================================================
     3. RBMK-1000 — широкая приземистая кладка, верхняя плита с каналами,
        барабаны-сепараторы по бокам, ЛЁГКИЙ реакторный зал без
        герметичной оболочки
     ================================================================= */
  function buildRBMK(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 5.6, 19.0), B = F.body, i, j, a, m, x, z;

    /* --- нижняя часть здания: массивный бетон вокруг шахты --- */
    var hall = K.grp('reactor_hall');
    hall.add(K.hollowBox(48, 21, 30, 1.2, { material: M.concrete }));
    /* пол центрального зала с проёмом над реактором: настил из пятаков и есть пол зала */
    hall.add(K.put(K.edged(K.mesh(K.box(48, 1.0, 5.0), M.concrete)), 0, 21.0, -12.5));
    hall.add(K.put(K.edged(K.mesh(K.box(24, 1.0, 5.0), M.concrete)), -12, 21.0, 12.5));
    hall.add(K.put(K.edged(K.mesh(K.box(14.0, 1.0, 20.0), M.concrete)), -17.0, 21.0, 0));
    hall.add(K.put(K.edged(K.mesh(K.box(14.0, 1.0, 10.0), M.concrete)), 17.0, 21.0, -5.0));
    /* верхний зал — лёгкий каркас с панелями: герметичной оболочки нет */
    for (i = 0; i <= 8; i++) {
      x = -24 + i * 6;
      hall.add(K.put(K.edged(K.mesh(K.box(0.55, 17, 0.55), M.steelDull)), x, 30.0, -14.7));
      if (x <= 0) hall.add(K.put(K.edged(K.mesh(K.box(0.55, 17, 0.55), M.steelDull)), x, 30.0, 14.7));
      hall.add(K.put(K.edged(K.mesh(K.box(0.4, 0.4, x > 0 ? 15.0 : 29.4), M.steelDull)), x, 38.4, x > 0 ? -7.2 : 0));
    }
    hall.add(K.put(K.edged(K.mesh(K.box(48, 15.6, 0.16), M.frame)), 0, 29.4, -14.95)); // стеновая панель
    hall.add(K.put(K.edged(K.mesh(K.box(24, 15.6, 0.16), M.frame)), -12, 29.4, 14.95));
    hall.add(K.put(K.edged(K.mesh(K.box(0.16, 15.6, 29.8), M.frame)), -23.95, 29.4, 0));
    hall.add(K.put(K.edged(K.mesh(K.box(0.16, 15.6, 15.0), M.frame)), 23.95, 29.4, -7.4));
    hall.add(K.put(K.edged(K.mesh(K.box(48.4, 0.22, 15.4), M.frame)), 0, 38.8, -7.4));  // лёгкая кровля
    hall.add(K.put(K.edged(K.mesh(K.box(24.2, 0.22, 15.4), M.frame)), -12.1, 38.8, 7.4));
    B.add(hall); P.reactor_hall = hall;

    /* --- шахта реактора: бетонный стакан, нижняя и верхняя металлоконструкции --- */
    var cav = K.grp('reactor_cavity');
    cav.add(K.put(K.mesh(openLathe(K, [[10.6, 0], [10.6, 15.6], [7.1, 15.6], [7.1, 0]], 56, 120), M.concrete), 0, 5.2, 0));
    cav.add(K.put(K.mesh(openLathe(K, [[8.9, 0], [8.9, 1.4], [2.0, 1.4], [2.0, 0]], 44, 110), M.steelDull), 0, 9.0, 0));   // схема «ОР»
    cav.add(K.put(K.mesh(openLathe(K, [[8.9, 0], [8.9, 2.9], [2.0, 2.9], [2.0, 0]], 44, 110), M.steelDull), 0, 17.35, 0));  // схема «Е», верхняя плита
    cav.add(K.put(K.mesh(openLathe(K, [[9.6, 0], [9.6, 0.5], [2.0, 0.5], [2.0, 0]], 44, 110), M.steelDull), 0, 20.35, 0));
    /* пятаки настила */
    var lat = K.lattice(8.6, 0.72), pl = [];
    for (i = 0; i < lat.length; i++) pl.push([lat[i][0], 0, lat[i][1]]);
    cav.add(K.put(K.inst(K.cyl(0.33, 0.28, 12), M.steelDull, pl), 0, 21.0, 0));
    B.add(cav); P.reactor_cavity = cav;

    /* --- графитовая кладка: Ø11.8 м, высота 7 м --- */
    var stack = K.grp('graphite_stack');
    for (i = 0; i < 5; i++) stack.add(K.put(K.edged(K.mesh(K.cyl(5.9, 1.33, 36), M.graphite)), 0, 10.75 + i * 1.37, 0));
    for (i = 0; i < 10; i++) {   // вынутые колонны по краю — видно, что кладка наборная
      a = i / 10 * TAU;
      m = K.edged(K.mesh(K.box(0.6, 6.9, 0.6), M.graphite));
      K.put(m, 6.15 * Math.cos(a), 13.9, 6.15 * Math.sin(a)); m.rotation.y = -a;
      stack.add(m);
    }
    B.add(stack); P.graphite_stack = stack;

    /* положительный паровой эффект: всплеск мощности в нижней части зоны */
    var exc = K.tag(K.mesh(K.sph(4.4, 26, 16), M.glow), 'power_excursion');
    exc.scale.set(1, 0.30, 1); K.put(exc, 0, 12.4, 0);
    B.add(exc); P.power_excursion = exc;

    /* --- технологические каналы --- */
    var fl = K.lattice(5.6, 0.62), fc = [], sz = [], mc = [];
    for (i = 0; i < fl.length; i++) {
      if (i % 7 === 3) sz.push([fl[i][0], 0, fl[i][1]]);
      else fc.push([fl[i][0], 0, fl[i][1]]);
    }
    var fchan = K.inst(K.pipeGeo(0.05, 0.016, 14.4, 8), M.steelDull, fc, 'fuel_channel');
    K.put(fchan, 0, 9.2, 0); B.add(fchan); P.fuel_channel = fchan;

    var szch = K.inst(K.pipeGeo(0.055, 0.018, 15.6, 8), M.hot, sz, 'suz_channel');
    K.put(szch, 0, 9.2, 0); B.add(szch); P.suz_channel = szch;

    /* ручные стержни: приводы над плитой и поглотители в каналах */
    var rods = K.grp('manual_control_rods');
    for (i = 0; i < sz.length; i++) mc.push([sz[i][0], 0, sz[i][2]]);
    rods.add(K.put(K.inst(K.box(0.42, 1.5, 0.42), M.steelDull, mc), 0, 22.6, 0));
    rods.add(K.put(K.inst(K.cyl(0.035, 6.6, 6), M.hot, mc), 0, 18.2, 0));
    B.add(rods); P.manual_control_rods = rods;

    /* --- один циркониевый канал крупным планом, с вздутием --- */
    var pt = K.grp('pressure_tube');
    pt.add(K.mesh(K.pipeGeo(0.10, 0.028, 14.4, 16), M.steel));
    m = K.mesh(K.sph(0.19, 16, 12), M.hot); m.scale.set(1, 1.9, 1); K.put(m, 0, 4.4, 0); pt.add(m);
    K.put(pt, 3.72, 9.2, 1.86);
    B.add(pt); P.pressure_tube = pt;

    /* --- тепловыделяющая сборка: оболочка твэлов (масштаб условный) --- */
    var clad = K.grp('fuel_clad');
    var rr = [];
    for (i = 0; i < 6; i++) { a = i / 6 * TAU; rr.push([0.26 * Math.cos(a), 0, 0.26 * Math.sin(a)]); }
    for (i = 0; i < 12; i++) { a = (i + 0.5) / 12 * TAU; rr.push([0.52 * Math.cos(a), 0, 0.52 * Math.sin(a)]); }
    clad.add(K.inst(K.pipeGeo(0.075, 0.022, 6.6, 8), M.clad, rr));
    clad.add(K.put(K.inst(K.cyl(0.055, 6.2, 6), M.fuel, rr), 0, 3.3, 0));
    for (i = 0; i < 5; i++) clad.add(K.put(K.mesh(K.torus(0.66, 0.05, 6, 24), M.steelDull), 0, 0.6 + i * 1.4, 0));
    K.put(clad, -14.0, 21.5, 8.5);
    B.add(clad); P.fuel_clad = clad;

    /* --- ГЦН: восемь насосов в боксах МЦК --- */
    var pumps = K.grp('mcp');
    for (i = 0; i < 8; i++) {
      x = -10.5 + (i % 4) * 7.0; z = (i < 4 ? -11.6 : 11.6);
      pumps.add(K.put(K.edged(K.mesh(K.cyl(1.35, 1.9, 22), M.steel)), x, 3.0, z));      // улитка
      pumps.add(K.put(K.edged(K.mesh(K.cyl(0.85, 3.4, 18), M.steelDull)), x, 5.7, z));  // электродвигатель
      pumps.add(K.put(K.edged(K.mesh(K.cyl(0.42, 0.9, 14), M.steelDull)), x, 7.6, z));
      pumps.add(K.pipeRun([[x, 3.0, z], [x, 3.0, z * 0.62]], 0.55, 0.08, M.steelDull, 14));
    }
    B.add(pumps); P.mcp = pumps;

    /* --- нижние водяные коммуникации: недогрев на входе в каналы --- */
    var inl = K.grp('inlet_subcooling');
    for (i = 0; i < 2; i++) {
      z = (i ? 1 : -1) * 9.4;
      inl.add(K.put(K.rot(K.mesh(K.pipeGeo(0.72, 0.10, 22, 22), M.water), 0, 0, Math.PI / 2), -11, 8.2, z)); // РГК
      for (j = 0; j < 7; j++) {
        x = -9 + j * 3;
        inl.add(K.pipeRun([[x, 8.2, z], [x, 8.2, z * 0.42], [x * 0.55, 9.4, z * 0.2]], 0.16, 0.045, M.water, 10));
      }
      inl.add(K.pipeRun([[-11, 8.2, z], [-15.5, 8.2, z], [-15.5, 24.0, z]], 0.5, 0.08, M.water, 16));
    }
    B.add(inl); P.inlet_subcooling = inl;

    /* --- барабаны-сепараторы: четыре, Ø2.6 м, длина 31 м --- */
    var bs = K.grp();
    for (i = 0; i < 4; i++) {
      z = (i < 2 ? -1 : 1) * (i % 2 ? 12.4 : 8.2);
      m = K.mesh(openLathe(K, K.vesselProfile(1.35, 0.14, 26, 0.7, 0.7, 10), 40, 60), M.steel);
      K.put(m, -14.5, 27.4, z); K.rot(m, 0, 0, -Math.PI / 2);
      bs.add(m);
      for (j = 0; j < 6; j++)   // пароотводящие трубы вверх
        bs.add(K.pipeRun([[-11 + j * 4.6, 28.6, z], [-11 + j * 4.6, 33.5, z]], 0.22, 0.05, M.steelDull, 10));
      for (j = 0; j < 6; j++)   // опускные к всасу ГЦН
        bs.add(K.pipeRun([[-11 + j * 4.6, 26.1, z], [-11 + j * 4.6, 9.4, z * 1.02]], 0.26, 0.05, M.water, 10));
    }
    B.add(bs);

    /* --- разгрузочно-загрузочная машина на мостовом кране --- */
    var rzm = K.grp('refuelling_machine');
    rzm.add(K.put(K.edged(K.mesh(K.box(1.1, 1.5, 29.5), M.steelDull)), 0, 36.4, 0));
    rzm.add(K.put(K.edged(K.mesh(K.box(1.1, 1.5, 29.5), M.steelDull)), 3.4, 36.4, 0));
    rzm.add(K.put(K.edged(K.mesh(K.box(5.4, 1.3, 4.2), M.steelDull)), 1.7, 34.9, 2.0));  // тележка
    rzm.add(K.put(K.mesh(K.pipeGeo(1.35, 0.30, 11.5, 22), M.steelDull), 1.7, 23.0, 2.0)); // скафандр
    rzm.add(K.put(K.edged(K.mesh(K.cyl(1.55, 0.6, 22), M.hot)), 1.7, 22.5, 2.0));
    K.put(rzm, 2.0, 0, 0);
    B.add(rzm); P.refuelling_machine = rzm;

    /* --- БЩУ: кнопка АЗ-5 и уставка мощности --- */
    var desk = K.grp();
    desk.add(K.put(K.edged(K.mesh(K.box(9.0, 0.5, 6.0), M.concrete)), -19.0, 8.6, 9.5)); // мезонин
    B.add(desk);
    var az = K.grp('az5_button');
    az.add(K.edged(K.mesh(K.box(3.0, 1.1, 1.3), M.steelDull)));
    az.add(K.put(K.edged(K.mesh(K.cyl(0.30, 0.34, 18), M.hot)), 0.9, 0.62, 0.1));
    var azr = K.put(K.mesh(K.torus(0.44, 0.06, 6, 20), M.frame), 0.9, 0.58, 0.1);
    azr.rotation.x = Math.PI / 2; az.add(azr);
    K.put(az, -19.0, 9.4, 10.6);
    B.add(az); P.az5_button = az;

    var sp = K.grp('power_setpoint');
    sp.add(K.edged(K.mesh(K.box(5.2, 2.6, 0.5), M.steelDull)));
    for (i = 0; i < 8; i++)
      sp.add(K.put(K.rot(K.edged(K.mesh(K.cyl(0.26, 0.12, 16), i % 3 ? M.frame : M.hot)), Math.PI / 2, 0, 0),
                   -1.9 + (i % 4) * 1.25, 0.6 - Math.floor(i / 4) * 1.15, 0.3));
    K.put(sp, -19.0, 10.4, 8.2);
    B.add(sp); P.power_setpoint = sp;

    B.add(K.put(K.edged(K.mesh(K.box(54, 0.6, 36), M.base)), 0, -0.3, 0));
    return { group: F.root, parts: P };
  }

  /* =================================================================
     4. VVER — вертикальный корпус с эллиптическими днищами, крышка
        с приводами СУЗ, ГОРИЗОНТАЛЬНЫЕ парогенераторы (родовой признак),
        главные запорные задвижки, барботажный конденсатор,
        оболочка-цилиндр с куполом
     ================================================================= */
  function buildVVER(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 5.0, 22.0), B = F.body, i, j, a, m, x, z, g;
    B.position.x = 2.0;

    /* --- защитная оболочка --- */
    var bld = K.grp('reactor_building');
    bld.add(K.mesh(openLathe(K, K.domeProfile(16.0, 1.2, 30, 16), 64, 96), M.concrete));
    bld.add(K.put(K.edged(K.mesh(K.cyl(17.2, 2.4, 48), M.concrete)), 0, -1.2, 0));   // фундаментная плита
    bld.add(K.put(K.mesh(openLathe(K, [[7.2, 0], [7.2, 11.5], [4.4, 11.5], [4.4, 0]], 40, 136), M.concrete), 0, 2.0, 0)); // шахта реактора
    bld.add(K.put(K.mesh(openLathe(K, [[15.0, 0], [15.0, 0.6], [7.2, 0.6], [7.2, 0]], 52, 92), M.concrete), 0, 1.7, 0));    // обслуживаемый пол
    B.add(bld); P.reactor_building = bld;

    /* --- корпус реактора --- */
    var ves = K.grp();
    ves.add(K.put(K.mesh(openLathe(K, K.vesselProfile(2.27, 0.21, 9.0, 0.52, 0.52, 12), 48, 58), M.steel), 0, 8.4, 0));
    ves.add(K.put(K.edged(K.mesh(K.cyl(2.65, 0.55, 40), M.steelDull)), 0, 17.6, 0));   // фланец главного разъёма
    B.add(ves);

    /* активная зона, обнажённая по уровню */
    var uc = K.grp('uncovered_core');
    uc.add(K.put(K.edged(K.mesh(K.cyl(1.58, 3.5, 30), M.fuel)), 0, 11.0, 0));
    m = K.mesh(K.cyl(1.58, 2.0, 30), M.glow); K.put(m, 0, 13.7, 0); uc.add(m);       // обнажённая часть
    m = K.mesh(K.cyl(2.04, 0.08, 34), M.water); K.put(m, 0, 12.7, 0); uc.add(m);     // уровень
    B.add(uc); P.uncovered_core = uc;

    /* --- крышка: приводы СУЗ и направляющие каналы --- */
    var hp = [];
    hp.push([0, 0, 0]);
    for (i = 0; i < 6; i++) { a = i / 6 * TAU; hp.push([0.62 * Math.cos(a), 0, 0.62 * Math.sin(a)]); }
    for (i = 0; i < 12; i++) { a = (i + 0.5) / 12 * TAU; hp.push([1.22 * Math.cos(a), 0, 1.22 * Math.sin(a)]); }
    for (i = 0; i < 18; i++) { a = i / 18 * TAU; hp.push([1.80 * Math.cos(a), 0, 1.80 * Math.sin(a)]); }
    var drv = K.grp('cps_drive_housing');
    drv.add(K.put(K.inst(K.pipeGeo(0.17, 0.05, 3.4, 10), M.steel, hp), 0, 18.3, 0));
    drv.add(K.put(K.inst(K.box(0.44, 1.5, 0.44), M.steelDull, hp), 0, 22.4, 0));
    drv.add(K.put(K.edged(K.mesh(K.cyl(2.5, 0.4, 36), M.frame)), 0, 23.6, 0));       // площадка обслуживания
    B.add(drv); P.cps_drive_housing = drv;

    var gch = K.grp('cps_guide_channel');
    gch.add(K.put(K.inst(K.pipeGeo(0.12, 0.035, 4.6, 8), M.steelDull, hp), 0, 13.6, 0));
    gch.add(K.put(K.inst(K.cyl(0.05, 4.2, 6), M.hot, hp), 0, 15.8, 0));
    B.add(gch); P.cps_guide_channel = gch;

    /* --- шесть ГОРИЗОНТАЛЬНЫХ парогенераторов --- */
    var SGR = 11.2, SGY = 13.6, sgs = K.grp(), sgt = K.grp('sg_tubes'), sgPos = [];
    for (i = 0; i < 6; i++) {
      a = i / 6 * TAU + Math.PI / 6;
      var outer = K.grp(); outer.rotation.y = -a;
      var inner = K.grp(); inner.rotation.x = Math.PI / 2;
      outer.add(inner);
      K.put(outer, SGR * Math.cos(a), SGY, SGR * Math.sin(a));
      sgPos.push([SGR * Math.cos(a), SGY, SGR * Math.sin(a), a]);
      inner.add(K.put(K.mesh(openLathe(K, K.vesselProfile(1.76, 0.16, 8.2, 0.60, 0.60, 10), 44, 54), M.steel), 0, -4.1, 0));
      /* коллекторы теплоносителя — вертикальные, насквозь через корпус ПГ */
      inner.add(K.put(K.rot(K.edged(K.mesh(K.cyl(0.66, 6.0, 20), M.steelDull)), Math.PI / 2, 0, 0), 0, -2.9, 0));
      inner.add(K.put(K.rot(K.edged(K.mesh(K.cyl(0.66, 6.0, 20), M.steelDull)), Math.PI / 2, 0, 0), 0, 2.9, 0));
      inner.add(K.put(K.edged(K.mesh(K.cyl(0.46, 1.4, 16), M.steelDull)), 0, 4.9, 0)); // паровой коллектор
      /* пучок теплообменных трубок — горизонтальные змеевики */
      var tl = K.lattice(1.25, 0.28), tb = [];
      for (j = 0; j < tl.length; j++) tb.push([tl[j][0], -3.0, tl[j][1]]);
      var tOuter = K.grp(); tOuter.rotation.y = -a;
      var tInner = K.grp(); tInner.rotation.x = Math.PI / 2;
      tOuter.add(tInner);
      K.put(tOuter, SGR * Math.cos(a), SGY, SGR * Math.sin(a));
      tInner.add(K.inst(K.pipeGeo(0.042, 0.013, 6.0, 6), M.steelDull, tb));
      sgt.add(tOuter);
      sgs.add(outer);
    }
    B.add(sgs); P.sg_tubes = sgt;

    /* --- главный циркуляционный трубопровод Ду500 --- */
    var mcp = K.grp('main_circulation_pipeline'), legs = [];
    for (i = 0; i < 6; i++) {
      a = i / 6 * TAU + Math.PI / 6;
      var ca = Math.cos(a), sa = Math.sin(a), ta = a + Math.PI / 2;
      var hx = SGR * ca - 3.0 * Math.cos(ta), hz = SGR * sa - 3.0 * Math.sin(ta);
      var cx = SGR * ca + 3.0 * Math.cos(ta), cz = SGR * sa + 3.0 * Math.sin(ta);
      /* горячая нитка: корпус -> «горячий» коллектор ПГ */
      var hot = [[2.1 * ca, 15.4, 2.1 * sa], [5.6 * ca, 15.4, 5.6 * sa], [hx, 15.4, hz], [hx, SGY + 1.0, hz]];
      /* холодная нитка: «холодный» коллектор ПГ -> ГЦН -> корпус */
      var cold = [[cx, SGY + 1.0, cz], [cx, 10.4, cz], [7.4 * ca + 2.0 * Math.cos(ta), 10.4, 7.4 * sa + 2.0 * Math.sin(ta)],
                  [4.6 * ca, 10.4, 4.6 * sa], [2.1 * ca, 12.6, 2.1 * sa]];
      mcp.add(K.pipeRun(hot, 0.34, 0.06, M.steelDull, 16));
      mcp.add(K.pipeRun(cold, 0.34, 0.06, M.steelDull, 16));
      legs.push({ a: a, hot: hot, cold: cold, hx: hx, hz: hz, cx: cx, cz: cz, ca: ca, sa: sa, ta: ta });
      /* ГЦН на холодной нитке */
      var px = 6.2 * ca + 1.2 * Math.cos(ta), pz = 6.2 * sa + 1.2 * Math.sin(ta);
      mcp.add(K.put(K.edged(K.mesh(K.cyl(0.95, 1.4, 20), M.steel)), px, 10.4, pz));
      mcp.add(K.put(K.edged(K.mesh(K.cyl(0.62, 3.0, 16), M.steelDull)), px, 12.6, pz));
    }
    B.add(mcp); P.main_circulation_pipeline = mcp;

    /* --- ГЗЗ: корпуса, приводы с сальниками, проточная часть, управление --- */
    var vb = K.grp('mgv_body'), vd = K.grp('mgv_drive_and_seals'), vf = K.grp('mgv_flow_path');
    for (i = 0; i < 6; i++) {
      var L = legs[i];
      var spots = [[L.hx * 0.72, 15.4, L.hz * 0.72], [L.cx * 0.80, 10.4, L.cz * 0.80]];
      for (j = 0; j < 2; j++) {
        var s = spots[j];
        g = K.valveBody(0.34, M.steel); K.put(g, s[0], s[1], s[2]); vb.add(g);
        g = K.valveDrive(0.34, M.steelDull, M.hot); K.put(g, s[0], s[1], s[2]); vd.add(g);
        m = K.edged(K.mesh(K.cyl(0.29, 0.14, 18), M.hot)); K.put(m, s[0], s[1], s[2]);
        m.rotation.z = Math.PI / 2; m.rotation.y = -L.a; vf.add(m);                       // клин в проточной части
      }
    }
    B.add(vb); B.add(vd); B.add(vf);
    P.mgv_body = vb; P.mgv_drive_and_seals = vd; P.mgv_flow_path = vf;

    var vc = K.grp('mgv_control');
    for (i = 0; i < 4; i++)
      vc.add(K.put(K.edged(K.mesh(K.box(1.0, 2.2, 0.8), M.steelDull)), -11.5 + i * 1.15, 3.7, 6.2));
    vc.add(K.pipeRun([[-11.0, 4.9, 6.2], [-11.0, 8.4, 6.2], [-3.0, 8.4, 6.2], [2.0, 9.6, 5.0]], 0.22, 0.05, M.frame, 10));
    B.add(vc); P.mgv_control = vc;

    /* --- отсечённый объём петли между двумя ГЗЗ --- */
    var iso = K.grp('isolated_loop_volume');
    var L0 = legs[0];
    iso.add(K.pipeRun([[L0.hx * 0.72, 15.4, L0.hz * 0.72], [L0.hx, 15.4, L0.hz], [L0.hx, SGY + 1.0, L0.hz]], 0.48, 0.46, M.glow, 14));
    iso.add(K.pipeRun([[L0.cx, SGY + 1.0, L0.cz], [L0.cx, 10.4, L0.cz], [L0.cx * 0.80, 10.4, L0.cz * 0.80]], 0.48, 0.46, M.glow, 14));
    m = K.mesh(K.cyl(1.55, 8.4, 22), M.glow);
    K.put(m, SGR * L0.ca, SGY, SGR * L0.sa);
    m.rotation.y = -L0.a; m.rotation.x = Math.PI / 2; iso.add(m);
    B.add(iso); P.isolated_loop_volume = iso;

    /* --- барботажный конденсатор: башня с лотками --- */
    var bc = K.grp('bubbler_condenser_trays');
    bc.add(K.hollowBox(7.0, 18.0, 6.0, 0.6, { material: M.concrete }));
    for (i = 0; i < 11; i++) {
      bc.add(K.put(K.edged(K.mesh(K.box(5.4, 0.16, 4.6), M.steelDull)), 0, 2.2 + i * 1.45, 0));
      bc.add(K.put(K.mesh(K.box(5.2, 0.34, 4.4), M.water), 0, 2.5 + i * 1.45, 0));
    }
    bc.add(K.pipeRun([[0, 1.4, 3.6], [0, 1.4, 8.0], [0, 8.0, 10.0]], 0.62, 0.09, M.steelDull, 16)); // подвод из бокса ПГ
    K.put(bc, -10.4, 15.0, 0);
    B.add(bc); P.bubbler_condenser_trays = bc;

    /* --- линия подпитки высокого давления --- */
    var hpm = K.grp('hp_makeup_line');
    hpm.add(K.put(K.edged(K.mesh(K.cyl(0.55, 1.6, 18), M.steel)), 11.6, 2.8, -7.0));
    hpm.add(K.put(K.edged(K.mesh(K.cyl(0.42, 2.2, 14), M.steelDull)), 11.6, 4.7, -7.0));
    hpm.add(K.put(K.edged(K.mesh(K.box(3.0, 2.2, 2.6), M.frame)), 11.6, 1.1, -7.0));
    hpm.add(K.pipeRun([[11.6, 3.6, -7.0], [11.6, 10.4, -7.0], [6.4, 10.4, -4.2],
                       [legs[5].cx, 10.4, legs[5].cz]], 0.15, 0.04, M.steel, 12));
    g = K.valveBody(0.16, M.hot); K.put(g, 11.6, 8.2, -7.0); hpm.add(g);
    B.add(hpm); P.hp_makeup_line = hpm;

    /* --- внешнее электроснабжение --- */
    var osp = K.grp('offsite_power');
    osp.add(K.put(K.pylon(15, 3.4, M.steelDull), -26.0, 0, -9.0));
    for (i = 0; i < 2; i++) {
      osp.add(K.put(K.edged(K.mesh(K.box(3.6, 3.2, 2.8), M.steelDull)), -21.5, 1.6, -3.0 + i * 5.0));
      osp.add(K.put(K.edged(K.mesh(K.cyl(0.35, 2.0, 12), M.frame)), -21.5, 4.2, -3.0 + i * 5.0));
    }
    osp.add(K.pipeRun([[-26.0, 13.0, -9.0], [-21.5, 5.2, -3.0]], 0.07, 0.03, M.frame, 6));
    osp.add(K.pipeRun([[-21.5, 5.2, 2.0], [-17.4, 5.2, 2.0], [-16.4, 5.2, 2.0]], 0.22, 0.06, M.frame, 8));
    B.add(osp); P.offsite_power = osp;

    B.add(K.put(K.edged(K.mesh(K.box(56, 0.8, 40), M.base)), -4.0, -2.4, 0));
    return { group: F.root, parts: P };
  }

  /* =================================================================
     5. PWR2 — поколение II: вертикальный корпус, ВЕРТИКАЛЬНЫЕ
        парогенераторы, компенсатор давления, гермооболочка с куполом
     ================================================================= */
  function buildPWR2(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 6.5, 28.0), B = F.body, i, j, a, m, x, z, g;
    B.position.x = -1.0; B.position.z = -3.0;

    /* --- гермооболочка --- */
    var cont = K.grp();
    cont.add(K.mesh(openLathe(K, K.domeProfile(20.0, 1.1, 40, 18), 64, 96), M.concrete));
    cont.add(K.put(K.edged(K.mesh(K.cyl(21.4, 2.6, 52), M.concrete)), 0, -1.3, 0));
    cont.add(K.put(K.mesh(openLathe(K, [[13.2, 0], [13.2, 24], [12.3, 24], [12.3, 0]], 48, 118), M.concrete), 0, 0, 0)); // защитная стена крана
    cont.add(K.put(K.mesh(openLathe(K, [[19.0, 0], [19.0, 0.6], [13.2, 0.6], [13.2, 0]], 54, 92), M.concrete), 0, 4.3, 0));   // отметка обслуживания
    cont.add(K.put(K.mesh(openLathe(K, [[5.0, 0], [5.0, 13.0], [3.4, 13.0], [3.4, 0]], 36, 144), M.concrete), 0, 0, 0)); // шахта реактора
    B.add(cont);

    /* --- корпус реактора --- */
    var ves = K.grp();
    ves.add(K.put(K.mesh(openLathe(K, K.vesselProfile(2.21, 0.22, 7.6, 0.52, 0.52, 12), 48, 58), M.steel), 0, 6.6, 0));
    ves.add(K.put(K.edged(K.mesh(K.cyl(2.62, 0.55, 40), M.steelDull)), 0, 14.4, 0));
    B.add(ves);

    var core = K.tag(K.grp(), 'core');
    core.add(K.put(K.edged(K.mesh(K.cyl(1.70, 4.0, 32), M.fuel)), 0, 8.6, 0));
    for (i = 0; i < 4; i++) core.add(K.put(K.mesh(K.torus(1.74, 0.05, 6, 30), M.steelDull), 0, 7.0 + i * 1.3, 0));
    B.add(core); P.core = core;

    var hcs = K.tag(K.mesh(K.cyl(1.92, 3.3, 30), M.glow), 'hot_core_steam');
    K.put(hcs, 0, 12.3, 0);
    B.add(hcs); P.hot_core_steam = hcs;

    /* пояс сварных швов напротив активной зоны */
    var blt = K.tag(K.mesh(K.pipeGeo(2.33, 0.11, 4.4, 44), M.hot), 'vessel_beltline');
    K.put(blt, 0, 7.0, 0);
    B.add(blt); P.vessel_beltline = blt;

    /* --- приводы СУЗ на крышке --- */
    var hp = [[0, 0, 0]];
    for (i = 0; i < 8; i++) { a = i / 8 * TAU; hp.push([0.58 * Math.cos(a), 0, 0.58 * Math.sin(a)]); }
    for (i = 0; i < 14; i++) { a = (i + 0.5) / 14 * TAU; hp.push([1.12 * Math.cos(a), 0, 1.12 * Math.sin(a)]); }
    for (i = 0; i < 16; i++) { a = i / 16 * TAU; hp.push([1.62 * Math.cos(a), 0, 1.62 * Math.sin(a)]); }
    var crdm = K.grp('crdm_housing');
    crdm.add(K.put(K.inst(K.pipeGeo(0.115, 0.032, 4.0, 10), M.steel, hp), 0, 15.1, 0));
    crdm.add(K.put(K.inst(K.cyl(0.155, 3.6, 10), M.steelDull, hp), 0, 20.9, 0));    // катушки приводов
    crdm.add(K.put(K.mesh(openLathe(K, [[2.3, 0], [2.3, 0.35], [0.4, 0.35], [0.4, 0]], 34, 100), M.steelDull), 0, 22.8, 0));    // сейсмическая опорная плита
    crdm.add(K.put(K.mesh(openLathe(K, [[2.5, 0], [2.5, 6.2], [2.3, 6.2], [2.3, 0]], 32, 150), M.steelDull), 0, 15.0, 0)); // кожух охлаждения
    B.add(crdm); P.crdm_housing = crdm;

    /* --- четыре ВЕРТИКАЛЬНЫХ парогенератора --- */
    function sgProfile(wall) {
      var Ro1 = 1.95, Ro2 = 2.45, p = [], i2, a2, seg = 10;
      p.push([Ro1, 0]); p.push([Ro1, 11.0]); p.push([Ro2, 14.0]); p.push([Ro2, 20.0]);
      for (i2 = 1; i2 <= seg; i2++) { a2 = i2 / seg * Math.PI / 2; p.push([Ro2 * Math.cos(a2), 20.0 + Ro2 * Math.sin(a2)]); }
      for (i2 = seg; i2 >= 1; i2--) { a2 = i2 / seg * Math.PI / 2; p.push([(Ro2 - wall) * Math.cos(a2), 20.0 + (Ro2 - wall) * Math.sin(a2)]); }
      p.push([Ro2 - wall, 20.0]); p.push([Ro2 - wall, 14.0]); p.push([Ro1 - wall, 11.0]); p.push([Ro1 - wall, 0]);
      return p;
    }
    var SGR = 9.2, sgs = K.grp(), sgt = K.grp('steam_generator_tube'), loops = [];
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2;
      x = SGR * Math.cos(a); z = SGR * Math.sin(a);
      loops.push({ a: a, x: x, z: z, ca: Math.cos(a), sa: Math.sin(a) });
      sgs.add(K.put(K.mesh(openLathe(K, sgProfile(0.14), 44, 60), M.steel), x, 5.6, z));
      sgs.add(K.put(K.edged(K.mesh(K.cyl(2.1, 0.5, 34), M.concrete)), x, 5.4, z));       // опора
      sgs.add(K.put(K.mesh(K.sph(1.95, 24, 14), M.steel), x, 5.6, z));                   // водяная камера
      sgs.add(K.put(K.edged(K.mesh(K.cyl(0.55, 1.1, 18), M.steelDull)), x, 26.6, z));    // патрубок острого пара
      /* U-образный пучок */
      var tl = K.lattice(1.42, 0.34), tb = [], bn = [];
      for (j = 0; j < tl.length; j++) {
        if (Math.abs(tl[j][1]) < 0.12) continue;
        tb.push([tl[j][0], 0, tl[j][1]]);
        if (tl[j][1] > 0) bn.push([tl[j][0], 0, 0, 0, Math.PI / 2, 0, 1, 1, 1]);
      }
      sgt.add(K.put(K.inst(K.pipeGeo(0.038, 0.012, 12.6, 6), M.steelDull, tb), x, 7.6, z));
      var bnd = [];
      for (j = 0; j < bn.length; j++) bnd.push([bn[j][0], 0, 0, 0, Math.PI / 2, 0]);
      sgt.add(K.put(K.inst(K.torus(0.30, 0.038, 6, 12), M.steelDull, bnd), x, 20.2, z));
      /* трубная доска */
      sgs.add(K.put(K.edged(K.mesh(K.cyl(1.75, 0.5, 30), M.steelDull)), x, 7.4, z));
      /* ГЦН петли */
      var px = x * 0.62 + 2.6 * Math.cos(a + Math.PI / 2), pz = z * 0.62 + 2.6 * Math.sin(a + Math.PI / 2);
      sgs.add(K.put(K.edged(K.mesh(K.cyl(1.1, 1.5, 22), M.steel)), px, 6.0, pz));
      sgs.add(K.put(K.edged(K.mesh(K.cyl(0.72, 4.2, 18), M.steelDull)), px, 8.9, pz));
      loops[i].px = px; loops[i].pz = pz;
    }
    B.add(sgs); B.add(sgt); P.steam_generator_tube = sgt;

    /* горячие нитки — фон, холодные — цель */
    var hotLegs = K.grp(), cold = K.grp('cold_leg');
    for (i = 0; i < 4; i++) {
      var L = loops[i];
      hotLegs.add(K.pipeRun([[2.1 * L.ca, 12.0, 2.1 * L.sa], [5.4 * L.ca, 12.0, 5.4 * L.sa],
                             [L.x, 9.6, L.z], [L.x, 6.4, L.z]], 0.44, 0.07, M.steelDull, 18));
      cold.add(K.pipeRun([[L.px, 6.0, L.pz], [L.px * 0.7, 9.6, L.pz * 0.7],
                          [2.1 * L.ca + 1.0 * Math.cos(L.a + 1.2), 9.6, 2.1 * L.sa + 1.0 * Math.sin(L.a + 1.2)]],
                         0.40, 0.07, M.steel, 18));
    }
    B.add(hotLegs); B.add(cold); P.cold_leg = cold;

    /* --- компенсатор давления --- */
    var PZX = 5.07, PZZ = 9.54, pz2 = K.grp();
    pz2.add(K.put(K.mesh(openLathe(K, K.vesselProfile(1.28, 0.15, 11.0, 0.65, 0.65, 10), 40, 30), M.steel), PZX, 14.0, PZZ));
    pz2.add(K.put(K.edged(K.mesh(K.cyl(1.5, 0.5, 28), M.concrete)), PZX, 13.6, PZZ));
    pz2.add(K.put(K.mesh(K.cyl(1.12, 5.0, 26), M.water), PZX, 16.4, PZZ));
    B.add(pz2);

    var porv = K.grp('pressurizer_porv');
    g = K.valveBody(0.24, M.hot); K.put(g, PZX - 0.5, 26.6, PZZ); porv.add(g);
    g = K.valveDrive(0.24, M.steelDull, M.hot); K.put(g, PZX - 0.5, 26.6, PZZ); porv.add(g);
    g = K.valveBody(0.24, M.steel); K.put(g, PZX + 0.5, 26.6, PZZ); porv.add(g);
    porv.add(K.pipeRun([[PZX - 0.4, 26.6, PZZ], [PZX - 0.4, 29.5, PZZ], [-4.0, 29.5, 10.0],
                        [-4.0, 3.6, 10.0], [-6.0, 3.6, 10.6]], 0.20, 0.05, M.steelDull, 14));
    porv.add(K.put(K.rot(K.mesh(openLathe(K, K.vesselProfile(1.3, 0.12, 4.2, 0.7, 0.7, 8), 32, 60), M.steelDull), 0, 0, Math.PI / 2), -7.8, 3.6, 11.0)); // бак-барботёр
    B.add(porv); P.pressurizer_porv = porv;

    var surge = K.grp('surge_line');
    surge.add(K.pipeRun([[loops[1].x * 0.72, 10.2, loops[1].z * 0.72], [PZX * 0.55, 10.2, PZZ * 0.82],
                         [PZX, 11.0, PZZ], [PZX, 13.0, PZZ]], 0.22, 0.05, M.steel, 16));
    B.add(surge); P.surge_line = surge;

    /* --- паропроводы через оболочку --- */
    var msl = K.grp('main_steam_line');
    for (i = 0; i < 4; i++) {
      var L2 = loops[i];
      msl.add(K.pipeRun([[L2.x, 27.0, L2.z], [L2.x, 31.0, L2.z], [L2.ca * 21.5, 31.0, L2.sa * 21.5]], 0.38, 0.07, M.steelDull, 16));
      g = K.valveBody(0.40, M.hot); K.put(g, L2.ca * 18.0, 31.0, L2.sa * 18.0);
      g.rotation.z = Math.PI / 2; g.rotation.y = -L2.a; msl.add(g);
    }
    B.add(msl); P.main_steam_line = msl;

    /* --- отсечная арматура на всасе системы расхолаживания --- */
    var rhr = K.grp('rhr_suction_isolation');
    var LR = loops[3];
    rhr.add(K.pipeRun([[LR.x * 0.6, 8.4, LR.z * 0.6], [LR.x * 0.6, 3.0, LR.z * 0.6],
                       [LR.ca * 21.0, 3.0, LR.sa * 21.0]], 0.26, 0.055, M.steel, 14));
    for (i = 0; i < 2; i++) {
      x = LR.ca * (11.0 + i * 4.0); z = LR.sa * (11.0 + i * 4.0);
      g = K.valveBody(0.28, M.hot); K.put(g, x, 3.0, z); g.rotation.z = Math.PI / 2; g.rotation.y = -LR.a; rhr.add(g);
      g = K.valveDrive(0.28, M.steelDull, M.hot); K.put(g, x, 3.4, z); rhr.add(g);
    }
    B.add(rhr); P.rhr_suction_isolation = rhr;

    /* --- линия подпитки --- */
    var mk = K.grp('makeup_water_line');
    mk.add(K.put(K.edged(K.mesh(K.box(4.0, 2.6, 3.0), M.frame)), -13.0, 1.3, -11.0));
    mk.add(K.put(K.edged(K.mesh(K.cyl(0.6, 1.8, 18), M.steel)), -13.0, 3.5, -11.0));
    mk.add(K.pipeRun([[-13.0, 4.4, -11.0], [-13.0, 9.2, -11.0], [loops[3].px, 9.2, loops[3].pz]], 0.16, 0.04, M.steel, 12));
    g = K.valveBody(0.17, M.hot); K.put(g, -13.0, 7.2, -11.0); mk.add(g);
    B.add(mk); P.makeup_water_line = mk;

    /* --- электрическая часть площадки --- */
    var osp = K.grp('offsite_power');
    osp.add(K.put(K.pylon(17, 3.6, M.steelDull), -31.0, 0, -12.0));
    osp.add(K.put(K.pylon(17, 3.6, M.steelDull), -31.0, 0, 2.0));
    for (i = 0; i < 3; i++) {
      osp.add(K.put(K.edged(K.mesh(K.box(4.0, 3.4, 3.0), M.steelDull)), -25.5, 1.7, -12.0 + i * 5.0));
      osp.add(K.put(K.edged(K.mesh(K.cyl(0.35, 2.2, 12), M.frame)), -25.5, 4.6, -12.0 + i * 5.0));
    }
    osp.add(K.pipeRun([[-31.0, 15.5, -5.0], [-25.5, 5.4, -7.0]], 0.08, 0.03, M.frame, 6));
    B.add(osp); P.offsite_power = osp;

    var e1 = K.grp('class_1e_buses');
    e1.add(K.hollowBox(13.0, 9.0, 11.0, 0.5, { material: M.concrete, roof: true }));
    for (i = 0; i < 8; i++)
      e1.add(K.put(K.edged(K.mesh(K.box(1.1, 2.4, 0.9), i < 4 ? M.hot : M.steelDull)),
                   -4.4 + (i % 4) * 1.25, 1.7, (i < 4 ? -2.4 : 2.4)));
    e1.add(K.put(K.edged(K.mesh(K.box(11.0, 0.35, 0.9), M.frame)), 0, 5.4, 0));      // кабельный лоток
    K.put(e1, 26.0, 0, -17.0);
    B.add(e1); P.class_1e_buses = e1;

    var esw = K.grp('essential_service_water_pumps');
    esw.add(K.hollowBox(12.0, 8.0, 8.0, 0.5, { material: M.concrete, roof: true }));
    for (i = 0; i < 3; i++) {
      esw.add(K.put(K.edged(K.mesh(K.cyl(0.85, 1.3, 20), M.steel)), -3.4 + i * 3.4, 1.0, 0));
      esw.add(K.put(K.edged(K.mesh(K.cyl(0.55, 3.6, 16), M.steelDull)), -3.4 + i * 3.4, 3.4, 0));
      esw.add(K.put(K.mesh(K.pipeGeo(0.42, 0.08, 4.2, 14), M.steelDull), -3.4 + i * 3.4, -4.0, 0));
    }
    esw.add(K.put(K.mesh(K.box(13.0, 0.3, 9.0), M.water), 0, -1.6, 0));              // подводящий канал
    K.put(esw, -18.0, 0, 28.0);
    B.add(esw); P.essential_service_water_pumps = esw;

    B.add(K.put(K.edged(K.mesh(K.box(70, 0.9, 64), M.base)), -3.0, -2.8, 4.0));
    return { group: F.root, parts: P };
  }

  /* =================================================================
     6. BWR1 — Mark I: корпус в сухом колодце-«лампочке» и ТОР барботёра
        внизу; реакторное здание с лёгким верхним этажом
     ================================================================= */
  function buildBWR1(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 7.6, 10.0), B = F.body, i, j, a, m, x, z, g, r;
    B.position.x = -0.5; B.position.z = -4.0;

    var RS = 9.0, YS = -2.5, RN = 4.4, YN1 = 8.5, YN2 = 14.5, WD = 0.38;

    /* профиль «лампочки»: шар -> конический переход -> обечайка -> купол */
    function bulb(w) {
      var p = [], n = 14, t, ang;
      for (i = 0; i <= n; i++) {                       // наружная сфера от -78° до +32°
        ang = (-78 + i * 110 / n) * Math.PI / 180;
        p.push([RS * Math.cos(ang), YS + RS * Math.sin(ang)]);
      }
      p.push([RN, YN1]); p.push([RN, YN2]);
      for (i = 1; i <= 10; i++) { ang = i / 10 * Math.PI / 2; p.push([RN * Math.cos(ang), YN2 + RN * Math.sin(ang)]); }
      for (i = 10; i >= 1; i--) { ang = i / 10 * Math.PI / 2; p.push([(RN - w) * Math.cos(ang), YN2 + (RN - w) * Math.sin(ang)]); }
      p.push([RN - w, YN2]); p.push([RN - w, YN1]);
      for (i = n; i >= 0; i--) {
        ang = (-78 + i * 110 / n) * Math.PI / 180;
        p.push([(RS - w) * Math.cos(ang), YS + (RS - w) * Math.sin(ang)]);
      }
      return p;
    }

    /* --- сухой колодец --- */
    var dw = K.grp('drywell');
    dw.add(K.mesh(openLathe(K, bulb(WD), 60, 96), M.steel));
    /* бетонный экран вокруг шара — сохраняет силуэт и в разрезе даёт толщину */
    dw.add(K.put(K.mesh(openLathe(K, [[10.4, 0], [10.4, 12.0], [9.55, 12.0], [9.55, 0]], 48, 120), M.concrete), 0, -11.4, 0));
    B.add(dw); P.drywell = dw;

    /* --- фланец крышки сухого колодца --- */
    var fl = K.grp('drywell_head_flange');
    fl.add(K.put(K.mesh(K.pipeGeo(5.25, 0.85, 0.75, 48), M.steel), 0, YN2 - 0.38, 0));
    var bolts = [];
    for (i = 0; i < 44; i++) { a = i / 44 * TAU; bolts.push([4.92 * Math.cos(a), 0, 4.92 * Math.sin(a)]); }
    fl.add(K.put(K.inst(K.cyl(0.10, 0.9, 6), M.hot, bolts), 0, YN2 - 0.05, 0));
    B.add(fl); P.drywell_head_flange = fl;

    /* --- тор барботёра: внешняя оболочка + объём воды внутри --- */
    var TR = 16.6, TT = 4.25, TY = -13.6, tor = K.grp();
    m = K.mesh(K.torus(TR, TT, 22, 56), M.steel); K.rot(m, Math.PI / 2, 0, 0); K.put(m, 0, TY, 0); tor.add(m);
    m = K.mesh(K.torus(TR, TT - 0.34, 20, 52), M.water); K.rot(m, Math.PI / 2, 0, 0); K.put(m, 0, TY, 0); tor.add(m);
    for (i = 0; i < 16; i++) {   // опоры-сёдла тора
      a = i / 16 * TAU;
      tor.add(K.put(K.edged(K.mesh(K.box(1.4, 2.4, 1.4), M.concrete)), TR * Math.cos(a), TY - 4.6, TR * Math.sin(a)));
    }
    /* восемь вентиляционных труб из сухого колодца в тор */
    for (i = 0; i < 8; i++) {
      a = i / 8 * TAU + Math.PI / 8;
      var sx = 7.55 * Math.cos(a), sz = 7.55 * Math.sin(a);
      tor.add(K.pipeRun([[sx, -7.5, sz], [(TR - 2.0) * Math.cos(a), -11.2, (TR - 2.0) * Math.sin(a)],
                         [TR * Math.cos(a), TY + TT * 0.55, TR * Math.sin(a)]], 0.92, 0.12, M.steel, 16));
    }
    B.add(tor);

    /* --- корпус реактора --- */
    var rpv = K.grp();
    rpv.add(K.put(K.mesh(openLathe(K, K.vesselProfile(2.45, 0.18, 12.6, 0.55, 0.55, 12), 44, 58), M.steel), 0, -3.6, 0));
    rpv.add(K.put(K.edged(K.mesh(K.cyl(2.85, 0.5, 40), M.steelDull)), 0, 8.8, 0));
    rpv.add(K.put(K.mesh(openLathe(K, [[3.05, 0], [3.05, 6.0], [2.90, 6.0], [2.90, 0]], 36, 150), M.concrete), 0, -11.2, 0)); // пьедестал
    B.add(rpv);

    /* нижнее днище с проходками приводов СУЗ */
    var bh = K.grp('rpv_bottom_head');
    bh.add(K.put(K.mesh(K.lathe([[0.02, 0], [2.45, 1.35], [2.45, 1.7], [0.02, 0.32]], 44), M.steel), 0, -5.3, 0));
    var crd = [], ll = K.lattice(1.85, 0.45);
    for (i = 0; i < ll.length; i++) crd.push([ll[i][0], 0, ll[i][1]]);
    bh.add(K.put(K.inst(K.pipeGeo(0.085, 0.028, 2.4, 6), M.steelDull, crd), 0, -7.6, 0));
    bh.add(K.put(K.inst(K.box(0.30, 1.5, 0.30), M.hot, crd), 0, -9.4, 0));   // гидроприводы СУЗ
    B.add(bh); P.rpv_bottom_head = bh;

    /* --- оболочки твэлов в активной зоне --- */
    var fcl = K.grp('fuel_cladding');
    var bl = K.lattice(1.75, 0.42), bb = [];
    for (i = 0; i < bl.length; i++) bb.push([bl[i][0], 0, bl[i][1]]);
    fcl.add(K.put(K.inst(K.pipeGeo(0.155, 0.045, 4.2, 8), M.clad, bb), 0, -2.6, 0));
    fcl.add(K.put(K.inst(K.cyl(0.10, 3.8, 6), M.fuel, bb), 0, -0.6, 0));
    B.add(fcl); P.fuel_cladding = fcl;

    /* --- петли рециркуляции --- */
    var rec = K.grp('recirculation_line');
    for (i = 0; i < 2; i++) {
      var s = i ? 1 : -1;
      rec.add(K.pipeRun([[s * 2.4, -1.0, 0], [s * 5.4, -1.0, 0], [s * 5.4, -6.4, 0]], 0.62, 0.09, M.steel, 18));
      rec.add(K.put(K.edged(K.mesh(K.cyl(1.05, 1.5, 20), M.steel)), s * 5.4, -7.2, 0));        // насос
      rec.add(K.put(K.edged(K.mesh(K.cyl(0.68, 2.6, 16), M.steelDull)), s * 5.4, -9.6, 0));
      rec.add(K.pipeRun([[s * 5.4, -7.2, 0], [s * 6.9, -7.2, 0], [s * 6.9, -3.4, 0]], 0.52, 0.08, M.steel, 16));
      m = K.mesh(K.torus(6.9, 0.4, 10, 34), M.steel); K.rot(m, Math.PI / 2, 0, 0); K.put(m, 0, -3.4, 0); rec.add(m);
      for (j = 0; j < 5; j++) {
        a = (i ? 0 : Math.PI) + (j - 2) * 0.32;
        rec.add(K.pipeRun([[6.9 * Math.cos(a), -3.4, 6.9 * Math.sin(a)], [2.9 * Math.cos(a), -2.4, 2.9 * Math.sin(a)]], 0.22, 0.05, M.steel, 10));
      }
    }
    B.add(rec); P.recirculation_line = rec;

    /* --- ПК/БРУ: сёдла предохранительных клапанов на паропроводах --- */
    var srv = K.grp('srv_seat');
    for (i = 0; i < 4; i++) {
      a = -Math.PI / 2 + (i - 1.5) * 0.30;
      x = 4.6 * Math.cos(a); z = 4.6 * Math.sin(a);
      srv.add(K.pipeRun([[2.5 * Math.cos(a), 7.2, 2.5 * Math.sin(a)], [x, 7.2, z]], 0.34, 0.06, M.steelDull, 14));
      g = K.valveBody(0.32, M.hot); K.put(g, x, 7.2, z); srv.add(g);
      g = K.valveDrive(0.32, M.steelDull, M.hot); K.put(g, x, 7.2, z); srv.add(g);
      /* сбросной трубопровод в тор, на гаситель */
      srv.add(K.pipeRun([[x, 7.2, z], [x * 1.5, 5.2, z * 1.5], [x * 1.5, -11.0, z * 1.5],
                         [TR * Math.cos(a), TY + 1.0, TR * Math.sin(a)], [TR * Math.cos(a), TY - 1.4, TR * Math.sin(a)]],
                        0.24, 0.05, M.steelDull, 12));
    }
    B.add(srv); P.srv_seat = srv;

    /* --- уравнительная колонка уровня --- */
    var lvl = K.grp('level_reference_leg');
    lvl.add(K.put(K.mesh(K.pipeGeo(0.30, 0.07, 1.4, 16), M.steel), 3.1, 7.4, 1.6));   // конденсационный сосуд
    lvl.add(K.pipeRun([[2.5, 8.0, 1.4], [3.1, 8.0, 1.6], [3.1, 7.4, 1.6]], 0.10, 0.03, M.steel, 8));
    lvl.add(K.pipeRun([[3.1, 7.4, 1.6], [3.1, -2.0, 1.6], [6.6, -5.4, 2.6]], 0.075, 0.025, M.hot, 8));
    lvl.add(K.put(K.edged(K.mesh(K.box(1.1, 1.9, 0.7), M.steelDull)), 6.9, -6.5, 2.6)); // стойка приборов
    B.add(lvl); P.level_reference_leg = lvl;

    /* --- реакторное здание: показано вскрытым, две дальние стены и
           перекрытия по отметкам, иначе оболочки Mark I вообще не видно --- */
    var RBW = 40, RBD = 42, WB = 1.3;
    var rb = K.grp();
    rb.add(K.put(K.edged(K.mesh(K.box(RBW + 2, 2.2, RBD + 2), M.concrete)), 0, -19.1, 0));           // фундаментная плита
    rb.add(K.put(K.edged(K.mesh(K.box(WB, 48.0, RBD), M.concrete)), -RBW / 2 + WB / 2, 6.0, 0));     // стена -X
    rb.add(K.put(K.edged(K.mesh(K.box(RBW - WB, 48.0, WB), M.concrete)), WB / 2, 6.0, -RBD / 2 + WB / 2)); // стена -Z
    /* три угловые колонны на месте снятых стен; ближний угол оставлен пустым */
    rb.add(K.put(K.edged(K.mesh(K.box(WB, 48.0, WB), M.concrete)), RBW / 2 - WB / 2, 6.0, -RBD / 2 + WB / 2));
    rb.add(K.put(K.edged(K.mesh(K.box(WB, 48.0, WB), M.concrete)), -RBW / 2 + WB / 2, 6.0, RBD / 2 - WB / 2));
    /* перекрытия: фундаментная плита и отметка площадки целиком по дальней
       половине, промежуточные — узкими галереями вдоль дальних стен */
    rb.add(K.put(K.edged(K.mesh(K.box(RBW, 1.0, RBD), M.concrete)), 0, -18.0, 0));
    rb.add(K.put(K.edged(K.mesh(K.box(RBW, 0.9, RBD / 2), M.concrete)), 0, 0.0, -RBD / 4));
    for (i = 0; i < 2; i++) {
      var yy = 10.0 + i * 10.0;
      rb.add(K.put(K.edged(K.mesh(K.box(9.0, 0.8, RBD), M.concrete)), -RBW / 2 + 4.5, yy, 0));
      rb.add(K.put(K.edged(K.mesh(K.box(RBW - 9.0, 0.8, 9.0), M.concrete)), 4.5, yy, -RBD / 2 + 4.5));
    }
    rb.add(K.put(K.edged(K.mesh(K.box(RBW, 0.9, RBD / 2), M.concrete)), 0, 30.4, -RBD / 4));
    /* лёгкий верхний этаж: каркас и тонкие панели — именно он и сорвался */
    for (i = 0; i <= 5; i++) {
      x = -RBW / 2 + i * RBW / 5;
      rb.add(K.put(K.edged(K.mesh(K.box(0.55, 13.0, 0.55), M.steelDull)), x, 37.4, -RBD / 2 + 0.6));
      if (x <= 0) rb.add(K.put(K.edged(K.mesh(K.box(0.55, 13.0, 0.55), M.steelDull)), x, 37.4, RBD / 2 - 0.6));
      rb.add(K.put(K.edged(K.mesh(K.box(0.4, 0.4, x > 0 ? RBD / 2 : RBD - 1.0), M.steelDull)), x, 43.7, x > 0 ? -RBD / 4 : 0));
    }
    rb.add(K.put(K.edged(K.mesh(K.box(RBW, 12.4, 0.14), M.frame)), 0, 37.2, -RBD / 2 + 0.3));
    rb.add(K.put(K.edged(K.mesh(K.box(RBW / 2, 12.4, 0.14), M.frame)), -RBW / 4, 37.2, RBD / 2 - 0.3));
    rb.add(K.put(K.edged(K.mesh(K.box(0.14, 12.4, RBD), M.frame)), -RBW / 2 + 0.3, 37.2, 0));
    rb.add(K.put(K.edged(K.mesh(K.box(0.14, 12.4, RBD / 2), M.frame)), RBW / 2 - 0.3, 37.2, -RBD / 4));
    rb.add(K.put(K.edged(K.mesh(K.box(RBW + 0.6, 0.20, RBD / 2), M.frame)), 0, 44.0, -RBD / 4));
    rb.add(K.put(K.edged(K.mesh(K.box(RBW / 2 + 0.6, 0.20, RBD / 2), M.frame)), -RBW / 4, 44.0, RBD / 4));
    rb.add(K.put(K.edged(K.mesh(K.box(1.0, 1.4, RBD - 2), M.steelDull)), -13.0, 41.6, 0));  // перегрузочный кран
    B.add(rb);

    /* --- бассейн выдержки --- */
    var sfp = K.grp('spent_fuel_pool');
    sfp.add(K.hollowBox(12.0, 12.6, 10.0, 1.3, { material: M.concrete, cut: false }));
    sfp.add(K.put(K.mesh(K.box(9.2, 11.0, 7.2), M.water), 0, 6.6, 0));
    var rk = [];
    for (i = 0; i < 4; i++) for (j = 0; j < 3; j++) rk.push([-3.3 + i * 2.2, 0, -2.2 + j * 2.2]);
    sfp.add(K.put(K.inst(K.box(1.9, 4.2, 1.9), M.clad, rk), 0, 4.0, 0));
    K.put(sfp, 12.0, 18.0, -11.0);
    B.add(sfp); P.spent_fuel_pool = sfp;

    var fpc = K.grp('spent_fuel_pool_cooling');
    fpc.add(K.put(K.edged(K.mesh(K.cyl(1.0, 1.4, 20), M.steel)), 14.0, 7.0, -16.0));
    fpc.add(K.put(K.edged(K.mesh(K.cyl(0.65, 2.4, 16), M.steelDull)), 14.0, 9.1, -16.0));
    fpc.add(K.put(K.rot(K.mesh(K.pipeGeo(1.15, 0.16, 6.0, 20), M.steelDull), 0, 0, Math.PI / 2), 6.6, 7.0, -16.0)); // теплообменник
    fpc.add(K.pipeRun([[12.0, 26.0, -11.0], [12.0, 10.0, -14.0], [14.0, 8.0, -16.0]], 0.28, 0.06, M.steelDull, 12));
    fpc.add(K.pipeRun([[9.0, 7.0, -16.0], [9.0, 27.0, -13.0], [11.0, 27.0, -11.0]], 0.28, 0.06, M.steelDull, 12));
    B.add(fpc); P.spent_fuel_pool_cooling = fpc;

    /* --- изоляционный конденсатор, RCIC и их управление на постоянном токе --- */
    var ic = K.grp('ic_and_rcic_dc_control');
    for (i = 0; i < 2; i++) {
      z = (i ? 1 : -1) * 8.0;
      ic.add(K.put(K.mesh(openLathe(K, [[2.5, 0], [2.5, 6.4], [2.3, 6.4], [2.3, 0]], 32, 70), M.steelDull), -14.5, 22.0, z));
      ic.add(K.put(K.mesh(K.cyl(2.25, 5.2, 28), M.water), -14.5, 24.4, z));
      ic.add(K.pipeRun([[-14.5, 22.0, z], [-14.5, 12.0, z], [-3.0, 10.0, z * 0.25], [0.0, 9.6, z * 0.12]], 0.26, 0.055, M.steelDull, 12));
      g = K.valveBody(0.26, M.hot); K.put(g, -14.5, 15.0, z); ic.add(g);
      g = K.valveDrive(0.26, M.steelDull, M.hot); K.put(g, -14.5, 15.0, z); ic.add(g);
    }
    ic.add(K.put(K.edged(K.mesh(K.box(3.4, 1.8, 2.0), M.steel)), 13.0, -14.6, 8.0));      // турбина RCIC
    ic.add(K.put(K.edged(K.mesh(K.cyl(0.85, 2.2, 18), M.steelDull)), 15.4, -14.6, 8.0));
    for (i = 0; i < 3; i++)
      ic.add(K.put(K.edged(K.mesh(K.box(0.9, 1.9, 0.7), M.hot)), 10.4 + i * 1.1, -15.0, 10.6)); // шкафы управления =24 В
    B.add(ic); P.ic_and_rcic_dc_control = ic;

    /* --- щиты постоянного тока --- */
    var dcs = K.grp('dc_switchgear');
    for (i = 0; i < 10; i++)
      dcs.add(K.put(K.edged(K.mesh(K.box(1.0, 2.1, 0.8), i < 5 ? M.hot : M.steelDull)),
                    -5.0 + (i % 5) * 1.15, 1.05, (i < 5 ? 0 : 1.6)));
    dcs.add(K.put(K.edged(K.mesh(K.box(8.0, 0.3, 0.8), M.frame)), -2.6, 2.6, 0.8));
    K.put(dcs, -13.0, -17.0, 13.0);
    B.add(dcs); P.dc_switchgear = dcs;

    /* --- внешнее питание и аварийные дизель-генераторы --- */
    var pwr = K.grp('offsite_power_and_edg');
    pwr.add(K.put(K.pylon(17, 3.6, M.steelDull), 30.0, 0, -22.0));
    pwr.add(K.put(K.edged(K.mesh(K.box(4.2, 3.4, 3.2), M.steelDull)), 25.0, 1.7, -26.0));
    pwr.add(K.pipeRun([[30.0, 15.0, -22.0], [25.0, 4.6, -26.0]], 0.08, 0.03, M.frame, 6));
    for (i = 0; i < 2; i++) {   // ДГ в подвале, ниже отметки площадки
      z = (i ? 1 : -1) * 6.0;
      pwr.add(K.put(K.edged(K.mesh(K.box(5.4, 2.4, 2.2), M.steel)), 14.0, -16.0, z));
      pwr.add(K.put(K.edged(K.mesh(K.cyl(1.05, 2.8, 18), M.steelDull)), 17.8, -16.0, z));
      pwr.add(K.put(K.edged(K.mesh(K.box(1.2, 2.2, 1.0), M.hot)), 10.4, -16.1, z));
    }
    B.add(pwr); P.offsite_power_and_edg = pwr;

    /* --- планировочная отметка площадки и берег --- */
    var gr = K.grp('site_grade');
    gr.add(K.put(K.edged(K.mesh(K.box(24, 2.6, 66), M.base)), -33.0, -1.3, 0));        // площадка слева
    gr.add(K.put(K.edged(K.mesh(K.box(24, 2.6, 33), M.base)), 33.0, -1.3, -16.5));     // площадка справа
    gr.add(K.put(K.edged(K.mesh(K.box(42, 2.6, 12), M.base)), 0, -1.3, -27.0));
    gr.add(K.put(K.edged(K.mesh(K.box(21, 2.6, 12), M.base)), -10.5, -1.3, 27.0));
    gr.add(K.put(K.edged(K.mesh(K.box(90, 1.2, 4.0), M.concrete)), 0, 0.0, 33.0));      // низкий волнолом
    m = K.edged(K.mesh(K.box(90, 8.0, 6.0), M.base)); K.put(m, 0, -5.4, 36.0); m.rotation.x = 0.45; gr.add(m);
    gr.add(K.put(K.mesh(K.box(90, 0.4, 16.0), M.water), 0, -7.0, 44.0));                // море
    B.add(gr); P.site_grade = gr;

    /* --- насосы технической морской воды --- */
    var sw = K.grp('seawater_service_pumps');
    sw.add(K.hollowBox(16.0, 7.0, 9.0, 0.6, { material: M.concrete, roof: true }));
    for (i = 0; i < 4; i++) {
      sw.add(K.put(K.edged(K.mesh(K.cyl(0.95, 1.3, 20), M.steel)), -5.4 + i * 3.6, 1.0, 0));
      sw.add(K.put(K.edged(K.mesh(K.cyl(0.6, 3.2, 16), M.steelDull)), -5.4 + i * 3.6, 3.2, 0));
      sw.add(K.put(K.mesh(K.pipeGeo(0.48, 0.09, 5.0, 14), M.steelDull), -5.4 + i * 3.6, -5.0, 0));
    }
    K.put(sw, 6.0, -6.6, 29.0);
    B.add(sw); P.seawater_service_pumps = sw;

    /* --- вентиляционная труба (общая на два блока) --- */
    var stack = K.grp();
    stack.add(K.put(K.mesh(K.pipeGeo(1.45, 0.16, 34, 24), M.steelDull), -26.0, 0.5, -15.0));
    stack.add(K.put(K.pylon(30, 4.4, M.steelDull), -26.0, 0, -15.0));
    B.add(stack);

    /* --- сброс давления из тора и усиленная линия сброса --- */
    var rel = K.grp('containment_pressure_relief');
    rel.add(K.pipeRun([[-TR, TY + TT * 0.8, 0], [-19.5, -9.0, 0], [-19.5, 2.0, 0]], 0.46, 0.08, M.steelDull, 16));
    rel.add(K.put(K.mesh(K.pipeGeo(0.72, 0.22, 0.9, 20), M.hot), -19.5, -4.0, 0));      // разрывная мембрана
    rel.add(K.pipeRun([[-19.5, 2.0, 0], [-19.5, 8.0, 0], [-23.5, 8.0, -6.0], [-26.0, 8.0, -13.0], [-26.0, 24.0, -15.0]], 0.40, 0.07, M.steelDull, 14));
    B.add(rel); P.containment_pressure_relief = rel;

    var hv = K.grp('hardened_vent_valve');
    g = K.valveBody(0.46, M.hot); K.put(g, -19.5, 5.0, 0); hv.add(g);
    g = K.valveDrive(0.46, M.steelDull, M.hot); K.put(g, -19.5, 5.0, 0); hv.add(g);
    hv.add(K.put(K.edged(K.mesh(K.box(1.5, 1.1, 1.0), M.steelDull)), -21.4, 5.0, 0));    // пневмопривод и баллон
    hv.add(K.put(K.edged(K.mesh(K.cyl(0.32, 1.4, 14), M.frame)), -22.6, 5.0, 0.9));
    B.add(hv); P.hardened_vent_valve = hv;

    /* --- перемычка СГОГ между блоками --- */
    var sg = K.grp('sgts_crosstie');
    sg.add(K.put(K.edged(K.mesh(K.box(9.0, 1.6, 1.6), M.steelDull)), -24.0, 26.0, 9.0));
    sg.add(K.put(K.edged(K.mesh(K.box(1.6, 1.6, 11.0), M.steelDull)), -28.0, 26.0, 3.8));
    sg.add(K.put(K.edged(K.mesh(K.box(1.6, 1.6, 6.0), M.steelDull)), -28.0, 26.0, -6.6)); // ветка к соседнему блоку
    g = K.valveBody(0.85, M.hot); K.put(g, -28.0, 26.0, 0.0); K.rot(g, Math.PI / 2, 0, 0); sg.add(g);
    sg.add(K.put(K.edged(K.mesh(K.box(2.6, 2.6, 2.6), M.steelDull)), -24.0, 26.0, 13.0)); // фильтр-адсорбер
    B.add(sg); P.sgts_crosstie = sg;

    return { group: F.root, parts: P };
  }

  /* =================================================================
     7. GEN3 — поколение III+: двойная оболочка, ловушка расплава под
        корпусом, баки пассивного отвода тепла наверху
     ================================================================= */
  function buildGEN3(THREE, palette) {
    var K = Kit(THREE, palette), M = K.M, P = {};
    var F = frame(THREE, 8.2, 30.0), B = F.body, i, j, a, m, x, z, g;
    B.position.x = 5.0;

    /* --- двойная оболочка: стальная внутренняя + бетонная наружная --- */
    var bld = K.grp('reactor_building');
    bld.add(K.mesh(openLathe(K, K.domeProfile(23.0, 1.0, 36, 18), 64, 96), M.concrete));   // наружная защитная
    bld.add(K.mesh(openLathe(K, K.domeProfile(19.5, 0.55, 28, 16), 56, 118), M.steel));    // внутренняя стальная
    bld.add(K.put(K.edged(K.mesh(K.cyl(24.5, 4.0, 56), M.concrete)), 0, -2.0, 0));         // фундаментная плита
    /* кольцевые воздухозаборники пассивного охлаждения оболочки */
    var lv = [];
    for (i = 0; i < 40; i++) { a = i / 40 * TAU; lv.push([22.6 * Math.cos(a), 0, 22.6 * Math.sin(a), 0, -a, 0]); }
    bld.add(K.put(K.inst(K.box(0.22, 3.2, 2.6), M.frame, lv), 0, 37.6, 0));
    /* внутренние бетонные конструкции и обслуживаемый пол */
    bld.add(K.put(K.mesh(openLathe(K, [[18.2, 0], [18.2, 0.7], [8.0, 0.7], [8.0, 0]], 52, 110), M.concrete), 0, 4.65, 0));
    bld.add(K.put(K.mesh(openLathe(K, [[8.0, 0], [8.0, 13.0], [6.4, 13.0], [6.4, 0]], 44, 150), M.concrete), 0, 3.0, 0)); // шахта реактора
    B.add(bld); P.reactor_building = bld;

    /* --- баки пассивного отвода тепла на оболочке --- */
    var pcc = K.grp();
    pcc.add(K.put(K.mesh(K.annulusTank(19.0, 13.5, 9.0), M.steelDull), 0, 45.0, 0));
    pcc.add(K.put(K.mesh(K.annulusTank(18.6, 13.9, 7.6), M.water), 0, 45.4, 0));
    pcc.add(K.put(K.mesh(K.pipeGeo(3.6, 0.35, 10.0, 28), M.concrete), 0, 54.0, 0));    // вытяжная шахта
    for (i = 0; i < 10; i++) {                                                         // сливные каналы на стальной купол
      a = i / 10 * TAU;
      pcc.add(K.pipeRun([[14.2 * Math.cos(a), 45.6, 14.2 * Math.sin(a)], [10.0 * Math.cos(a), 41.0, 10.0 * Math.sin(a)]], 0.24, 0.05, M.steelDull, 8));
    }
    B.add(pcc);

    /* --- ловушка расплава под корпусом --- */
    var cat = K.grp();
    cat.add(K.put(K.mesh(K.lathe([[3.4, 0], [6.4, 5.2], [7.3, 5.2], [4.2, -0.8]], 48, Math.PI * 0.25 + 1.05, Math.PI * 2 - 2.1), M.steel), 0, 0.4, 0)); // корпус ловушки
    cat.add(K.put(K.mesh(K.lathe([[3.2, 0.5], [6.1, 5.0], [6.1, 4.2], [3.2, -0.2]], 48, Math.PI * 0.25 + 1.05, Math.PI * 2 - 2.1), M.fuel), 0, 0.4, 0)); // жертвенный материал
    for (i = 0; i < 16; i++) {  // каналы охлаждения по наружной стенке
      a = i / 16 * TAU;
      cat.add(K.pipeRun([[7.0 * Math.cos(a), 5.4, 7.0 * Math.sin(a)], [4.6 * Math.cos(a), 0.0, 4.6 * Math.sin(a)]], 0.16, 0.04, M.steelDull, 6));
    }
    B.add(cat);

    /* --- корпус реактора --- */
    var ves = K.grp('reactor_vessel');
    var vp = [], seg = 12;
    vp.push([2.45, 0]); vp.push([2.45, 8.4]);
    for (i = 1; i <= seg; i++) { a = i / seg * Math.PI / 2; vp.push([2.45 * Math.cos(a), 8.4 + 1.30 * 2.45 * Math.sin(a) / 2]); }
    for (i = seg; i >= 1; i--) { a = i / seg * Math.PI / 2; vp.push([2.20 * Math.cos(a), 8.4 + 1.30 * 2.20 * Math.sin(a) / 2]); }
    vp.push([2.20, 8.4]); vp.push([2.20, 0]);
    ves.add(K.put(K.mesh(openLathe(K, vp, 48, 58), M.steel), 0, 10.0, 0));
    ves.add(K.put(K.edged(K.mesh(K.cyl(2.90, 0.6, 40), M.steelDull)), 0, 18.2, 0));   // фланец главного разъёма
    ves.add(K.put(K.edged(K.mesh(K.cyl(3.3, 1.0, 44), M.concrete)), 0, 14.5, 0));     // опорное кольцо
    B.add(ves); P.reactor_vessel = ves;

    var lh = K.tag(K.grp(), 'vessel_lower_head');
    lh.add(K.put(K.mesh(K.lathe([[0.02, 0], [2.45, 1.42], [2.45, 1.70], [0.02, 0.30]], 44), M.steel), 0, 8.4, 0));
    B.add(lh); P.vessel_lower_head = lh;

    /* --- активная зона: сборки и один твэл отдельно --- */
    var fl = K.lattice(1.72, 0.42), fb = [];
    for (i = 0; i < fl.length; i++) fb.push([fl[i][0], 0, fl[i][1]]);
    var fcl = K.grp('fuel_cladding');
    fcl.add(K.put(K.inst(K.pipeGeo(0.16, 0.045, 4.2, 8), M.clad, fb), 0, 10.4, 0));
    fcl.add(K.put(K.inst(K.cyl(0.10, 3.9, 6), M.fuel, fb), 0, 12.5, 0));
    for (i = 0; i < 4; i++) fcl.add(K.put(K.mesh(K.torus(1.80, 0.055, 6, 32), M.steelDull), 0, 11.0 + i * 1.1, 0));
    B.add(fcl); P.fuel_cladding = fcl;

    var frc = K.grp('fuel_rod_cladding');
    frc.add(K.put(K.mesh(K.pipeGeo(0.19, 0.055, 4.6, 20), M.clad), 0, 0, 0));
    frc.add(K.put(K.edged(K.mesh(K.cyl(0.125, 4.1, 16), M.fuel)), 0, 2.3, 0));
    frc.add(K.put(K.edged(K.mesh(K.cyl(0.10, 0.4, 12), M.clad)), 0, 4.8, 0));
    frc.add(K.put(K.edged(K.mesh(K.box(1.1, 0.25, 1.1), M.frame)), 0, 0, 0));
    K.put(frc, 7.6, 5.7, 7.0);
    B.add(frc); P.fuel_rod_cladding = frc;

    /* --- приводы СУЗ и направляющие каналы ОР СУЗ --- */
    var hp = [[0, 0, 0]];
    for (i = 0; i < 8; i++) { a = i / 8 * TAU; hp.push([0.60 * Math.cos(a), 0, 0.60 * Math.sin(a)]); }
    for (i = 0; i < 14; i++) { a = (i + 0.5) / 14 * TAU; hp.push([1.16 * Math.cos(a), 0, 1.16 * Math.sin(a)]); }
    for (i = 0; i < 18; i++) { a = i / 18 * TAU; hp.push([1.70 * Math.cos(a), 0, 1.70 * Math.sin(a)]); }
    var crd = K.grp('cr_drive_housing');
    crd.add(K.put(K.inst(K.pipeGeo(0.125, 0.035, 4.4, 10), M.steel, hp), 0, 18.6, 0));
    crd.add(K.put(K.inst(K.cyl(0.165, 3.8, 10), M.steelDull, hp), 0, 24.9, 0));
    crd.add(K.put(K.edged(K.mesh(K.cyl(2.4, 0.4, 36), M.frame)), 0, 27.2, 0));
    B.add(crd); P.cr_drive_housing = crd;

    var gt = K.grp('rcca_guide_tubes');
    gt.add(K.put(K.inst(K.pipeGeo(0.115, 0.032, 4.2, 8), M.steelDull, hp), 0, 14.2, 0));
    gt.add(K.put(K.inst(K.cyl(0.05, 4.0, 6), M.hot, hp), 0, 16.4, 0));
    B.add(gt); P.rcca_guide_tubes = gt;

    /* --- два вертикальных парогенератора с встроенными ГЦН --- */
    var sgs = K.grp(), sgt = K.grp('steam_generator_tubes'), SGX = 11.6;
    for (i = 0; i < 2; i++) {
      x = (i ? 1 : -1) * SGX;
      sgs.add(K.put(K.mesh(openLathe(K, K.domeProfile(2.60, 0.16, 22.0, 12), 44, 58), M.steel), x, 8.0, 0));
      sgs.add(K.put(K.mesh(K.sph(2.55, 26, 16), M.steel), x, 8.0, 0));                 // коллекторная камера
      sgs.add(K.put(K.edged(K.mesh(K.cyl(2.9, 0.6, 36), M.concrete)), x, 5.6, 0));
      sgs.add(K.put(K.edged(K.mesh(K.cyl(0.60, 1.2, 18), M.steelDull)), x, 31.0, 0));
      /* два герметичных ГЦН прямо на камере */
      for (j = 0; j < 2; j++) {
        z = (j ? 1 : -1) * 2.1;
        sgs.add(K.put(K.edged(K.mesh(K.cyl(0.95, 2.6, 20), M.steel)), x, 6.6, z));
        sgs.add(K.put(K.edged(K.mesh(K.cyl(0.78, 1.8, 18), M.steelDull)), x, 4.6, z));
      }
      var tl = K.lattice(1.9, 0.40), tb = [], bd = [];
      for (j = 0; j < tl.length; j++) {
        if (Math.abs(tl[j][1]) < 0.14) continue;
        tb.push([tl[j][0], 0, tl[j][1]]);
        if (tl[j][1] > 0) bd.push([tl[j][0], 0, 0, 0, Math.PI / 2, 0]);
      }
      sgt.add(K.put(K.inst(K.pipeGeo(0.042, 0.013, 14.0, 6), M.steelDull, tb), x, 10.4, 0));
      sgt.add(K.put(K.inst(K.torus(0.34, 0.042, 6, 12), M.steelDull, bd), x, 24.6, 0));
      sgs.add(K.put(K.edged(K.mesh(K.cyl(2.25, 0.6, 32), M.steelDull)), x, 10.2, 0));
    }
    B.add(sgs); B.add(sgt); P.steam_generator_tubes = sgt;

    /* --- главные трубопроводы: две горячие нитки, четыре холодные --- */
    var mcl = K.grp('main_coolant_line');
    for (i = 0; i < 2; i++) {
      x = (i ? 1 : -1) * SGX;
      mcl.add(K.pipeRun([[(i ? 1 : -1) * 2.2, 16.0, 0], [(i ? 1 : -1) * 5.2, 16.0, 0],
                         [x, 12.6, 0], [x, 9.4, 0]], 0.52, 0.08, M.steelDull, 20));
      for (j = 0; j < 2; j++) {
        z = (j ? 1 : -1) * 2.1;
        mcl.add(K.pipeRun([[x, 5.2, z], [x * 0.62, 5.2, z], [(i ? 1 : -1) * 2.2, 13.4, z * 0.35]], 0.42, 0.07, M.steel, 18));
      }
    }
    B.add(mcl); P.main_coolant_line = mcl;

    /* --- контур пассивного отвода тепла PRHR внутри бака-приямка --- */
    var prhr = K.grp('prhr_natural_circulation_loop');
    prhr.add(K.put(K.hollowBox(17.0, 12.0, 9.0, 0.7, { material: M.concrete, cut: false }), 0, 5.8, -14.5));
    prhr.add(K.put(K.mesh(K.box(15.4, 10.0, 7.4), M.water), 0, 11.6, -14.5));
    for (i = 0; i < 9; i++) {   // C-образный пучок теплообменника в баке
      x = -3.6 + i * 0.9;
      prhr.add(K.pipeRun([[x, 15.4, -12.0], [x, 8.2, -12.0], [x, 8.2, -17.0], [x, 15.4, -17.0]], 0.10, 0.03, M.steelDull, 8));
    }
    prhr.add(K.pipeRun([[-2.2, 16.0, 0], [-2.2, 17.4, -6.0], [0.0, 16.4, -12.0]], 0.30, 0.06, M.steelDull, 14));  // подвод от горячей нитки
    prhr.add(K.pipeRun([[0.0, 16.4, -17.0], [-8.0, 9.6, -17.0], [-SGX, 8.0, -2.4]], 0.30, 0.06, M.steelDull, 14)); // возврат в камеру ПГ
    g = K.valveBody(0.32, M.hot); K.put(g, -1.0, 17.0, -8.6); prhr.add(g);
    g = K.valveDrive(0.32, M.steelDull, M.hot); K.put(g, -1.0, 17.0, -8.6); prhr.add(g);
    B.add(prhr); P.prhr_natural_circulation_loop = prhr;

    /* --- затопление шахты реактора --- */
    var rcf = K.grp('reactor_cavity_flooding');
    m = K.mesh(K.lathe([[6.2, 0], [6.2, 10.4], [3.6, 10.4], [3.6, 0]], 40, Math.PI * 0.25 + 1.31, Math.PI * 2 - 2.62), M.water); K.put(m, 0, 3.2, 0); rcf.add(m);  // залитый объём шахты
    for (i = 0; i < 2; i++) {
      z = (i ? 1 : -1) * 6.0;
      rcf.add(K.pipeRun([[0.0, 6.4, -10.5], [0.0, 4.4, -10.5], [z * 0.6, 4.4, -8.4], [z * 0.9, 4.4, 0.0]], 0.46, 0.08, M.steelDull, 14));
      g = K.valveBody(0.48, M.hot); K.put(g, z * 0.75, 4.4, -5.2); rcf.add(g);
      g = K.valveDrive(0.48, M.steelDull, M.hot); K.put(g, z * 0.75, 4.4, -5.2); rcf.add(g);
    }
    B.add(rcf); P.reactor_cavity_flooding = rcf;

    /* --- линия подпитки КМПЦ --- */
    var cv = K.grp('cvcs_makeup_line');
    cv.add(K.put(K.edged(K.mesh(K.box(4.0, 2.4, 3.0), M.frame)), 13.0, 6.2, -11.0));
    cv.add(K.put(K.edged(K.mesh(K.cyl(0.6, 1.8, 18), M.steel)), 13.0, 8.3, -11.0));
    cv.add(K.put(K.mesh(openLathe(K, K.vesselProfile(1.5, 0.12, 4.0, 0.7, 0.7, 8), 32, 60), M.steelDull), 15.0, 6.0, -15.0)); // бак подпитки
    cv.add(K.pipeRun([[15.0, 8.0, -15.0], [13.0, 9.2, -11.0], [13.0, 9.2, -4.0], [SGX * 0.62, 5.6, -2.1]], 0.17, 0.045, M.steel, 12));
    g = K.valveBody(0.18, M.hot); K.put(g, 13.0, 9.2, -7.4); cv.add(g);
    B.add(cv); P.cvcs_makeup_line = cv;

    /* --- внешнее электроснабжение --- */
    var osp = K.grp('offsite_power');
    osp.add(K.put(K.pylon(18, 3.8, M.steelDull), -34.0, 0, -12.0));
    osp.add(K.put(K.pylon(18, 3.8, M.steelDull), -34.0, 0, 2.0));
    for (i = 0; i < 3; i++) {
      osp.add(K.put(K.edged(K.mesh(K.box(4.2, 3.6, 3.2), M.steelDull)), -29.0, 1.8, -12.0 + i * 5.0));
      osp.add(K.put(K.edged(K.mesh(K.cyl(0.35, 2.4, 12), M.frame)), -29.0, 4.9, -12.0 + i * 5.0));
    }
    osp.add(K.pipeRun([[-34.0, 16.0, -5.0], [-29.0, 5.6, -7.0]], 0.09, 0.03, M.frame, 6));
    osp.add(K.pipeRun([[-29.0, 5.6, -2.0], [-24.0, 5.6, -2.0]], 0.24, 0.06, M.frame, 8));
    B.add(osp); P.offsite_power = osp;

    B.add(K.put(K.edged(K.mesh(K.box(74, 1.0, 56), M.base)), -6.0, -4.5, 0));
    return { group: F.root, parts: P };
  }

  /* =================================================================
     Реестр
     ================================================================= */
  global.REACTOR_MODELS = {

    PILE: {
      build: buildPILE,
      section: { axis: 'z', from: 5.6, to: -5.6 },
      camera: { garage: [15.44, 5.56, 13.89], section: [0.0, 1.5, 21.45] },
      fit: 16.3,
      note: 'Урановый котёл первого поколения: Chicago Pile-1 в габаритах Уиндскейла. ' +
            'Кладка — 19 курсов графитовых блоков, приближённый эллипсоид Ø9.1 × 6.5 м ' +
            '(CP-1: 57 слоёв, ширина 7.6 м, высота 6 м); сквозь неё горизонтальная решётка ' +
            'каналов воздушного охлаждения с шагом 0.72 м. Стержни спущены сверху на тросах с ' +
            'мостика, отдельно направляющая ZIP-стержня с грузом и топором у каната. Биологическая ' +
            'защита — бетонная коробка 15 × 15 м со стенкой 1.6 м; на оголовке трубы фильтровальная ' +
            'галерея Кокрофта. Труба укорочена до 20 м против реальных 125 м — иначе установка ' +
            'не помещается в кадр. Нагнетатели и напорный пленум на зарядной стороне.'
    },

    MAGNOX: {
      build: buildMAGNOX,
      section: { axis: 'z', from: 4.9, to: -4.9 },
      camera: { garage: [13.62, 4.63, 12.26], section: [0.0, 0.94, 18.88] },
      fit: 14.3,
      note: 'Газоохлаждаемый реактор на природном уране, компоновка Колдер-Холла. ' +
            'Стальной корпус давления Ø11.3 × 21 м с торосферическими днищами, вокруг него ' +
            'биологическая защита 2.2 м и бетонный блок 22 × 22 × 26 м. Четыре парогенератора ' +
            'Ø5.7 × 24 м стоят СНАРУЖИ блока — это и есть узнаваемый силуэт серии. ' +
            'Расставлены по осям, чтобы в гаражном ракурсе ни один не закрывал корпус. ' +
            'Магистрали CO2 Ø1.6 м: горячие сверху, холодные снизу через восемь газодувок. ' +
            'Внутри графитовая кладка Ø9.2 × 6.4 м с вертикальными топливными каналами; ' +
            'на куполе поле стояков перегрузки. Топливо — урановый пруток в магноксовой ' +
            'оболочке со спиральным оребрением.'
    },

    RBMK: {
      build: buildRBMK,
      section: { axis: 'z', from: 3.6, to: -3.6 },
      camera: { garage: [13.67, 6.01, 11.75], section: [0.0, 0.95, 18.98] },
      fit: 14.4,
      note: 'Канальный уран-графитовый реактор. Кладка Ø11.8 × 7 м — широкая и приземистая, ' +
            'в бетонной шахте, снизу схема «ОР», сверху схема «Е» и настил из пятаков. ' +
            'Через кладку 1661 топливный и 211 СУЗ-каналов (в модели решётка с шагом 0.62 м, ' +
            'каждый седьмой отдан СУЗ). Четыре барабана-сепаратора Ø2.6 × 31 м лежат попарно ' +
            'по бокам над центральным залом, восемь ГЦН — в боксах ниже. Разгрузочно-загрузочная ' +
            'машина висит на мостовом кране. Герметичной оболочки НЕТ: верх здания — лёгкий ' +
            'стальной каркас с панелями толщиной 0.16 м, это должно читаться силуэтом. ' +
            'Пульт с кнопкой АЗ-5 и указателем уставки мощности вынесен на мезонин сбоку.'
    },

    VVER: {
      build: buildVVER,
      section: { axis: 'z', from: 4.4, to: -4.4 },
      camera: { garage: [15.97, 5.11, 14.7], section: [0.0, 1.11, 22.27] },
      fit: 16.9,
      note: 'Корпусной реактор с водой под давлением советской школы. Вертикальный корпус ' +
            'Ø4.5 × 11 м с эллиптическими днищем и крышкой, на крышке 37 приводов СУЗ. ' +
            'Шесть ГОРИЗОНТАЛЬНЫХ парогенераторов Ø3.5 × 12 м с вертикальными коллекторами ' +
            'теплоносителя — главная опознаваемая черта серии. На каждой петле по две главные ' +
            'запорные задвижки с электроприводом (компоновка В-213), внутри видна проточная ' +
            'часть с клином. Барботажный конденсатор — башня с одиннадцатью лотками у стены. ' +
            'Защитная оболочка — цилиндр Ø32 м со стенкой 1.2 м и сферическим куполом.'
    },

    PWR2: {
      build: buildPWR2,
      section: { axis: 'z', from: 5.3, to: -5.3 },
      camera: { garage: [16.9, 5.07, 15.21], section: [0.0, 0.93, 23.28] },
      fit: 17.7,
      note: 'Западный PWR второго поколения, четырёхпетлевая компоновка. Корпус Ø4.4 × 13 м, ' +
            'пояс сварных швов напротив активной зоны выделен отдельно. Четыре ВЕРТИКАЛЬНЫХ ' +
            'парогенератора Ø3.9/4.9 × 21 м с U-образным пучком и конической переходной обечайкой, ' +
            'при каждом свой ГЦН. Компенсатор давления Ø2.6 × 14 м вынесен в просвет между петлями, ' +
            'с предохранительной арматурой ' +
            'и сбросным баком. Гермооболочка Ø40 м, высота цилиндра 40 м, купол — полусфера; ' +
            'внутри защитная стена крана и шахта реактора. Снаружи площадка: ОРУ, здание ' +
            'электротехнических устройств с секциями надёжного питания, береговая насосная.'
    },

    BWR1: {
      build: buildBWR1,
      section: { axis: 'z', from: 6.0, to: -6.0 },
      camera: { garage: [17.08, 8.54, 15.03], section: [0.0, 1.21, 24.27] },
      fit: 18.4,
      note: 'Кипящий реактор ранней серии в защитной оболочке Mark I. Сухой колодец — ' +
            '«лампочка»: сфера Ø18 м, конический переход и обечайка Ø8.8 м под фланцем крышки; ' +
            'внизу ТОР барботёра, большой диаметр 33 м, диаметр трубы 8.5 м, наполовину залит ' +
            'водой, связан с колодцем восемью вентиляционными трубами. Корпус Ø4.9 × 17 м стоит ' +
            'на бетонном пьедестале, снаружи две петли рециркуляции с кольцевым коллектором. ' +
            'Толщина стенки колодца в модели 0.38 м вместо реальных 32 мм — иначе в разрезе ' +
            'ничего не видно. Здание показано вскрытым: две дальние стены 40 × 42 м на всю высоту, ' +
            'перекрытия по отметкам и лёгкий верхний этаж с панелями 0.14 м — тот самый, что ' +
            'срывает взрывом водорода; бассейн выдержки на отметке перегрузки, в подвале ' +
            'ДГ и щиты постоянного тока. ' +
            'Площадка выполнена по отметке с волноломом и береговой насосной.'
    },

    GEN3: {
      build: buildGEN3,
      section: { axis: 'z', from: 3.8, to: -3.8 },
      camera: { garage: [13.52, 4.33, 12.17], section: [0.0, 0.75, 18.69] },
      fit: 14.2,
      note: 'Реактор поколения III+ с пассивными системами. Двойная оболочка: внутренняя ' +
            'стальная Ø39 м и наружная бетонная Ø46 м со стенкой 1.0 м, между ними кольцевой ' +
            'зазор и воздухозаборники пассивного охлаждения. Наверху кольцевой бак запаса воды ' +
            'Ø27/38 м и вытяжная шахта естественной тяги. Под корпусом ловушка расплава — конический тигель с жертвенным ' +
            'материалом и каналами охлаждения по наружной стенке; шахта реактора затапливается ' +
            'из бака-приямка через две нитки с арматурой. Контур PRHR — C-образный пучок, ' +
            'погружённый в бак, с естественной циркуляцией от горячей нитки к камере ПГ. ' +
            'Два вертикальных парогенератора, на камере каждого по два герметичных ГЦН.'
    }
  };

})(typeof window !== 'undefined' ? window : this);
