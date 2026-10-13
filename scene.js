/* Group 01 BangKuBehind, EA234506 Assignment 2: immersive view of the GTD.
 * Every mark is generated in 3D from scene-data.json (same CSV and aggregations as the 2D dashboard).
 * View-only: no cursor, no raycaster, no click/gaze handlers, no animations.
 *
 * Layout (HOME at 0, 1.6, 0 facing -Z):
 *   Front, eye level : Q1 Total attacks by region, one arc of 3D bars at 3 m
 *   Left             : Q2 Attacks per year
 *   Right            : Q4 10 deadliest countries over Q3 Attack types
 *   Floor            : Q5 Attacks per country, flat map
 * Label size = LABEL_DMM mm per metre of viewing distance.
 * Keys: WASD move, mouse drag look, Space rise, Shift descend, R reset.
 * Capture presets: #home #q1 #q4 #left #right #floor #overview
 */
(function () {
  const THREE = AFRAME.THREE;
  const FONT = "fonts/Roboto-Regular.json";
  const FONT_B = "fonts/Roboto-Bold.json";
  const LABEL_DMM = 30;

  // identity colours: identical to the 2D dashboard
  const C_A = "#1f4e8c", C_B = "#d4700a", C_REST = "#aeb4bb", C_REST_LINE = "#7b848e";
  const INK = "#1a1a1a", MUTED = "#4d5560", GRID = "#d3d9df", NEUTRAL_BAR = "#555b62", WALL = "#f4f6f8";
  // map classes: identical to the 2D choropleth (change both together)
  const MAP_PALETTE = ["#eef3f9", "#c6dbef", "#93c4de", "#5a9fcf", "#2b6fb0", "#0b3c7d"];
  const MAP_HEIGHT = [0.004, 0.004, 0.004, 0.004, 0.004, 0.004];

  const R = 3.0;
  const sAt = (dist) => (LABEL_DMM / 1000) * dist * 0.5;
  const S_WALL = sAt(R), S_FLOOR = sAt(2.2);
  const BAR_D = 0.06;

  const fmt = (v) => Number(v).toLocaleString("en-US");
  const room = () => document.getElementById("room");

  function el(tag, attrs, parent) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    (parent || room()).appendChild(e);
    return e;
  }

  function text(parent, str, o) {
    o = o || {};
    const lines = String(str).split("\n");
    const wrap = Math.max(...lines.map((l) => l.length), 1) + 1;
    const e = el("a-entity", {
      position: `${o.x || 0} ${o.y || 0} ${o.z == null ? 0.01 : o.z}`, rotation: `${o.rx || 0} ${o.ry || 0} 0`,
    }, parent);
    e.setAttribute("text", {
      value: str, font: o.bold ? FONT_B : FONT, shader: "msdf", negate: true,
      color: o.color || INK, align: o.align || "center", anchor: o.anchor || "center",
      baseline: o.baseline || "center", wrapCount: wrap, width: (o.size || 0.03) * wrap,
    });
    return e;
  }
  const left = (o) => Object.assign({ align: "left", anchor: "left" }, o);
  const right = (o) => Object.assign({ align: "right", anchor: "right" }, o);

  function box(parent, w, h, d, x, y, z, color, rz) {
    return el("a-box", { width: Math.max(w, 0.003), height: h, depth: d, position: `${x} ${y} ${z}`,
      rotation: `0 0 ${rz || 0}`, color: color, material: "shader: flat" }, parent);
  }
  function wallGroup(which, centre) {
    if (which === "centre") return el("a-entity", { position: `${centre} 0 ${-R + 0.02}` });
    if (which === "left") return el("a-entity", { position: `${-R + 0.02} 0 ${centre}`, rotation: "0 90 0" });
    return el("a-entity", { position: `${R - 0.02} 0 ${centre}`, rotation: "0 -90 0" });
  }

  function chartTitle(g, tag, title, sub, x, y, s) {
    const tw = s * (tag.length + 2.2), th = s * 3.0;
    box(g, tw, th, 0.01, x + tw / 2, y, 0.005, INK);
    text(g, tag, { x: x + tw / 2, y, z: 0.02, size: s, color: "#ffffff", bold: true });
    text(g, title, left({ x: x + tw + s * 1.2, y, size: s * 1.15, bold: true }));
    if (sub) text(g, sub, left({ x, y: y - s * 3.2, size: s * 0.85, color: MUTED }));
  }

  function regionColour(r, data) {
    return r === data.meta.highlight.A ? C_A : r === data.meta.highlight.B ? C_B : C_REST;
  }
  function hBars(g, rows, o) {
    const max = o.max || Math.max(...rows.map(o.value));
    rows.forEach((r, i) => {
      const y = o.yTop - i * o.rowH, w = (o.value(r) / max) * o.wmax;
      if (o.label) text(g, o.label(r), right({ x: o.x0 - o.s * 0.8, y, size: o.s }));
      box(g, w, o.rowH * 0.6, BAR_D, o.x0 + w / 2, y, BAR_D / 2, o.colour(r));
      text(g, o.fmtV(o.value(r)), left({ x: o.x0 + w + o.s * 0.7, y, z: BAR_D / 2 + 0.005, size: o.s }));
    });
  }

  /* ================= HOME marker (no walls: every chart stands free in the room) ================= */
  function buildWalls() {
    el("a-ring", { "radius-inner": 0.24, "radius-outer": 0.28, color: "#5f6b78", rotation: "-90 0 0",
      position: "0 0.004 0", material: "shader: flat" });
    text(room(), "HOME", { x: 0, y: 0.005, z: 0.4, rx: -90, size: 0.035, color: "#5f6b78", bold: true });
  }

  // a solid bar bent along a circle around HOME: angles in degrees, + = to the viewer's right
  function arcBar(radius, deg0, deg1, yBottom, h, depth, color) {
    const n = Math.max(8, Math.ceil(Math.abs(deg1 - deg0) / 1.5));
    const pts = [];
    const P = (r, d) => new THREE.Vector2(r * Math.sin(d * Math.PI / 180), r * Math.cos(d * Math.PI / 180));
    for (let i = 0; i <= n; i++) pts.push(P(radius, deg0 + (deg1 - deg0) * i / n));
    for (let i = n; i >= 0; i--) pts.push(P(radius - depth, deg0 + (deg1 - deg0) * i / n));
    const geom = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    const c = new THREE.Color(color);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.45) }));
    const e = el("a-entity", { position: `0 ${yBottom} 0` });
    e.setObject3D("mesh", mesh);
    return e;
  }
  function onCircle(radius, deg, y) {
    const t = deg * Math.PI / 180;
    return el("a-entity", { position: `${radius * Math.sin(t)} ${y || 0} ${-radius * Math.cos(t)}`, rotation: `0 ${-deg} 0` });
  }

  /* ================= front, eye level: Q1 as one single arc of 3D bars ================= */
  function wrapName(name, max) {
    const out = []; let cur = "";
    name.split(" ").forEach((w) => {
      if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    });
    if (cur) out.push(cur);
    return out.join("\n");
  }

  function buildCentre(data) {
    const RQ = 3.0, s = sAt(RQ);
    const S24 = (24 / 1000) * RQ * 0.5;
    const rows = data.regions, n = rows.length;
    const STEP = 7.6, BAR_W = 4.8;
    const Y0 = 1.0, HMAX = 0.9;
    const max = rows[0].attacks;
    const flat = onCircle(RQ - 0.05, 0, 0);

    text(flat, `Where and how terrorism struck, ${data.meta.year_min}-${data.meta.year_max}`, { y: 3.0, size: s * 1.3, bold: true });
    let kx = -1.45;
    [[C_A, "Middle East & North Africa"], [C_B, "South Asia"], [C_REST, "All other regions"]].forEach(([c, t]) => {
      box(flat, s * 2.2, s * 2.2, 0.02, kx + s * 1.1, 2.8, 0.01, c);
      text(flat, t, left({ x: kx + s * 3, y: 2.8, size: s * 0.9 }));
      kx += s * (t.length * 0.9 + 6);
    });
    chartTitle(flat, "Q1", "Total attacks by region",
      `Gap between 1st and 2nd: ${fmt(rows[0].attacks - rows[1].attacks)} attacks`, -0.8, 2.42, s);
    arcBar(RQ, -(n * STEP) / 2, (n * STEP) / 2, Y0 - 0.012, 0.012, 0.1, "#8a949f");

    rows.forEach((r, i) => {
      const mid = -((n - 1) * STEP) / 2 + i * STEP;
      const h = Math.max((r.attacks / max) * HMAX, 0.012);
      arcBar(RQ, mid - BAR_W / 2, mid + BAR_W / 2, Y0, h, 0.1, regionColour(r.name, data));
      text(onCircle(RQ - 0.06, mid, 0), fmt(r.attacks), { y: Y0 + h + 0.07, size: s * 0.9, bold: true });
      text(onCircle(RQ - 0.06, mid, 0), wrapName(r.name, 11),
        { y: Y0 - 0.13, size: S24, baseline: "top", color: INK });
    });
  }

  /* ================= left wall: Q2 timeline ================= */
  function buildLeft(data) {
    const s = S_WALL, g = wallGroup("left", -0.7);
    chartTitle(g, "Q2", "Attacks per year, by region group", null, -1.45, 2.72, s);
    const yrs = data.yearly.years;
    const x0 = -1.2, x1 = 1.12, y0 = 0.95, y1 = 2.45;
    const ymax = Math.max(...["A", "B", "rest"].flatMap((k) => data.yearly[k].filter((v) => v != null)));
    const step = ymax > 10000 ? 4000 : 2000;
    const ytop = Math.ceil(ymax / step) * step;
    const X = (yr) => x0 + ((yr - yrs[0]) / (yrs[yrs.length - 1] - yrs[0])) * (x1 - x0);
    const Y = (v) => y0 + (v / ytop) * (y1 - y0);
    for (let v = 0; v <= ytop; v += step) {
      box(g, x1 - x0, 0.005, 0.004, (x0 + x1) / 2, Y(v), 0.002, GRID);
      text(g, fmt(v), right({ x: x0 - s * 0.8, y: Y(v), size: s * 0.9, color: MUTED }));
    }
    for (let yr = Math.ceil(yrs[0] / 10) * 10; yr <= yrs[yrs.length - 1]; yr += 10) {
      text(g, String(yr), { x: X(yr), y: y0 - s * 2, size: s * 0.9, color: MUTED });
    }
    text(g, String(yrs[yrs.length - 1]), { x: X(yrs[yrs.length - 1]), y: y0 - s * 2, size: s * 0.9, color: MUTED, bold: true });
    yrs.forEach((yr, i) => {
      if (data.yearly.A[i] != null) return;
      box(g, 0.005, y1 - y0, 0.004, X(yr), (y0 + y1) / 2, 0.003, "#9aa3ad");
      text(g, `${yr}: not\ncollected`, { x: X(yr), y: Y(ytop * 0.75), size: s * 0.8, color: MUTED });
    });
    const pk = data.meta.peak_year;
    box(g, 0.005, y1 - y0, 0.004, X(pk), (y0 + y1) / 2, 0.003, "#9aa3ad");
    text(g, `Global total peaks in ${pk}:\n${fmt(data.meta.peak_attacks)} attacks`,
      right({ x: X(pk) - s, y: Y(ytop * 0.9), size: s * 0.85 }));
    const series = [["rest", C_REST_LINE, true, "Other regions"], ["B", C_B, false, "South Asia"], ["A", C_A, false, "Middle East &\nNorth Africa"]];
    const ends = [];
    series.forEach(([k, col, dashed, name], si) => {
      const vals = data.yearly[k];
      for (let i = 0; i < vals.length - 1; i++) {
        if (vals[i] == null || vals[i + 1] == null) continue;
        beam(g, X(yrs[i]), Y(vals[i]), X(yrs[i + 1]), Y(vals[i + 1]), col, dashed ? 0.014 : 0.024, dashed, 0.02 + si * 0.01);
      }
      ends.push([Y(vals[vals.length - 1]), col, name]);
    });
    ends.sort((a, b) => a[0] - b[0]);
    let prev = -Infinity;
    ends.forEach(([y, col, name]) => {
      const yy = Math.max(y, prev + s * 4.4); prev = yy;
      text(g, name, left({ x: x1 + s, y: yy, z: 0.03, size: s * 0.9, color: col, bold: true }));
    });
  }
  function beam(g, ax, ay, bx, by, col, thick, dashed, z) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const pieces = dashed ? Math.max(1, Math.round(L / 0.06)) : 1;
    for (let p = 0; p < pieces; p++) {
      const f0 = p / pieces, f1 = dashed ? (p + 0.6) / pieces : 1;
      box(g, L * (f1 - f0) + (dashed ? 0 : thick * 0.7), thick, thick,
        ax + dx * (f0 + f1) / 2, ay + dy * (f0 + f1) / 2, z, col, ang);
    }
  }

  /* ================= right side: Q4 over Q3, stacked ================= */
  function buildRight(data) {
    const s = S_WALL, DEG = 78;
    const g = onCircle(R, DEG, 0);
    const rowH = 0.112;
    chartTitle(g, "Q4", "10 deadliest countries", "Total deaths. Bar colour = region, as in Q1.", -1.2, 2.72, s);
    hBars(g, data.top_countries, { s: s * 0.9, x0: -0.15, wmax: 1.0, yTop: 2.72 - s * 7, rowH,
      value: (r) => r.deaths, label: (r) => r.country, colour: (r) => regionColour(r.region, data), fmtV: fmt });
    const yT = 1.2;
    chartTitle(g, "Q3", "Attack types: frequency vs lethality", null, -1.2, yT, s);
    const rows = data.attack_types, yTop = yT - s * 5.4;
    text(g, "Attacks", left({ x: -0.15, y: yTop + 0.11, size: s * 0.9, bold: true }));
    text(g, "Deaths per attack", left({ x: 0.88, y: yTop + 0.11, size: s * 0.9, bold: true }));
    hBars(g, rows, { s: s * 0.9, x0: -0.15, wmax: 0.52, yTop, rowH,
      value: (r) => r.attacks, label: (r) => r.type, colour: () => NEUTRAL_BAR, fmtV: fmt });
    hBars(g, rows, { s: s * 0.9, x0: 0.88, wmax: 0.3, yTop, rowH,
      value: (r) => r.deaths_per, colour: () => NEUTRAL_BAR, fmtV: (v) => v.toFixed(1) });
    text(g, "\"Unknown\" type excluded. Frequency = attacks; lethality = average deaths per attack.",
      left({ x: -1.2, y: yTop - rows.length * rowH - 0.02, size: s * 0.7, color: MUTED }));
  }

  /* ================= floor: Q5 world in miniature ================= */
  function buildFloor(data, geo) {
    const s = S_FLOOR, ZC = -1.55, mapW = 3.2, k = mapW / 348, LON0 = 6, LAT0 = 12;
    const edges = data.map_classes.edges;
    const cls = (v) => { let c = 0; edges.forEach((e, i) => { if (v >= e) c = i; }); return c; };
    const root = el("a-entity", { position: `0 0.003 ${ZC}` });
    const obj = new THREE.Group();
    const centroids = {};
    geo.features.forEach((f) => {
      if (f.id === "ATA" || f.id === "ATF") return;
      const name = f.properties.name;
      const v = data.countries[data.share_parent[name] || name] || 0, c = cls(v);
      const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      let best = null, bestA = -1;
      polys.forEach((p) => {
        const ring = p[0], lons = ring.map((q) => q[0]), lats = ring.map((q) => q[1]);
        const wLon = Math.max(...lons) - Math.min(...lons);
        if (wLon > 300) return;
        const shape = new THREE.Shape(ring.map(([lo, la]) => new THREE.Vector2((lo - LON0) * k, (la - LAT0) * k)));
        const geom = new THREE.ExtrudeGeometry(shape, { depth: MAP_HEIGHT[c], bevelEnabled: false });
        obj.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: MAP_PALETTE[c] })));
        obj.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 40), new THREE.LineBasicMaterial({ color: 0x7f8a96 })));
        const area = wLon * (Math.max(...lats) - Math.min(...lats));
        if (area > bestA) {
          bestA = area;
          best = { x: (lons.reduce((a, b) => a + b, 0) / lons.length - LON0) * k,
                   y: (lats.reduce((a, b) => a + b, 0) / lats.length - LAT0) * k };
        }
      });
      if (best) centroids[name] = Object.assign(best, { v, h: MAP_HEIGHT[c] });
    });
    obj.rotation.x = -Math.PI / 2;
    root.object3D.add(obj);
    const RAIL_Z = -(80 - LAT0) * k - 0.05, RAIL_Y = 0.52;
    const top = data.top5_by_attacks.map((n) => ({ name: n, c: centroids[n] })).filter((t) => t.c)
      .sort((a, b) => a.c.x - b.c.x);
    let prevX = -Infinity;
    top.forEach((t) => {
      const lx = Math.max(t.c.x, prevX + s * 13); prevX = lx;
      text(root, `${t.name}\n${fmt(t.c.v)}`, { x: lx, y: RAIL_Y, z: RAIL_Z, size: s, bold: true });
      const pts = [new THREE.Vector3(t.c.x, t.c.h + 0.003, -t.c.y), new THREE.Vector3(lx, RAIL_Y - s * 2.2, RAIL_Z)];
      root.object3D.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x33404d })));
    });
    const nearZ = (LAT0 + 56) * k + 0.12;
    const lg = el("a-entity", { position: `0 0.002 ${nearZ}`, rotation: "-90 0 0" }, root);
    text(lg, `Q5  Attacks per country, ${data.meta.year_min}-${data.meta.year_max}  (colour = class)`,
      left({ x: -mapW / 2, y: s * 1.6, size: s, bold: true }));
    let x = -mapW / 2;
    data.map_classes.labels.forEach((lab, i) => {
      const sw = s * 2.4;
      box(lg, sw, sw, 0.004, x + sw / 2, -s * 1.6, 0.002, MAP_PALETTE[i]);
      text(lg, lab, left({ x: x + sw + s * 0.7, y: -s * 1.6, size: s * 0.9 }));
      x += sw + s * (lab.length * 0.9 + 2.2);
    });
  }

  /* ================= capture presets ================= */
  const PRESETS = {
    home: [0, 0, -6, 0], q1: [0, 0, -2, 0], q4: [0, 0, -2, -78], left: [0, 0, -4, 78], right: [0, 0, -2, -78], floor: [0, 0, -42, 0],
    overview: [0, 1.6, -16, 0],
  };
  function applyPreset() {
    const p = PRESETS[(location.hash || "#home").slice(1)] || PRESETS.home;
    document.getElementById("rig").setAttribute("position", `${p[0]} 0 ${p[1]}`);
    const lc = document.getElementById("cam").components["look-controls"];
    if (lc && lc.pitchObject) {
      lc.pitchObject.rotation.x = THREE.MathUtils.degToRad(p[2]);
      lc.yawObject.rotation.y = THREE.MathUtils.degToRad(p[3]);
    }
  }

  /* ================= viewer movement: Space rise, Shift descend, R reset ================= */
  function setupFlight() {
    const rig = document.getElementById("rig"), cam = document.getElementById("cam");
    const held = { up: false, down: false };
    const MAX_H = 9, SPEED = 2.2;
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") { held.up = true; e.preventDefault(); }
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") held.down = true;
      else if (e.code === "KeyR") { cam.setAttribute("position", "0 1.6 0"); applyPreset(); }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") held.up = false;
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") held.down = false;
    });
    window.addEventListener("blur", () => { held.up = held.down = false; });
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      if (held.up || held.down) {
        const p = rig.object3D.position;
        p.y = Math.min(MAX_H, Math.max(0, p.y + (held.up ? 1 : 0) * SPEED * dt - (held.down ? 1 : 0) * SPEED * dt));
      }
      requestAnimationFrame(loop);
    })(last);
  }

  async function start() {
    const [data, geo] = await Promise.all([
      fetch("scene-data.json").then((r) => r.json()),
      fetch("countries.geo.json").then((r) => r.json()),
    ]);
    buildWalls();
    buildCentre(data);
    buildLeft(data);
    buildRight(data);
    buildFloor(data, geo);
    applyPreset();
    setupFlight();
    const l = document.getElementById("loading");
    if (l) l.remove();
  }

  const scene = document.querySelector("a-scene");
  if (scene.hasLoaded) start(); else scene.addEventListener("loaded", start);
})();
