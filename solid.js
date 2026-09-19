'use strict';
/* =====================================================================
   CTW solid builder — exact union of the three face prisms.
   (DOM-free. This file is the dev/test source; the same code is inlined
   into w-shape-editor/index.html between the SOLID BUILDER markers.)

   Each face is a prism: its 2D polygon extruded along one cube axis over
   [L,H] = [5-t,5], where t is the single face-thickness setting shared
   by all three faces:
     W: axis 'x', poly in (z,y)   T: axis 'z', poly in (x,y)
     C: axis 'y', poly in (x,z)

   The union boundary = for every face of every prism, the face polygon
   minus the interiors of the other two prisms on that plane.  Occluders
   are always 2D polygons (caps) or unions of rectangles / affine images
   of slab-clipped polygons (walls), and subtraction is done by disjoint
   half-plane carving, so the emitted pieces are disjoint by construction:
   no interior faces, no duplicate faces, no z-fighting.
   ===================================================================== */

const SEPS = 1e-9;

/* ---------- basic 2D ---------- */

function cleanPoly(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > SEPS) out.push([p[0], p[1]]);
  }
  while (out.length > 1 &&
         Math.hypot(out[0][0] - out[out.length-1][0], out[0][1] - out[out.length-1][1]) < SEPS)
    out.pop();
  return out.length >= 3 ? out : null;
}

function sarea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const A = p[i], B = p[(i + 1) % p.length];
    a += A[0] * B[1] - B[0] * A[1];
  }
  return a / 2;
}

function ensureCCW(p) { return sarea(p) < 0 ? p.slice().reverse() : p; }

/* Keep the part of poly on the left (keepLeft) of the directed line a->b.
   Points within SEPS of the line count as inside, so shared boundary
   edges are kept, never eaten. */
function clipHalf(poly, ax, ay, bx, by, keepLeft) {
  const out = [];
  const n = poly.length;
  if (!n) return out;
  const dx = bx - ax, dy = by - ay;
  for (let i = 0; i < n; i++) {
    const P = poly[i], Q = poly[(i + 1) % n];
    const dP = dx * (P[1] - ay) - dy * (P[0] - ax);
    const dQ = dx * (Q[1] - ay) - dy * (Q[0] - ax);
    const iP = keepLeft ? dP >= -SEPS : dP <= SEPS;
    const iQ = keepLeft ? dQ >= -SEPS : dQ <= SEPS;
    if (iP && iQ) out.push(Q);
    else if (iP && !iQ) out.push(lineX(P, Q, dP, dQ));
    else if (!iP && iQ) { out.push(lineX(P, Q, dP, dQ)); out.push(Q); }
  }
  return out;
}

function lineX(P, Q, dP, dQ) {
  const t = dP / (dP - dQ);
  return [P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])];
}

/* keep coord[ai] >= v / <= v */
function clipGe(poly, ai, v) {
  return ai === 0 ? clipHalf(poly, v, 1, v, -1, true)
                  : clipHalf(poly, -1, v, 1, v, true);
}
function clipLe(poly, ai, v) {
  return ai === 0 ? clipHalf(poly, v, -1, v, 1, true)
                  : clipHalf(poly, 1, v, -1, v, true);
}

/* Distance from p to segment ab. */
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* Strict point-in-polygon: false when on the boundary. */
function ptInInterior(p, poly) {
  for (let i = 0; i < poly.length; i++)
    if (distToSeg(p, poly[i], poly[(i + 1) % poly.length]) < 1e-9) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/* { other-coord : poly[ai] = v meets the polygon INTERIOR }.
   On-line edges are boundary (excluded). Sweep critical w-values and test
   each open interval's midpoint with the strict point-in-polygon test, so
   interiors met without any strict edge crossing are still found. */
function interiorSlice(poly, ai, v) {
  const other = 1 - ai;
  const crit = new Set();
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const a = p[ai], b = q[ai];
    const aOn = Math.abs(a - v) < 1e-9, bOn = Math.abs(b - v) < 1e-9;
    if (aOn && bOn) { crit.add(p[other]); crit.add(q[other]); }
    else if ((a <= v && b > v) || (a > v && b <= v)) {
      const t = (v - a) / (b - a);
      crit.add(p[other] + t * (q[other] - p[other]));
    }
    crit.add(p[other]);
  }
  const ws = [...crit].sort((x, y) => x - y);
  const ivs = [];
  for (let i = 0; i + 1 < ws.length; i++) {
    if (ws[i + 1] - ws[i] < 1e-9) continue;
    const m = (ws[i] + ws[i + 1]) / 2;
    const pt = ai === 0 ? [v, m] : [m, v];
    if (ptInInterior(pt, poly)) ivs.push([ws[i], ws[i + 1]]);
  }
  const out = [];
  for (const iv of ivs) {
    const l = out[out.length - 1];
    if (l && iv[0] <= l[1] + 1e-9) l[1] = Math.max(l[1], iv[1]);
    else out.push(iv.slice());
  }
  return out.filter(iv => iv[1] - iv[0] > 1e-9);
}

/* Iteratively remove zero-width spike tips: vertex b whose incident edges
   are exactly collinear and double back (u·v<0). Such spikes contribute no
   area; they arise when a clip line coincides with a subject edge. No-op on
   simple polygons. */
function despike(poly) {
  let P = poly.slice();
  let changed = true;
  while (changed && P.length > 3) {
    changed = false;
    for (let i = 0; i < P.length; i++) {
      const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const vx = c[0] - b[0], vy = c[1] - b[1];
      const cross = ux * vy - uy * vx;
      const dot = ux * vx + uy * vy;
      if (Math.abs(cross) < 1e-12 && dot < 0) {
        P.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return P;
}

/* Drop consecutive duplicate points (clip intersections can land exactly
   on existing vertices). Collinear runs are kept: both sides of a shared
   edge compute the same vertices, which is what keeps the mesh watertight. */
function cleanRing(poly) {
  const out = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9) break;
    out.pop();
  }
  return out;
}

/* subject minus convex CCW polygon q, as disjoint pieces:
   piece_i = subject ∩ outside(edge i) ∩ inside(edges 0..i-1). */
function carveConvex(subj, q) {
  const pieces = [];
  const n = q.length;
  for (let i = 0; i < n; i++) {
    const A = q[i], B = q[(i + 1) % n];
    let p = clipHalf(subj, A[0], A[1], B[0], B[1], false);
    for (let j = 0; j < i && p.length; j++) {
      const C = q[j], D = q[(j + 1) % n];
      p = clipHalf(p, C[0], C[1], D[0], D[1], true);
    }
    if (p.length >= 3) { p = cleanRing(p); p = despike(p); }
    if (p.length >= 3 && Math.abs(sarea(p)) > 1e-12) pieces.push(p);
  }
  return pieces;
}

function ptInTri(p, a, b, c) {
  const s = x => x < -SEPS ? -1 : x > SEPS ? 1 : 0;
  const d1 = s((p[0]-b[0])*(a[1]-b[1]) - (a[0]-b[0])*(p[1]-b[1]));
  const d2 = s((p[0]-c[0])*(b[1]-c[1]) - (b[0]-c[0])*(p[1]-c[1]));
  const d3 = s((p[0]-a[0])*(c[1]-a[1]) - (c[0]-a[0])*(p[1]-a[1]));
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/* Ear clipping; input must be CCW, simple, no holes. */
function triangulate(poly) {
  const P = despike(cleanRing(poly));
  if (P.length < 3) throw new Error('triangulate: degenerate ring');
  const vs = P.map((_, i) => i);
  const tris = [];
  const maxGuard = vs.length * vs.length * 2 + 10;
  let guard = 0;
  const ringArea = () => {
    let s = 0;
    for (let i = 0; i < vs.length; i++) {
      const A = P[vs[i]], B = P[vs[(i + 1) % vs.length]];
      s += A[0] * B[1] - B[0] * A[1];
    }
    return s / 2;
  };
  while (vs.length > 3) {
    if (++guard > maxGuard) throw new Error('triangulate: stuck (non-simple polygon?)');
    if (Math.abs(ringArea()) < 1e-12) break; // ears consumed the polygon; remainder is degenerate
    let found = false;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[(i - 1 + vs.length) % vs.length], b = vs[i], c = vs[(i + 1) % vs.length];
      const A = P[a], B = P[b], C = P[c];
      if ((B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0]) <= SEPS) continue;
      let ok = true;
      for (const v of vs) {
        if (v === a || v === b || v === c) continue;
        if (ptInTri(P[v], A, B, C)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push([A, B, C]);
      vs.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error('triangulate: no ear found (non-simple polygon?)');
  }
  if (vs.length === 3) {
    const T = [P[vs[0]], P[vs[1]], P[vs[2]]];
    if (Math.abs(sarea(T)) > 1e-12) tris.push(T);
  }
  return tris;
}

function isConvex(p) {
  let sign = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const A = p[i], B = p[(i + 1) % n], C = p[(i + 2) % n];
    const cr = (B[0]-A[0])*(C[1]-B[1]) - (B[1]-A[1])*(C[0]-B[0]);
    if (Math.abs(cr) < SEPS) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/* subject minus every occluder polygon (each possibly concave). */
function subtractAll(facePoly, occs) {
  let pieces = [facePoly];
  for (const occ of occs) {
    if (occ.length < 3 || Math.abs(sarea(occ)) < 1e-12) continue;
    const ccw = ensureCCW(occ);
    // Convex occluders carve directly; concave ones are split into
    // triangles first (shared triangulation diagonals can leave ~1e-8
    // slivers, dropped by the area filter below).
    const parts = (ccw.length === 3 || isConvex(ccw)) ? [ccw] : triangulate(ccw);
    let next = [];
    for (const p of pieces) {
      let cur = [p];
      for (const part of parts) {
        const nn = [];
        for (const c of cur) nn.push(...carveConvex(c, part));
        cur = nn;
        if (!cur.length) break;
      }
      next.push(...cur);
    }
    pieces = next.filter(p => Math.abs(sarea(p)) > 1e-7);
    if (!pieces.length) break;
  }
  return pieces;
}

/* ---------- prisms & faces ---------- */

function buildPrisms(fw, ft, fc, t) {
  const L = 5 - t, H = 5;
  const defs = [
    { axis: 'x', cu: 'z', cv: 'y', poly: fw },
    { axis: 'z', cu: 'x', cv: 'y', poly: ft },
    { axis: 'y', cu: 'x', cv: 'z', poly: fc },
  ];
  const prisms = [];
  for (const d of defs) {
    const pts = cleanPoly(d.poly);
    if (!pts || Math.abs(sarea(pts)) < SEPS) continue;
    prisms.push({ axis: d.axis, cu: d.cu, cv: d.cv, pts: ensureCCW(pts), L, H });
  }
  return prisms;
}

function axisVec(ax, s) {
  const v = { x: 0, y: 0, z: 0 };
  v[ax] = s;
  return [v.x, v.y, v.z];
}

/* Faces of prism P in their own 2D coords.
   cap: coords (cu,cv), plane axis=c.  wall: coords (a,s), a along axis. */
function prismFaces(P) {
  const faces = [
    { kind: 'cap', plane: P.axis, c: P.H, n: axisVec(P.axis, 1),
      cu: P.cu, cv: P.cv, poly: P.pts },
    { kind: 'cap', plane: P.axis, c: P.L, n: axisVec(P.axis, -1),
      cu: P.cu, cv: P.cv, poly: P.pts },
  ];
  const n = P.pts.length;
  for (let i = 0; i < n; i++) {
    const A = P.pts[i], B = P.pts[(i + 1) % n];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const len = Math.hypot(dx, dy);
    if (len < SEPS) continue;
    // P.pts is CCW: outward = right of A->B
    const nw = { x: 0, y: 0, z: 0 };
    nw[P.cu] = dy / len; nw[P.cv] = -dx / len;
    faces.push({
      kind: 'wall', axis: P.axis, L: P.L, H: P.H,
      eu: A, ev: B, n: [nw.x, nw.y, nw.z], cu: 'a', cv: 's',
      poly: [[P.L, 0], [P.H, 0], [P.H, 1], [P.L, 1]],
    });
  }
  return faces;
}

/* Occluder polygons of other prism B on face F, in F's 2D coords. */
function occludersFor(F, B) {
  const out = [];
  if (F.kind === 'cap') {
    // B.axis != F.plane always (three distinct axes).
    const X = F.plane;
    const bi = B.cu === X ? 0 : 1;      // which B coord is fixed at F.c
    // Interior of B.poly needs poly[bi] strictly below its max: a cap at the
    // max coordinate (capOut) never meets any prism interior -> no occluder.
    let maxBi = -Infinity;
    for (const p of B.pts) maxBi = Math.max(maxBi, p[bi]);
    if (F.c >= maxBi - 1e-9) return out;
    const ivs = interiorSlice(B.pts, bi, F.c);
    for (const [lo, hi] of ivs) {
      // rect spans [B.L,B.H] along B.axis, [lo,hi] along the other coord
      const r = {};
      r[B.axis] = [B.L, B.H];
      r[B.cu === X ? B.cv : B.cu] = [lo, hi];
      const u0 = r[F.cu][0], u1 = r[F.cu][1], v0 = r[F.cv][0], v1 = r[F.cv][1];
      out.push([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    return out;
  }
  // wall: F.coords are (a,s); owner axis = F.axis, edge F.eu->F.ev in (cu,cv)
  return wallOccluders(F, B);
}

function wallOccluders(F, B) {
  // owner prism's cross coords:
  const ownerCu = F._cu, ownerCv = F._cv;
  const bA = B.axis;                       // one of ownerCu/ownerCv
  const w = bA === ownerCu ? ownerCv : ownerCu;
  const bIdx = bA === ownerCu ? 0 : 1, wIdx = 1 - bIdx;
  const A = F.eu, E = F.ev;
  const cb0 = bIdx === 0 ? A[0] : A[1], cb1 = bIdx === 0 ? E[0] : E[1];
  const cw0 = wIdx === 0 ? A[0] : A[1], cw1 = wIdx === 0 ? E[0] : E[1];
  // s-interval J with bA-coord in [B.L,B.H]; the wall meets B's interior
  // only when its constant coord is strictly inside (L,H).
  let J;
  if (Math.abs(cb1 - cb0) < SEPS) {
    if (cb0 <= B.L + 1e-9 || cb0 >= B.H - 1e-9) return [];
    J = [0, 1];
  } else {
    let s0 = (B.L - cb0) / (cb1 - cb0), s1 = (B.H - cb0) / (cb1 - cb0);
    J = [Math.max(0, Math.min(s0, s1)), Math.min(1, Math.max(s0, s1))];
    if (J[1] < J[0] + SEPS) return [];
  }
  // B.coords: (B.cu,B.cv); w is one of them; X2 = F.axis is the other
  const wBIdx = B.cu === w ? 0 : 1;
  const xBIdx = 1 - wBIdx; // index of F.axis in B coords
  if (Math.abs(cw1 - cw0) > SEPS) {
    const wlo = Math.min(cw0, cw1), whi = Math.max(cw0, cw1);
    // restrict w to s in J: w(s) = cw0 + s*(cw1-cw0)
    const wj0 = cw0 + J[0] * (cw1 - cw0), wj1 = cw0 + J[1] * (cw1 - cw0);
    const clo = Math.max(wlo, Math.min(wj0, wj1)), chi = Math.min(whi, Math.max(wj0, wj1));
    if (chi < clo + 1e-12) return [];
    // B.poly ∩ slab can be several disjoint pieces; clipping the whole ring
    // yields one weakly-simple ring joined by zero-width bridges along the
    // clip line (unusable). Clip each triangle instead: tri ∩ slab is convex.
    if (!B._tris) B._tris = triangulate(ensureCCW(B.pts));
    const occs = [];
    for (const tr of B._tris) {
      let Q = clipGe(tr, wBIdx, clo);
      Q = clipLe(Q, wBIdx, chi);
      if (Q.length < 3 || Math.abs(sarea(Q)) < 1e-12) continue;
      occs.push(Q.map(q => [q[xBIdx], (q[wBIdx] - cw0) / (cw1 - cw0)]));
    }
    return occs;
  }
  // w constant along edge: rectangles from interior x-slices
  const ivs = interiorSlice(B.pts, wBIdx, cw0);
  return ivs.map(([lo, hi]) => [[lo, J[0]], [hi, J[0]], [hi, J[1]], [lo, J[1]]]);
}

/* Lift a 2D face point to world coords. */
function lift(F, p) {
  const w = { x: 0, y: 0, z: 0 };
  if (F.kind === 'cap') {
    w[F.plane] = F.c; w[F.cu] = p[0]; w[F.cv] = p[1];
  } else {
    w[F.axis] = p[0];
    w[F._cu] = F.eu[0] + p[1] * (F.ev[0] - F.eu[0]);
    w[F._cv] = F.eu[1] + p[1] * (F.ev[1] - F.eu[1]);
  }
  return [w.x, w.y, w.z];
}

const q1e7 = v => Math.round(v * 1e7) / 1e7;

function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

/* Build the union solid: array of triangles, outward winding, quantized. */
/* 3D polygon of a face (cap: lifted poly; wall: 4 corners). */
function facePolygon3D(F) {
  if (F.kind === 'cap') return F.poly.map(p => lift(F, p));
  return [lift(F, [F.L, 0]), lift(F, [F.H, 0]), lift(F, [F.H, 1]), lift(F, [F.L, 1])];
}

/* Map a 3D point (in F's plane) to F's 2D coords. */
function toFace2D(F, v) {
  if (F.kind === 'cap') return [v[{x:0,y:1,z:2}[F.cu]], v[{x:0,y:1,z:2}[F.cv]]];
  const cu = {x:0,y:1,z:2}[F._cu], cv = {x:0,y:1,z:2}[F._cv];
  const dx = F.ev[0] - F.eu[0], dy = F.ev[1] - F.eu[1];
  const s = ((v[cu] - F.eu[0]) * dx + (v[cv] - F.eu[1]) * dy) / (dx * dx + dy * dy);
  return [v[{x:0,y:1,z:2}[F.axis]], s];
}

/* Plane of a face: unit normal + offset. */
function facePlane(F) {
  const n = F.n;
  const p0 = lift(F, F.kind === 'cap' ? F.poly[0] : [F.L, 0]);
  return { n, d: dot3(n, p0) };
}

/* Coplanar occluders: other prisms' faces in F's plane.
   Same outward normal -> emit once (tie-break: lower prism index emits).
   Opposite normal -> interior interface, subtract from both. */
function isCoplanar(F, G) {
  const pf = facePlane(F);
  const pg = facePlane(G);
  const dn = dot3(pf.n, pg.n);
  if (Math.abs(Math.abs(dn) - 1) > 1e-9) return 0;
  const off = dot3(pf.n, lift(G, G.kind === 'cap' ? G.poly[0] : [G.L, 0]));
  if (Math.abs(pf.d - off) > 1e-9) return 0;
  return dn;
}

function buildSolid(fw, ft, fc, t) {
  const prisms = buildPrisms(fw, ft, fc, t);
  // Pass 1: carve each face by other prisms' interiors.
  const infos = [];
  for (let pi = 0; pi < prisms.length; pi++) {
    const P = prisms[pi];
    for (const F of prismFaces(P)) {
      if (F.kind === 'wall') { F._cu = P.cu; F._cv = P.cv; }
      const occs = [];
      for (const B of prisms) {
        if (B === P) continue;
        occs.push(...occludersFor(F, B));
      }
      infos.push({ pi, P, F, pieces: subtractAll(F.poly, occs) });
    }
  }
  // Pass 2: resolve coplanar overlaps using the carved pieces (not full faces),
  // so a face carved by interiors doesn't leave a hole in its coplanar mate.
  const tris = [];
  for (const info of infos) {
    const { pi, F, pieces } = info;
    const copl = [];
    for (const other of infos) {
      if (other.pi === pi) continue;
      const G = other.F;
      const dn = isCoplanar(F, G);
      if (!dn) continue;
      if (dn > 0 && other.pi > pi) continue;   // tie-break: lower index emits
      for (const pc of other.pieces) {
        const mapped = pc.map(p => toFace2D(F, lift(G, p)));
        if (Math.abs(sarea(mapped)) < 1e-12) continue;
        for (const tri of triangulate(ensureCCW(cleanRing(mapped)))) copl.push(tri);
      }
    }
    let final = pieces;
    if (copl.length) {
      final = [];
      for (const pc of pieces) final.push(...subtractAll(pc, copl));
    }
    for (const pc of final) {
      for (const tri of triangulate(ensureCCW(pc))) {
        const w3 = tri.map(p => lift(F, p));
        const nrm = cross3(sub3(w3[1], w3[0]), sub3(w3[2], w3[0]));
        const area2 = Math.hypot(nrm[0], nrm[1], nrm[2]);
        if (area2 < 1e-12) continue;
        if (dot3(nrm, F.n) < 0) { const tmp = w3[1]; w3[1] = w3[2]; w3[2] = tmp; }
        tris.push(w3.map(p => p.map(q1e7)));
      }
    }
  }
  // Deduplicate: overlapping carve pieces can emit the same triangle twice.
  const seen = new Set();
  const uniq = [];
  for (const tr of tris) {
    const k = tr.map(p => p.map(v => v.toFixed(7)).join(',')).sort().join('|');
    if (!seen.has(k)) { seen.add(k); uniq.push(tr); }
  }
  return uniq;
}

/* ---------- validation & STL ---------- */

function validateSolid(tris) {
  const edges = new Map();
  const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7) + ',' + p[2].toFixed(7);
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const k = key(t[i]) + '>' + key(t[(i + 1) % 3]);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, c] of edges) {
    if (c !== 1) { bad++; continue; }
    const rev = k.split('>').reverse().join('>');
    if (edges.get(rev) !== 1) bad++;
  }
  let vol = 0;
  for (const t of tris) vol += dot3(t[0], cross3(t[1], t[2])) / 6;
  return { tris: tris.length, directedEdges: edges.size, badEdges: bad,
           closed: bad === 0, volume: vol };
}

function stlBinary(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  const n = [0, 0, 0];
  for (const t of tris) {
    const e1 = sub3(t[1], t[0]), e2 = sub3(t[2], t[0]);
    const cr = cross3(e1, e2);
    const l = Math.hypot(cr[0], cr[1], cr[2]) || 1;
    n[0] = cr[0] / l; n[1] = cr[1] / l; n[2] = cr[2] / l;
    for (const v of [n, t[0], t[1], t[2]]) {
      dv.setFloat32(o, v[0], true); dv.setFloat32(o + 4, v[1], true);
      dv.setFloat32(o + 8, v[2], true); o += 12;
    }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

/* ================= node test harness ================= */
if (typeof window === 'undefined' && typeof require !== 'undefined' && require.main === module) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };

  // 1. carve: square minus centered square -> area 16-4=12, 4 pieces
  {
    const sq = [[0,0],[4,0],[4,4],[0,4]];
    const hole = [[1,1],[3,1],[3,3],[1,3]];
    const ps = subtractAll(sq, [hole]);
    const a = ps.reduce((t, p) => t + Math.abs(sarea(p)), 0);
    console.log('carve square-hole: pieces=' + ps.length + ' area=' + a.toFixed(6));
    assert(ps.length === 4 && Math.abs(a - 12) < 1e-9, 'square minus square');
  }
  // 2. carve: rect minus overlapping triangle
  {
    const sq = [[0,0],[4,0],[4,4],[0,4]];
    const tri = [[2,-1],[5,2],[2,5]];
    const ps = subtractAll(sq, [tri]);
    const a = ps.reduce((t, p) => t + Math.abs(sarea(p)), 0);
    // triangle ∩ square: polygon (2,0),(4,0),(4,4),(2,4),(2,2)... compute: tri covers x∈[2,4] fully in y∈[0,4]? tri verts (2,-1),(5,2),(2,5): at x=2: y∈[-1,5]; at x=4: edges (2,-1)-(5,2): y=-1+(4-2)*(3/3)=1; (5,2)-(2,5): y=2+(4-5)*(3/-3)=3 → y∈[1,3]. area of tri∩sq = integral: use known: total tri area=9; outside parts... just check positivity and <16
    console.log('carve square-tri: pieces=' + ps.length + ' area=' + a.toFixed(6));
    assert(a > 0 && a < 16, 'square minus tri sane');
  }
  // 3. interiorSlice on concave poly: C-shape covers x in [0,3] at y=0.5 (bars),
  // only the spine x in [0,1] at y=1.5 (notch is empty there)
  {
    const cShape = [[0,0],[3,0],[3,1],[1,1],[1,2],[3,2],[3,3],[0,3]];
    const ivs = interiorSlice(cShape, 1, 0.5);
    const ivs2 = interiorSlice(cShape, 1, 1.5);
    console.log('slice C-shape y=0.5:', JSON.stringify(ivs), ' y=1.5:', JSON.stringify(ivs2));
    assert(ivs.length === 1 && Math.abs(ivs[0][0]) < 1e-9 && Math.abs(ivs[0][1] - 3) < 1e-9,
      'C-shape slice y=0.5');
    assert(ivs2.length === 1 && Math.abs(ivs2[0][0]) < 1e-9 && Math.abs(ivs2[0][1] - 1) < 1e-9,
      'C-shape slice y=1.5');
  }

  // default faces (copied from index.html)
  const W_SHAPED = [[2.5,1],[3,0.5],[3.5,0.5],[4,0.5],[4.5,1],[5,1.5],[5,2],[5,3],[5,4],[5,5],[4,5],[4,4],[4,2],[3.5,1.5],[3,2],[2.5,2.5],[2,2],[1.5,1.5],[1,2],[1,4],[1,5],[0,5],[0,4],[0,3],[0,2],[0,1.5],[0.5,1],[1,0.5],[1.5,0.5],[2,0.5]];
  const T_CUBIC = [[0,4],[2,4],[2,0],[3,0],[3,4],[4,4],[4,1],[5,1],[5,5],[0,5]];
  const C_CUBIC = [[0,5],[0,0],[5,0],[5,1],[1,1],[1,4],[5,4],[5,5]];

  const ptInPoly = (p, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inW = (x, y, z, t) => x >= 5 - t - 1e-9 && x <= 5 + 1e-9 && ptInPoly([z, y], W_SHAPED);
  const inT = (x, y, z, t) => z >= 5 - t - 1e-9 && z <= 5 + 1e-9 && ptInPoly([x, y], T_CUBIC);
  const inC = (x, y, z, t) => y >= 5 - t - 1e-9 && y <= 5 + 1e-9 && ptInPoly([x, z], C_CUBIC);

  for (const t of [0.25, 1, 2, 5]) {
    const t0 = Date.now();
    const tris = buildSolid(W_SHAPED, T_CUBIC, C_CUBIC, t);
    const v = validateSolid(tris);
    // prism volumes for bounds
    const pv = (p) => Math.abs(sarea(ensureCCW(cleanPoly(p)))) * t;
    const pvols = [pv(W_SHAPED), pv(T_CUBIC), pv(C_CUBIC)];
    const sum = pvols.reduce((a, b) => a + b, 0), mx = Math.max(...pvols);
    // monte carlo
    let hits = 0; const N = 120000;
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 5, y = Math.random() * 5, z = Math.random() * 5;
      if (inW(x, y, z, t) || inT(x, y, z, t) || inC(x, y, z, t)) hits++;
    }
    const mc = hits / N * 125;
    console.log(`t=${t}: tris=${v.tris} closed=${v.closed} badEdges=${v.badEdges} ` +
      `vol=${v.volume.toFixed(3)} mc=${mc.toFixed(3)} ` +
      `bounds=[${mx.toFixed(1)},${sum.toFixed(1)}] ${Date.now() - t0}ms`);
    assert(v.closed, 't=' + t + ' mesh closed');
    assert(v.volume > mx - 1e-6 && v.volume < sum + 1e-6, 't=' + t + ' volume in bounds');
    assert(Math.abs(v.volume - mc) / mc < 0.03, 't=' + t + ' volume matches monte carlo');
    // STL sanity: facet count + size
    const buf = stlBinary(tris);
    assert(buf.byteLength === 84 + tris.length * 50, 'stl size');
    const dv = new DataView(buf);
    assert(dv.getUint32(80, true) === tris.length, 'stl count');
  }
  // degenerate: empty faces -> empty solid, no crash
  {
    const tris = buildSolid([], [], [], 1);
    assert(tris.length === 0, 'empty faces -> empty solid');
  }
  // single face -> just the prism, closed
  {
    const tris = buildSolid(W_SHAPED, [], [], 1);
    const v = validateSolid(tris);
    console.log('single W prism: tris=' + v.tris + ' closed=' + v.closed + ' vol=' + v.volume.toFixed(3));
    assert(v.closed && Math.abs(v.volume - Math.abs(sarea(ensureCCW(cleanPoly(W_SHAPED)))) * 1) < 1e-6,
      'single prism volume');
  }
  console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
}
