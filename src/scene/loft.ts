/**
 * Lofting: sweep a rounded cross-section (a superellipse with separate top and
 * bottom widths) along z. Car bodies are described as profile curves of z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Section {
  z: number;
  /** Bottom and top y. */
  yb: number;
  yt: number;
  /** Half width at the bottom and at the top (tumblehome). */
  wb: number;
  wt: number;
  /** Lateral offset of the section centre. */
  x?: number;
}

export type SectionFn = (z: number) => Section;

/** t in [0,1) goes counter-clockwise from +x when viewed from +z. */
export function ringPoint(s: Section, t: number, n: number): THREE.Vector3 {
  const a = t * Math.PI * 2;
  const c = Math.cos(a);
  const si = Math.sin(a);
  const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const ey = Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
  const v = (ey + 1) / 2;
  const hw = s.wb + (s.wt - s.wb) * v;
  return new THREE.Vector3((s.x ?? 0) + ex * hw, s.yb + (s.yt - s.yb) * v, s.z);
}

/** The t on the +x side of a section at height y. Use 0.5 - t for the -x side. */
export function tAtY(s: Section, y: number, n: number): number {
  const v = THREE.MathUtils.clamp((y - s.yb) / (s.yt - s.yb), 0, 1);
  const ey = 2 * v - 1;
  const sin = Math.sign(ey) * Math.pow(Math.abs(ey), n / 2);
  return Math.asin(THREE.MathUtils.clamp(sin, -1, 1)) / (Math.PI * 2);
}

/** Smooth y(x) through control points, sampled from a centripetal Catmull-Rom curve. */
export function curve(points: [number, number][]): (x: number) => number {
  const c = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const pts = c.getPoints(points.length * 48).sort((a, b) => a.x - b.x);
  return (x: number) => {
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const k = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * k;
  };
}

export function loft(fn: SectionFn, z0: number, z1: number, n: number, steps = 64, ring = 48): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= steps; j++) {
    const s = fn(z0 + ((z1 - z0) * j) / steps);
    for (let i = 0; i < ring; i++) {
      const p = ringPoint(s, i / ring, n);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * ring + i;
      const b = j * ring + ((i + 1) % ring);
      const c = (j + 1) * ring + i;
      const d = (j + 1) * ring + ((i + 1) % ring);
      idx.push(a, b, c, b, d, c);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  body.computeVertexNormals();

  const cap = (z: number, flip: boolean) => {
    const s = fn(z);
    const pts = Array.from({ length: ring }, (_, i) => ringPoint(s, i / ring, n));
    const centre = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(ring);
    const cp: number[] = [centre.x, centre.y, centre.z];
    for (const p of pts) cp.push(p.x, p.y, p.z);
    const ci: number[] = [];
    for (let i = 0; i < ring; i++) {
      const a = 1 + i;
      const b = 1 + ((i + 1) % ring);
      if (flip) ci.push(0, b, a);
      else ci.push(0, a, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    g.setIndex(ci);
    g.computeVertexNormals();
    return g;
  };

  return mergeGeometries([body, cap(z0, true), cap(z1, false)])!;
}

/**
 * A thin shell lifted off part of a lofted surface: doors, trunk lids.
 * z0 < z1 and t0 < t1.
 */
export function shell(fn: SectionFn, n: number, z0: number, z1: number, t0: number, t1: number, offset: number, thickness: number, nz = 24, nt = 14): THREE.BufferGeometry {
  const P = (z: number, t: number) => ringPoint(fn(z), t, n);
  const normalAt = (z: number, t: number) => {
    const e = 1e-3;
    const dt = P(z, t + e).sub(P(z, t - e));
    const dz = P(z + e, t).sub(P(z - e, t));
    return dt.cross(dz).normalize();
  };
  const O: THREE.Vector3[][] = [];
  const I: THREE.Vector3[][] = [];
  for (let i = 0; i <= nz; i++) {
    O.push([]);
    I.push([]);
    const z = z0 + ((z1 - z0) * i) / nz;
    for (let j = 0; j <= nt; j++) {
      const t = t0 + ((t1 - t0) * j) / nt;
      const p = P(z, t);
      const nrm = normalAt(z, t);
      O[i].push(p.clone().addScaledVector(nrm, offset + thickness));
      I[i].push(p.clone().addScaledVector(nrm, offset));
    }
  }
  const grid = (G: THREE.Vector3[][], flip: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (const row of G) for (const p of row) pos.push(p.x, p.y, p.z);
    const w = nt + 1;
    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < nt; j++) {
        const a = i * w + j;
        const b = i * w + j + 1;
        const c = (i + 1) * w + j;
        const d = (i + 1) * w + j + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const perim: [number, number][] = [];
  for (let i = 0; i <= nz; i++) perim.push([i, 0]);
  for (let j = 1; j <= nt; j++) perim.push([nz, j]);
  for (let i = nz - 1; i >= 0; i--) perim.push([i, nt]);
  for (let j = nt - 1; j >= 1; j--) perim.push([0, j]);
  const rimPos: number[] = [];
  for (let k = 0; k < perim.length; k++) {
    const [ai, aj] = perim[k];
    const [bi, bj] = perim[(k + 1) % perim.length];
    const quad = [O[ai][aj], O[bi][bj], I[bi][bj], O[ai][aj], I[bi][bj], I[ai][aj]];
    for (const p of quad) rimPos.push(p.x, p.y, p.z);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rim.computeVertexNormals();
  const outer = grid(O, false);
  const inner = grid(I, true);
  rim.setIndex(Array.from({ length: rimPos.length / 3 }, (_, i) => i));
  return mergeGeometries([outer, inner, rim])!;
}

/** An open, single-sided patch of a lofted surface between t0 and t1 (t may run past 1). */
export function sheet(fn: SectionFn, n: number, z0: number, z1: number, t0: number, t1: number, nz = 60, nt = 40): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nz; i++) {
    const s = fn(z0 + ((z1 - z0) * i) / nz);
    for (let j = 0; j <= nt; j++) {
      const p = ringPoint(s, t0 + ((t1 - t0) * j) / nt, n);
      pos.push(p.x, p.y, p.z);
    }
  }
  const w = nt + 1;
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * w + j;
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Points along a lofted surface at fixed t, lifted by `lift`. */
export function surfaceLine(fn: SectionFn, n: number, z0: number, z1: number, t: (s: Section) => number, lift: number, steps = 40): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    const s = fn(z);
    const tt = t(s);
    const p = ringPoint(s, tt, n);
    const e = 1e-3;
    const dt = ringPoint(s, tt + e, n).sub(ringPoint(s, tt - e, n));
    const dz = ringPoint(fn(z + e), tt, n).sub(ringPoint(fn(z - e), tt, n));
    pts.push(p.addScaledVector(dt.cross(dz).normalize(), lift));
  }
  return pts;
}

/** Points around a section at fixed z between t0 and t1, lifted by `lift`. */
export function ringLine(fn: SectionFn, n: number, z: number, t0: number, t1: number, lift: number, steps = 16): THREE.Vector3[] {
  return surfaceLineT(fn, n, z, t0, t1, lift, steps);
}

function surfaceLineT(fn: SectionFn, n: number, z: number, t0: number, t1: number, lift: number, steps: number): THREE.Vector3[] {
  const s = fn(z);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const e = 1e-3;
    const p = ringPoint(s, t, n);
    const dt = ringPoint(s, t + e, n).sub(ringPoint(s, t - e, n));
    const dz = ringPoint(fn(z + e), t, n).sub(ringPoint(fn(z - e), t, n));
    pts.push(p.addScaledVector(dt.cross(dz).normalize(), lift));
  }
  return pts;
}
