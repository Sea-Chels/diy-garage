/**
 * Stylized comic-book car. Two generic bodies (sedan, SUV) are lofted from
 * profile curves, cel-shaded and inked. The contract with the scene is
 * `CarRig`; every PartId in data/parts.ts gets hotspot meshes, a beacon and a
 * camera view.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PartId } from '../data/parts';
import { tween, easeInOutCubic, lerp } from './tween';
import { curve, loft, ringLine, ringPoint, sheet, shell, surfaceLine, tAtY, type Section, type SectionFn } from './loft';
import { disposeTree, glass, inkLine, outline, toon, type InkWeight, type ToonUniforms } from './toon';

export type BodyKind = 'sedan' | 'suv';
export type LidId = 'hood' | 'trunk' | 'door';
type V3 = [number, number, number];

export interface View {
  pos: V3;
  target: V3;
}

export interface Paint {
  color: string;
  shine: number;
  metal: number;
}

export interface CarRig {
  kind: BodyKind;
  group: THREE.Group;
  hotspots: Map<PartId, THREE.Mesh[]>;
  beacons: Map<PartId, THREE.Mesh>;
  views: Record<PartId, View>;
  overview: View;
  setLid(lid: LidId, open: boolean): void;
  isLidOpen(lid: LidId): boolean;
  setPaint(p: Paint, instant?: boolean): void;
  update(t: number): void;
  /** Play a part's small animation, if it has one (wipers wipe). */
  poke(part: PartId): void;
  dispose(): void;
}

type Pts = [number, number][];

interface Spec {
  halfW: number;
  wheelR: number;
  wheelW: number;
  track: number;
  wheelZ: [number, number]; // front, rear
  bottom: number;
  belt: number;
  tailZ: number;
  cowlZ: number;
  fasciaZ: number;
  noseZ: number;
  bayFloor: number;
  lowerTop: Pts;
  lowerBottom: Pts;
  lowerWidth: Pts;
  hood: Pts;
  fasciaTop: Pts;
  fasciaBottom: Pts;
  fasciaWidth: Pts;
  ghRearZ: number;
  roof: Pts;
  ghW: [number, number];
  roofPanel: [number, number];
  aPillar: [number, number];
  cornerPillars: [number, number][];
  vertPillars: number[];
  door: [number, number];
  rearDoor: [number, number];
  doorY: [number, number];
  deck: [number, number] | null; // sedan trunk lid z range
  seatZ: number;
  rearSeatZ: number | null;
  /** Cabin floor height, and the raised cargo floor behind the rear seat (SUV). */
  floorY: number;
  cargoFloorY: number | null;
  suv: boolean;
}

const SPECS: Record<BodyKind, Spec> = {
  sedan: {
    halfW: 0.9,
    wheelR: 0.34,
    wheelW: 0.24,
    track: 0.77,
    wheelZ: [1.4, -1.38],
    bottom: 0.26,
    belt: 0.97,
    tailZ: -2.28,
    cowlZ: 0.74,
    fasciaZ: 1.95,
    noseZ: 2.32,
    bayFloor: 0.5,
    lowerTop: [[-2.28, 0.8], [-2.2, 0.92], [-2.0, 0.96], [-1.2, 0.97], [0.74, 0.97]],
    lowerBottom: [[-2.28, 0.46], [-2.17, 0.3], [-1.95, 0.26], [0.74, 0.26]],
    lowerWidth: [[-2.28, 0.83], [-2.12, 0.89], [-1.8, 0.9], [0.74, 0.9]],
    hood: [[0.7, 0.97], [1.3, 0.93], [1.9, 0.88], [2.08, 0.86]],
    fasciaTop: [[1.95, 0.87], [2.15, 0.84], [2.28, 0.77], [2.32, 0.68]],
    fasciaBottom: [[1.95, 0.26], [2.2, 0.28], [2.32, 0.4]],
    fasciaWidth: [[1.95, 0.9], [2.2, 0.88], [2.32, 0.8]],
    ghRearZ: -1.22,
    roof: [[0.76, 0.97], [0.3, 1.24], [-0.05, 1.4], [-0.45, 1.43], [-0.7, 1.39], [-0.96, 1.23], [-1.22, 0.99]],
    ghW: [0.82, 0.63],
    roofPanel: [-0.74, 0.0],
    aPillar: [-0.05, 0.74],
    cornerPillars: [[-1.2, -0.7]],
    vertPillars: [-0.34],
    door: [-0.32, 0.7],
    rearDoor: [-0.98, -0.37],
    doorY: [0.34, 0.92],
    deck: [-2.16, -1.24],
    seatZ: -0.05,
    rearSeatZ: -0.62,
    floorY: 0.57,
    cargoFloorY: null,
    suv: false,
  },
  suv: {
    halfW: 0.95,
    wheelR: 0.41,
    wheelW: 0.28,
    track: 0.8,
    wheelZ: [1.45, -1.45],
    bottom: 0.4,
    belt: 1.13,
    tailZ: -2.32,
    cowlZ: 0.78,
    fasciaZ: 2.0,
    noseZ: 2.36,
    bayFloor: 0.66,
    lowerTop: [[-2.32, 1.12], [-2.28, 1.13], [-2.1, 1.13], [0.78, 1.13]],
    lowerBottom: [[-2.32, 0.6], [-2.2, 0.44], [-2.0, 0.4], [0.78, 0.4]],
    lowerWidth: [[-2.32, 0.93], [-2.26, 0.95], [-1.9, 0.95], [0.78, 0.95]],
    hood: [[0.74, 1.13], [1.4, 1.1], [2.0, 1.06], [2.12, 1.04]],
    fasciaTop: [[2.0, 1.06], [2.2, 1.03], [2.33, 0.97], [2.36, 0.88]],
    fasciaBottom: [[2.0, 0.4], [2.25, 0.42], [2.36, 0.54]],
    fasciaWidth: [[2.0, 0.95], [2.25, 0.93], [2.36, 0.86]],
    ghRearZ: -2.04,
    roof: [[0.8, 1.13], [0.35, 1.48], [0.0, 1.7], [-0.8, 1.75], [-1.8, 1.74], [-2.1, 1.7], [-2.2, 1.67]],
    ghW: [0.86, 0.7],
    roofPanel: [-2.0, 0.06],
    aPillar: [0.02, 0.78],
    cornerPillars: [],
    vertPillars: [-0.37, -1.52],
    door: [-0.35, 0.74],
    rearDoor: [-1.0, -0.4],
    doorY: [0.55, 1.08],
    deck: null,
    seatZ: -0.05,
    rearSeatZ: -0.95,
    floorY: 0.71,
    cargoFloorY: 0.93,
    suv: true,
  },
};

// Non-paint colours.
const C = {
  tire: 0x23202a,
  rim: 0xd4dbe8,
  barrel: 0x4a4e5a,
  chrome: 0xe6ecf5,
  trim: 0x24212c,
  bay: 0x1b1922,
  engine: 0x5c6273,
  cover: 0x2f3240,
  battery: 0x2c2e36,
  airbox: 0x3b404c,
  coolant: 0xe9f1f5,
  coolantCap: 0xff4f9a,
  washer: 0x4aa3df,
  washerCap: 0x2b6cb0,
  fuse: 0x2a2833,
  oil: 0xf5c542,
  caliper: 0xe2364a,
  disc: 0xa1a7b2,
  headlight: 0xfff3cf,
  taillight: 0xff3049,
  seat: 0x3d3a48,
  plate: 0xa8d4ff,
  beacon: 0x6ee7ff,
};

const rbox = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

export function buildCar(kind: BodyKind): CarRig {
  const S = SPECS[kind];
  const group = new THREE.Group();
  const hotspots = new Map<PartId, THREE.Mesh[]>();
  const beacons = new Map<PartId, THREE.Mesh>();
  const paintMats: THREE.MeshToonMaterial[] = [];
  let paintState: Paint = { color: '#d7263d', shine: 0.85, metal: 0.3 };

  const paint = () => {
    const m = toon(paintState.color, { shine: paintState.shine, metal: paintState.metal });
    paintMats.push(m);
    return m;
  };

  /** Create a mesh, add it to `parent`, ink it. Each mesh gets its own material so highlights stay local. */
  const put = (parent: THREE.Object3D, geom: THREE.BufferGeometry, mat: THREE.Material, pos?: V3, ink: InkWeight | false = 'body'): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    if (pos) m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    if (ink) outline(m, ink);
    parent.add(m);
    return m;
  };

  const tag = (part: PartId, ...meshes: THREE.Mesh[]) => {
    const list = hotspots.get(part) ?? [];
    for (const m of meshes) {
      m.userData.part = part;
      list.push(m);
    }
    hotspots.set(part, list);
  };

  // ---------- profiles ----------
  const lowerTop = curve(S.lowerTop);
  const lowerBottom = curve(S.lowerBottom);
  const lowerWidth = curve(S.lowerWidth);
  const hoodLine = curve(S.hood);
  const fasciaTop = curve(S.fasciaTop);
  const fasciaBottom = curve(S.fasciaBottom);
  const fasciaWidth = curve(S.fasciaWidth);
  const roofLine = curve(S.roof);
  const archR = S.wheelR + 0.08;
  const arch = (z: number, wz: number) => {
    const d = z - wz;
    return Math.abs(d) < archR ? S.wheelR + Math.sqrt(archR * archR - d * d) : -Infinity;
  };

  const LOWER_N = 6;
  const lower: SectionFn = (z) => {
    const w = lowerWidth(z);
    return { z, yt: lowerTop(z), yb: Math.max(lowerBottom(z), arch(z, S.wheelZ[1])), wb: w, wt: w - 0.04 };
  };
  const fenderW = 0.17;
  const fender = (side: number): SectionFn => (z) => ({
    z,
    x: side * (S.halfW - fenderW),
    yt: hoodLine(z) - 0.004,
    yb: Math.max(S.bottom, arch(z, S.wheelZ[0])),
    wb: fenderW,
    wt: fenderW - 0.025,
  });
  const fascia: SectionFn = (z) => {
    const w = fasciaWidth(z);
    return { z, yt: fasciaTop(z), yb: fasciaBottom(z), wb: w, wt: w - 0.06 };
  };
  const GH_N = 4;
  const TUB_T = 0.108; // ring t where the cabin tub's open top starts on the +x side
  // The glass stands straight up off the door tops: only the upper half of the
  // ring is used, and its widest point (t = 0) sits on the tub's top edge.
  const sill = ringPoint(lower(S.seatZ), TUB_T, LOWER_N);
  const ghBaseY = sill.y - 0.012;
  const ghBaseW = sill.x - 0.025;
  const gh: SectionFn = (z) => {
    const yt = Math.max(roofLine(z), ghBaseY + 0.004);
    return { z, yb: 2 * ghBaseY - yt, yt, wb: 2 * ghBaseW - S.ghW[1], wt: S.ghW[1] };
  };

  // ---------- body shell ----------
  const bodyMeshes: THREE.Mesh[] = [];
  // Solid behind the cabin on the sedan (the trunk); everything else is an
  // open-topped tub with real wall thickness so the seats sit down inside it.
  const tubZ0 = S.suv ? S.tailZ : S.ghRearZ;
  if (!S.suv) bodyMeshes.push(put(group, loft(lower, S.tailZ, S.ghRearZ, LOWER_N, 60), paint()));
  const WALL = 0.045;
  bodyMeshes.push(put(group, shell(lower, LOWER_N, tubZ0, S.cowlZ, 0.5 - TUB_T, 1 + TUB_T, -WALL, WALL, 110, 44), paint()));
  const interior = () => toon(C.bay, { halftone: 0.6, side: THREE.DoubleSide });
  put(group, shell(lower, LOWER_N, tubZ0 + 0.01, S.cowlZ - 0.01, 0.5 - TUB_T + 0.004, 1 + TUB_T - 0.004, -WALL - 0.004, 0.002, 60, 30), interior(), undefined, false);
  const floorHalf = S.halfW - 0.1;
  const floorZ0 = -0.96;
  put(group, rbox(floorHalf * 2, 0.03, S.cowlZ - 0.02 - floorZ0, 0.01), interior(), [0, S.floorY, (S.cowlZ - 0.02 + floorZ0) / 2], false);
  // front bulkhead behind the dash
  put(group, rbox(floorHalf * 2, S.belt - 0.04 - S.floorY, 0.02, 0.01), interior(), [0, (S.belt - 0.04 + S.floorY) / 2, S.cowlZ - 0.015], false);
  bodyMeshes.push(put(group, loft(fender(1), S.cowlZ - 0.04, S.fasciaZ + 0.06, LOWER_N, 70), paint()));
  bodyMeshes.push(put(group, loft(fender(-1), S.cowlZ - 0.04, S.fasciaZ + 0.06, LOWER_N, 70), paint()));
  bodyMeshes.push(put(group, loft(fascia, S.fasciaZ, S.noseZ, 5, 30), paint()));

  // engine bay floor + firewall face
  const bayHalf = S.halfW - 2 * fenderW + 0.02;
  put(group, loft((z) => ({ z, yb: S.bottom + 0.02, yt: S.bayFloor, wb: bayHalf, wt: bayHalf }), S.cowlZ - 0.02, S.fasciaZ + 0.02, 8, 8), toon(C.bay, { halftone: 0.4 }), undefined, false);
  put(group, rbox(bayHalf * 2, hoodLine(S.cowlZ) - S.bayFloor, 0.02, 0.005), toon(C.bay, { halftone: 0.4 }), [0, (hoodLine(S.cowlZ) + S.bayFloor) / 2, S.cowlZ + 0.005], false);

  // greenhouse glass
  const ghMesh = new THREE.Mesh(sheet(gh, GH_N, S.ghRearZ, S.cowlZ + 0.02, -0.015, 0.515, 90, 40), glass());
  ghMesh.renderOrder = 2;
  group.add(ghMesh);

  // roof panel
  const [rz0, rz1] = S.roofPanel;
  const roofTaper = (z: number) => {
    const k = Math.min((z - rz0) / 0.12, (rz1 - z) / 0.12, 1);
    return 0.93 + 0.07 * Math.sin((Math.max(k, 0) * Math.PI) / 2);
  };
  const roofEase = (z: number) => Math.sin((Math.max(Math.min((z - rz0) / 0.16, (rz1 - z) / 0.16, 1), 0) * Math.PI) / 2);
  bodyMeshes.push(
    put(group, loft((z) => {
      const y = roofLine(z);
      const w = (S.ghW[1] + 0.05) * roofTaper(z);
      return { z, yb: y - 0.03, yt: y + 0.01 + 0.038 * roofEase(z), wb: w, wt: w - 0.02 };
    }, rz0, rz1, 8, 50), paint()),
  );

  // pillars
  const pillarR = 0.032;
  const tube = (pts: THREE.Vector3[]) => {
    const m = put(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, pillarR, 8, false), paint(), undefined, 'thin');
    // cap the open ends so the ink hull never shows through
    for (const p of [pts[0], pts[pts.length - 1]]) put(group, new THREE.SphereGeometry(pillarR, 10, 8), paint(), [p.x, p.y, p.z], false);
    return m;
  };
  const corner = (side: number, z0: number, z1: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const z = z0 + ((z1 - z0) * i) / 14;
      pts.push(ringPoint(gh(z), side > 0 ? 0.125 : 0.375, GH_N));
    }
    return pts;
  };
  for (const side of [1, -1]) {
    bodyMeshes.push(tube(corner(side, S.aPillar[0], S.aPillar[1])));
    for (const [a, b] of S.cornerPillars) bodyMeshes.push(tube(corner(side, a, b)));
    for (const z of S.vertPillars) {
      const s = gh(z);
      const t0 = -0.01;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = t0 + ((0.125 - t0) * i) / 10;
        pts.push(ringPoint(s, side > 0 ? t : 0.5 - t, GH_N));
      }
      bodyMeshes.push(tube(pts));
    }
  }

  // SUV extras: roof rails and dark rocker cladding
  if (S.suv) {
    for (const side of [1, -1]) {
      const x = side * (S.ghW[1] - 0.08);
      const pts = [-1.85, -1.2, -0.5, -0.1].map((z) => new THREE.Vector3(x, roofLine(z) + 0.075, z));
      put(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 8, false), toon(C.trim), undefined, 'thin');
      for (const z of [-1.85, -0.1]) put(group, rbox(0.05, 0.07, 0.08, 0.015), toon(C.trim), [x, roofLine(z) + 0.04, z], 'thin');
      const len = S.wheelZ[0] - S.wheelZ[1] - 2 * archR - 0.05;
      put(group, rbox(0.05, 0.13, len, 0.02), toon(C.trim, { halftone: 0.6 }), [side * (S.halfW - 0.01), S.bottom + 0.07, (S.wheelZ[0] + S.wheelZ[1]) / 2 - 0.25], 'thin');
    }
  }

  // ---------- hood ----------
  const hoodZ0 = S.cowlZ + 0.02;
  const hoodZ1 = S.fasciaZ + 0.12;
  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0, hoodLine(hoodZ0), hoodZ0);
  group.add(hoodPivot);
  const hoodW = S.halfW - fenderW + 0.01;
  const hoodGeom = loft((z) => ({ z, yb: hoodLine(z) - 0.006, yt: hoodLine(z) + 0.024, wb: hoodW, wt: hoodW - 0.01 }), hoodZ0, hoodZ1, 10, 30);
  hoodGeom.translate(0, -hoodLine(hoodZ0), -hoodZ0);
  const hood = put(hoodPivot, hoodGeom, paint());
  tag('hood', hood);

  // ---------- trunk lid / liftgate ----------
  let trunkPivot: THREE.Group;
  let trunkOpen: number;
  let trunkBeacon: V3;
  let trunkView: V3;
  const suvTails: THREE.Mesh[] = [];
  let suvLampPos: THREE.Vector3 | null = null;
  if (S.deck) {
    const [dz0, dz1] = S.deck;
    trunkPivot = new THREE.Group();
    const hinge = new THREE.Vector3(0, lowerTop(dz1), dz1);
    trunkPivot.position.copy(hinge);
    group.add(trunkPivot);
    const lidGeom = shell(lower, LOWER_N, dz0, dz1, 0.07, 0.43, 0.006, 0.028, 24, 16);
    lidGeom.translate(-hinge.x, -hinge.y, -hinge.z);
    const lid = put(trunkPivot, lidGeom, paint());
    // dark recess and spare tyre, seen when the lid opens
    put(group, shell(lower, LOWER_N, dz0 + 0.04, dz1 - 0.03, 0.09, 0.41, 0.002, 0.002, 12, 10), toon(C.bay, { halftone: 0.5, side: THREE.DoubleSide }), undefined, false);
    const spare = put(group, new THREE.CylinderGeometry(0.24, 0.24, 0.02, 32), toon(C.tire), [0.1, lowerTop((dz0 + dz1) / 2) + 0.004, (dz0 + dz1) / 2], 'thin');
    tag('trunk', lid, spare);
    trunkOpen = 1.15;
    trunkBeacon = [0, lowerTop(dz0) + 0.12, (dz0 + dz1) / 2];
    trunkView = [0.5, 0.9, -1];
  } else {
    // SUV rear, modelled on a crossover: the side window line and roof carry
    // straight back into curved body-colour D-pillars, the rear glass is raked
    // forward, and a liftgate cut to the opening's exact outline sits flush in it.
    const cargoY = S.cargoFloorY ?? S.floorY;
    const RAKE = 0.34; // z shift per unit height above the window line
    const yk = ghBaseY;
    const shear = (g: THREE.BufferGeometry) => {
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + Math.max(0, pos.getY(i) - yk) * RAKE);
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    };
    const W = sill.x + 0.005; // pillar width at the window line = the body's shoulder
    const rearSec: SectionFn = (z) => {
      const yt = roofLine(Math.max(z, S.ghRearZ)) + 0.056;
      const wt = S.ghW[1] + 0.03;
      return { z, yb: 2 * yk - yt, yt, wb: 2 * W - wt, wt };
    };
    const RIM = 0.05;
    const pillarZ0 = S.ghRearZ + 0.04;
    const pillars = shear(shell(rearSec, GH_N, S.tailZ, pillarZ0, -0.02, 0.52, -RIM, RIM, 30, 48));
    bodyMeshes.push(put(group, pillars, paint()));

    // opening outline at the tail, inset from the pillar rim
    const yTop = rearSec(S.tailZ).yt;
    const outlineAt = (inset: number, yBottom: number): THREE.Shape => {
      const s0 = rearSec(S.tailZ);
      const si: Section = { ...s0, yt: s0.yt - inset, yb: 2 * yk - (s0.yt - inset), wb: s0.wb - inset, wt: s0.wt - inset };
      const sh = new THREE.Shape();
      const hw = W - inset;
      sh.moveTo(-hw + 0.06, yBottom);
      sh.lineTo(hw - 0.06, yBottom);
      sh.quadraticCurveTo(hw, yBottom, hw, yBottom + 0.06);
      for (let i = 0; i <= 32; i++) {
        const p = ringPoint(si, (0.5 * i) / 32, GH_N);
        sh.lineTo(p.x, p.y);
      }
      sh.lineTo(-hw, yBottom + 0.06);
      sh.quadraticCurveTo(-hw, yBottom, -hw + 0.06, yBottom);
      return sh;
    };
    const gateBottom = cargoY - 0.2;
    const GAP = 0.008;

    // liftgate: built in world space, sheared with the body, then moved into the hinge frame
    const hy = yTop - RIM - GAP;
    const hz = S.tailZ + (hy - yk) * RAKE;
    trunkPivot = new THREE.Group();
    trunkPivot.position.set(0, hy, hz);
    group.add(trunkPivot);
    const BT = 0.01;
    const toHinge = (g: THREE.BufferGeometry) => shear(g).translate(0, -hy, -hz);
    const panelGeom = new THREE.ExtrudeGeometry(outlineAt(RIM + GAP + BT, gateBottom + BT), { depth: 0.03, bevelEnabled: true, bevelThickness: BT, bevelSize: BT, bevelSegments: 2, curveSegments: 12 });
    panelGeom.translate(0, 0, S.tailZ + BT);
    const panel = put(trunkPivot, toHinge(panelGeom), paint());
    const glassShape = (() => {
      const sh = outlineAt(RIM + 0.11, yk + 0.12);
      return sh;
    })();
    const glassGeom = new THREE.ShapeGeometry(glassShape, 16);
    glassGeom.translate(0, 0, S.tailZ - 0.004);
    const gateGlass = new THREE.Mesh(toHinge(glassGeom), glass());
    gateGlass.renderOrder = 2;
    trunkPivot.add(gateGlass);
    // spoiler lip along the top of the gate
    // fixed to the roof edge, so it stays put when the gate swings up
    const spoiler = put(group, rbox(2 * (S.ghW[1] - 0.06), 0.035, 0.16, 0.017), paint(), [0, hy + RIM + 0.004, hz - 0.03]);
    bodyMeshes.push(spoiler);
    spoiler.rotation.x = -0.12;
    const local = (x: number, y: number, z: number): V3 => [x, y - hy, z + Math.max(0, y - yk) * RAKE - hz];
    const handle = put(trunkPivot, rbox(0.3, 0.04, 0.03, 0.01), toon(C.chrome, { shine: 1, metal: 0.9 }), local(0, yk - 0.05, S.tailZ - 0.014), 'thin');
    put(trunkPivot, rbox(0.34, 0.12, 0.012, 0.01), toon(C.plate, { shine: 0.5 }), local(0, yk - 0.2, S.tailZ - 0.008), 'thin');

    // split taillights: one half wraps the body corner, the other rides on the gate
    const lampMat = () => toon(C.taillight, { emissive: C.taillight, emissiveIntensity: 0.6, shine: 0.8, halftone: 0 });
    const lampY = yk + 0.035;
    for (const side of [1, -1]) {
      const body = put(group, rbox(0.03, 0.09, 0.3, 0.014), lampMat(), [side * (W + 0.01), lampY, S.tailZ + 0.17]);
      const corner = put(group, rbox(RIM + 0.02, 0.09, 0.03, 0.012), lampMat(), [side * (W - RIM / 2 + 0.01), lampY, S.tailZ - 0.005 + 0.035 * RAKE]);
      const onGate = put(trunkPivot, rbox(0.3, 0.08, 0.025, 0.012), lampMat(), local(side * (W - RIM - 0.18), lampY, S.tailZ - 0.012));
      suvTails.push(body, corner, onGate);
    }
    suvLampPos = new THREE.Vector3(W, lampY, S.tailZ + 0.05);

    // rear face below the window line: a U-shaped panel that wraps the lower gate
    {
      const L = lowerWidth(S.tailZ) - 0.012;
      const yb0 = lowerBottom(S.tailZ) + 0.05;
      const yT = yk + 0.01;
      const G = W - RIM;
      const gb = gateBottom - GAP;
      const r = 0.12;
      const u = new THREE.Shape();
      u.moveTo(-L + r, yb0);
      u.lineTo(L - r, yb0);
      u.quadraticCurveTo(L, yb0, L, yb0 + r);
      u.lineTo(L, yT);
      u.lineTo(G, yT);
      u.lineTo(G, gb + 0.06);
      u.quadraticCurveTo(G, gb, G - 0.06, gb);
      u.lineTo(-G + 0.06, gb);
      u.quadraticCurveTo(-G, gb, -G, gb + 0.06);
      u.lineTo(-G, yT);
      u.lineTo(-L, yT);
      u.lineTo(-L, yb0 + r);
      u.quadraticCurveTo(-L, yb0, -L + r, yb0);
      const uGeom = new THREE.ExtrudeGeometry(u, { depth: 0.05, bevelEnabled: true, bevelThickness: BT, bevelSize: BT, bevelSegments: 2, curveSegments: 10 });
      uGeom.translate(0, 0, S.tailZ + BT);
      bodyMeshes.push(put(group, uGeom, paint()));
      // dark load sill between the gate bottom and the cargo floor
      put(group, rbox(2 * G - 0.02, cargoY - gb, 0.02, 0.006), toon(C.bay, { halftone: 0.6 }), [0, (cargoY + gb) / 2, S.tailZ + 0.06], false);
    }

    const cargoZ0 = S.tailZ + 0.05;
    const cargoZ1 = (S.rearSeatZ ?? S.seatZ) - 0.2;
    put(group, rbox((S.halfW - 0.1) * 2, 0.03, cargoZ1 - cargoZ0, 0.01), toon(C.bay, { halftone: 0.6 }), [0, cargoY, (cargoZ0 + cargoZ1) / 2], false);
    // spare wheel strapped to the cargo floor
    const spare = put(group, new THREE.CylinderGeometry(0.27, 0.27, 0.1, 32), toon(C.tire), [0.15, cargoY + 0.065, (cargoZ0 + cargoZ1) / 2 - 0.1], 'thin');
    const spareHub = put(group, new THREE.CylinderGeometry(0.15, 0.15, 0.104, 24), toon(C.rim, { shine: 0.7, metal: 0.6 }), [0.15, cargoY + 0.066, (cargoZ0 + cargoZ1) / 2 - 0.1], 'thin');
    tag('trunk', panel, handle, spare, spareHub);
    trunkOpen = 1.35;
    trunkBeacon = [0, yk - 0.05, S.tailZ - 0.14];
    trunkView = [0.45, 0.55, -1];
  }

  // ---------- driver door (+x) ----------
  const [doorZ0, doorZ1] = S.door;
  const doorMid = lower((doorZ0 + doorZ1) / 2);
  const tLow = tAtY(doorMid, S.doorY[0], LOWER_N);
  const tHigh = tAtY(doorMid, S.doorY[1], LOWER_N);
  const doorHinge = ringPoint(lower(doorZ1), (tLow + tHigh) / 2, LOWER_N);
  const doorPivot = new THREE.Group();
  doorPivot.position.copy(doorHinge);
  group.add(doorPivot);
  const doorGeom = shell(lower, LOWER_N, doorZ0, doorZ1, tLow, tHigh, 0.006, 0.026, 24, 14);
  doorGeom.translate(-doorHinge.x, -doorHinge.y, -doorHinge.z);
  const door = put(doorPivot, doorGeom, paint());
  // dark opening behind the door
  put(group, shell(lower, LOWER_N, doorZ0 + 0.02, doorZ1 - 0.02, tLow + 0.01, tHigh - 0.01, 0.002, 0.002, 10, 8), toon(C.bay, { halftone: 0.5, side: THREE.DoubleSide }), undefined, false);
  const chromeMat = () => toon(C.chrome, { shine: 1, metal: 0.9 });
  const handleY = S.doorY[1] - 0.12;
  const sideX = (z: number, y: number, side: number, lift: number) => {
    const s = lower(z);
    const t = tAtY(s, y, LOWER_N);
    return ringPoint(s, side > 0 ? t : 0.5 - t, LOWER_N).x + side * lift;
  };
  const doorHandle = put(doorPivot, rbox(0.035, 0.04, 0.16, 0.012), chromeMat(), [sideX(doorZ0 + 0.2, handleY, 1, 0.045) - doorHinge.x, handleY - doorHinge.y, doorZ0 + 0.2 - doorHinge.z], 'thin');
  const charY = S.belt - 0.17;
  const doorLine = inkLine(surfaceLine(lower, LOWER_N, doorZ0 + 0.01, doorZ1 - 0.01, (s) => tAtY(s, charY, LOWER_N), 0.034, 20));
  doorLine.position.set(-doorHinge.x, -doorHinge.y, -doorHinge.z);
  doorPivot.add(doorLine);

  // mirrors (part of the door hotspot)
  const mirrorMeshes: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const parent = side > 0 ? doorPivot : group;
    const off = side > 0 ? doorHinge : new THREE.Vector3();
    const mx = side * (S.ghW[0] + 0.12);
    const my = S.belt + 0.1;
    const mz = S.cowlZ - 0.16;
    put(parent, rbox(0.14, 0.04, 0.05, 0.015), toon(C.trim), [side * (S.ghW[0] + 0.04) - off.x, my - 0.03 - off.y, mz - off.z], 'thin');
    const m = put(parent, rbox(0.12, 0.11, 0.19, 0.045), paint(), [mx - off.x, my - off.y, mz - off.z]);
    m.rotation.y = side * 0.12;
    mirrorMeshes.push(m);
  }
  tag('door', door, doorHandle, ...mirrorMeshes);

  // static door seams + handles on the other doors
  const seam = (side: number, z0: number, z1: number) => {
    const s = lower((z0 + z1) / 2);
    let t0 = tAtY(s, S.doorY[0], LOWER_N);
    let t1 = tAtY(s, S.doorY[1], LOWER_N);
    if (side < 0) [t0, t1] = [0.5 - t1, 0.5 - t0];
    const tt = (tv: number) => () => tv;
    const pts = [
      ...surfaceLine(lower, LOWER_N, z0, z1, tt(t0), 0.004, 16),
      ...ringLine(lower, LOWER_N, z1, t0, t1, 0.004, 10),
      ...surfaceLine(lower, LOWER_N, z1, z0, tt(t1), 0.004, 16),
      ...ringLine(lower, LOWER_N, z0, t1, t0, 0.004, 10),
    ];
    group.add(inkLine(pts, 1.6));
    put(group, rbox(0.035, 0.04, 0.16, 0.012), chromeMat(), [sideX(z0 + 0.2, handleY, side, 0.02), handleY, z0 + 0.2], 'thin');
  };
  seam(-1, doorZ0, doorZ1);
  seam(1, S.rearDoor[0], S.rearDoor[1]);
  seam(-1, S.rearDoor[0], S.rearDoor[1]);

  // shoulder character line (rear quarters + front fenders)
  for (const side of [1, -1]) {
    const tq = (s: Section) => {
      const t = tAtY(s, charY, LOWER_N);
      return side > 0 ? t : 0.5 - t;
    };
    group.add(inkLine(surfaceLine(lower, LOWER_N, S.tailZ + 0.12, side > 0 ? doorZ0 : S.cowlZ, tq, 0.004, 60), 1.8));
    group.add(inkLine(surfaceLine(fender(side), LOWER_N, S.cowlZ, S.fasciaZ + 0.04, tq, 0.004, 30), 1.8));
  }

  // ---------- cabin ----------
  const seatMat = () => toon(C.seat, { halftone: 0.7 });
  const seatParts: THREE.Mesh[] = [];
  const cushionY = S.floorY + 0.14;
  const backTop = S.belt + 0.2;
  const backH = backTop - (cushionY - 0.04);
  for (const x of [0.36, -0.36]) {
    seatParts.push(put(group, rbox(0.4, 0.13, 0.44, 0.05), seatMat(), [x, cushionY, S.seatZ], 'thin'));
    const back = put(group, rbox(0.4, backH, 0.12, 0.05), seatMat(), [x, cushionY - 0.04 + backH / 2, S.seatZ - 0.24], 'thin');
    back.rotation.x = -0.12;
    seatParts.push(back);
    seatParts.push(put(group, rbox(0.22, 0.13, 0.09, 0.04), seatMat(), [x, backTop + 0.1, S.seatZ - 0.27], 'thin'));
  }
  if (S.rearSeatZ !== null) {
    const rearBackH = backTop - 0.04 - (cushionY - 0.04);
    seatParts.push(put(group, rbox(1.24, 0.13, 0.42, 0.05), seatMat(), [0, cushionY, S.rearSeatZ], 'thin'));
    const rb = put(group, rbox(1.24, rearBackH, 0.12, 0.05), seatMat(), [0, cushionY - 0.04 + rearBackH / 2, S.rearSeatZ - 0.22], 'thin');
    rb.rotation.x = -0.14;
    seatParts.push(rb);
  }
  const dashZ = S.cowlZ - 0.22;
  const dash = put(group, rbox(S.ghW[0] * 2 - 0.14, 0.2, 0.3, 0.05), toon(C.trim, { halftone: 0.7 }), [0, S.belt - 0.04, dashZ], 'thin');
  const steering = put(group, new THREE.TorusGeometry(0.15, 0.022, 10, 32), toon(C.trim), [0.36, S.belt + 0.06, dashZ - 0.2], 'thin');
  steering.rotation.x = -1.15;
  const fuseCabin = put(group, rbox(0.15, 0.1, 0.05, 0.01), toon(C.fuse), [S.ghW[0] - 0.16, S.belt - 0.16, dashZ - 0.12], 'thin');
  tag('cabin', ...seatParts, dash, steering);
  tag('fusebox_cabin', fuseCabin);

  // ---------- engine bay ----------
  const F = S.bayFloor;
  const bz0 = S.cowlZ + 0.06;
  const bz1 = S.fasciaZ - 0.02;
  const bm = (bz0 + bz1) / 2;
  const engine = put(group, rbox(0.6, 0.28, 0.5, 0.04), toon(C.engine, { shine: 0.4, metal: 0.4 }), [0.02, F + 0.14, bm], 'thin');
  const cover = put(group, rbox(0.46, 0.06, 0.36, 0.02), toon(C.cover, { shine: 0.5, metal: 0.4 }), [0.02, F + 0.31, bm], 'thin');
  const pulley = put(group, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24), chromeMat(), [0.33, F + 0.12, bm + 0.08], 'thin');
  pulley.rotation.z = Math.PI / 2;
  tag('engine', engine, cover, pulley);

  const oilCap = put(group, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 20), toon(C.oil, { shine: 0.6 }), [0.14, F + 0.36, bm - 0.07], 'thin');
  const dipRing = put(group, new THREE.TorusGeometry(0.035, 0.01, 8, 20), toon(C.oil), [-0.22, F + 0.3, bm + 0.18], 'thin');
  const dipstick = put(group, new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), toon(C.oil), [-0.22, F + 0.18, bm + 0.18], false);
  tag('oil', oilCap, dipRing, dipstick);

  const battery = put(group, rbox(0.26, 0.2, 0.18, 0.02), toon(C.battery), [-0.34, F + 0.1, bz0 + 0.16], 'thin');
  const termPos = put(group, new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), toon(0xe2364a), [-0.42, F + 0.22, bz0 + 0.1], false);
  const termNeg = put(group, new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), toon(C.trim), [-0.26, F + 0.22, bz0 + 0.1], false);
  tag('battery', battery, termPos, termNeg);

  const airbox = put(group, rbox(0.26, 0.18, 0.24, 0.03), toon(C.airbox), [0.36, F + 0.09, bz0 + 0.18], 'thin');
  const intake = put(group, new THREE.CylinderGeometry(0.05, 0.05, 0.26, 16), toon(C.airbox), [0.3, F + 0.16, bz0 + 0.42], 'thin');
  intake.rotation.x = Math.PI / 2;
  tag('airbox', airbox, intake);

  const coolant = put(group, rbox(0.15, 0.2, 0.16, 0.03), toon(C.coolant, { shine: 0.5 }), [0.37, F + 0.1, bz1 - 0.12], 'thin');
  const coolantCap = put(group, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), toon(C.coolantCap), [0.37, F + 0.215, bz1 - 0.12], false);
  tag('coolant', coolant, coolantCap);

  const washer = put(group, rbox(0.14, 0.18, 0.16, 0.03), toon(C.washer, { shine: 0.5 }), [-0.37, F + 0.09, bz1 - 0.12], 'thin');
  const washerCap = put(group, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), toon(C.washerCap), [-0.37, F + 0.195, bz1 - 0.12], false);
  tag('washer', washer, washerCap);

  const fuseEngine = put(group, rbox(0.2, 0.1, 0.15, 0.02), toon(C.fuse), [-0.36, F + 0.05, bm + 0.05], 'thin');
  tag('fusebox_engine', fuseEngine);

  // ---------- front end ----------
  // Lamps sit on the flat part of the nose, not on its rounded top edge.
  const lightY = (fasciaTop(S.noseZ) + fasciaBottom(S.noseZ)) / 2 + 0.06;
  const headMat = () => toon(0xffe7a8, { emissive: 0xffd77a, emissiveIntensity: 0.35, shine: 0.9, halftone: 0 });
  const heads: THREE.Mesh[] = [];
  const lampW = 0.42;
  const lampH = S.suv ? 0.19 : 0.16;
  const glow = () => toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1, halftone: 0 });
  for (const side of [1, -1]) {
    const lamp = new THREE.Group();
    lamp.position.set(side * 0.53, lightY, S.noseZ - 0.04);
    lamp.rotation.y = side * 0.22;
    group.add(lamp);
    heads.push(put(lamp, rbox(lampW + 0.03, lampH + 0.03, 0.06, 0.07), toon(0x14121a, { halftone: 0 }), [0, 0, -0.005], 'thin'));
    heads.push(put(lamp, rbox(lampW, lampH, 0.08, 0.075), headMat(), [0, 0, 0.022]));
    const eye = put(lamp, new THREE.CylinderGeometry(lampH * 0.34, lampH * 0.34, 0.02, 28), glow(), [side * 0.075, 0.005, 0.066], 'thin');
    eye.rotation.x = Math.PI / 2;
    heads.push(eye);
    heads.push(put(lamp, rbox(lampW * 0.42, 0.022, 0.012, 0.009), glow(), [-side * 0.08, -lampH * 0.28, 0.064], false));
  }
  tag('headlight', ...heads);
  const grilleH = Math.min(0.2, lightY - fasciaBottom(S.noseZ) - 0.06);
  put(group, rbox(0.56, grilleH, 0.06, 0.05), toon(C.trim, { halftone: 0.5 }), [0, lightY - 0.02, S.noseZ - 0.01]);
  for (let i = 0; i < 3; i++) {
    put(group, rbox(0.5, 0.018, 0.02, 0.008), chromeMat(), [0, lightY - 0.02 - grilleH / 2 + (grilleH * (i + 1)) / 4, S.noseZ + 0.02], false);
  }
  put(group, rbox(0.32, 0.1, 0.012, 0.01), toon(C.plate, { shine: 0.5 }), [0, fasciaBottom(S.noseZ) + 0.1, S.noseZ + 0.005], 'thin');
  put(group, rbox(1.5, 0.07, 0.16, 0.03), toon(C.trim, { halftone: 0.5 }), [0, S.bottom + 0.05, S.noseZ - 0.12], 'thin');

  // ---------- rear end ----------
  const tails: THREE.Mesh[] = [];
  const tailTop = lowerTop(S.tailZ + 0.03);
  for (const side of [1, -1]) {
    if (S.suv) continue; // built with the liftgate
    const mat = toon(C.taillight, { emissive: C.taillight, emissiveIntensity: 0.6, shine: 0.8, halftone: 0 });
    tails.push(put(group, rbox(0.42, 0.11, 0.06, 0.03), mat, [side * 0.56, tailTop - 0.1, S.tailZ + 0.0]));
  }
  tails.push(...suvTails);
  tag('taillight', ...tails);
  if (!S.suv) put(group, rbox(0.32, 0.1, 0.012, 0.01), toon(C.plate, { shine: 0.5 }), [0, lowerBottom(S.tailZ) + 0.12, S.tailZ - 0.005], 'thin');
  put(group, rbox(1.5, 0.08, 0.14, 0.03), toon(C.trim, { halftone: 0.5 }), [0, S.bottom + 0.06, S.tailZ + 0.08], 'thin');

  // exhaust
  const tipZ = S.tailZ - 0.04;
  const pipe = put(group, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 12), toon(C.disc, { metal: 0.6 }), [-0.5, S.bottom - 0.04, S.tailZ + 0.6], false);
  pipe.rotation.x = Math.PI / 2;
  const tip = put(group, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16), chromeMat(), [-0.5, S.bottom - 0.03, tipZ], 'thin');
  tip.rotation.x = Math.PI / 2;
  tag('exhaust', pipe, tip);

  // fuel door (-x rear quarter)
  const fuelZ = S.wheelZ[1] - (S.suv ? 0.05 : 0.3);
  const fuelY = S.belt - 0.13;
  const fuel = put(group, new THREE.CylinderGeometry(0.075, 0.075, 0.014, 24), paint(), [sideX(fuelZ, fuelY, -1, 0.006), fuelY, fuelZ], 'thin');
  fuel.rotation.z = Math.PI / 2;
  tag('fueldoor', fuel);

  // wipers
  const wipers: THREE.Mesh[] = [];
  const wipeArms: THREE.Group[] = [];
  const wipeZ = S.cowlZ - 0.08;
  const wipeSlope = (roofLine(wipeZ - 0.08) - roofLine(wipeZ + 0.04)) / 0.12;
  const bladeLen = S.ghW[1] * 0.72;
  const WIPER_REST = -0.05;
  for (const px of [S.ghW[1] * 0.66, -S.ghW[1] * 0.06]) {
    // base frame: local y = windshield normal, local -z = up the glass
    const base = new THREE.Group();
    base.position.set(px, roofLine(wipeZ) + 0.02, wipeZ);
    base.rotation.x = Math.atan(wipeSlope);
    group.add(base);
    const arm = new THREE.Group();
    arm.rotation.y = WIPER_REST;
    base.add(arm);
    wipers.push(put(arm, rbox(bladeLen, 0.016, 0.028, 0.007), toon(C.trim), [-bladeLen / 2, 0.006, 0], 'thin'));
    const hub = put(arm, new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), toon(C.trim), [0, 0.006, 0], 'thin');
    wipers.push(hub);
    wipeArms.push(arm);
  }
  tag('wiper', ...wipers);
  const wipe = () =>
    tween({
      duration: 1700,
      ease: (k) => k,
      tag: `wipe:${kind}`,
      update: (k) => {
        const a = 0.5 - 0.5 * Math.cos(k * Math.PI * 4); // two full sweeps
        wipeArms.forEach((arm, i) => (arm.rotation.y = WIPER_REST - 1.3 * Math.max(0, a - i * 0.03)));
      },
    });

  // ---------- wheels ----------
  const R = S.wheelR;
  const W = S.wheelW;
  const tireGeom = (() => {
    const prof: THREE.Vector2[] = [
      [0.64 * R, -W / 2],
      [R - 0.06, -W / 2],
      [R - 0.015, -W / 2 + 0.02],
      [R, -W / 2 + 0.06],
      [R, W / 2 - 0.06],
      [R - 0.015, W / 2 - 0.02],
      [R - 0.06, W / 2],
      [0.64 * R, W / 2],
      [0.64 * R, -W / 2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(prof, 48);
    g.rotateZ(Math.PI / 2);
    return g;
  })();
  const wheelMeshes: THREE.Mesh[] = [];
  const brakeMeshes: THREE.Mesh[] = [];
  for (const [side, z] of [[1, S.wheelZ[0]], [-1, S.wheelZ[0]], [1, S.wheelZ[1]], [-1, S.wheelZ[1]]] as const) {
    const wg = new THREE.Group();
    wg.position.set(side * S.track, R, z);
    group.add(wg);
    const face = side * (W / 2 - 0.03);
    wheelMeshes.push(put(wg, tireGeom, toon(C.tire, { shine: 0.15 })));
    const barrel = new THREE.CylinderGeometry(0.63 * R, 0.63 * R, W * 0.8, 28, 1, true);
    barrel.rotateZ(Math.PI / 2);
    put(wg, barrel, toon(C.barrel, { side: THREE.DoubleSide, halftone: 0.6 }), undefined, false);
    const lip = new THREE.TorusGeometry(0.62 * R, 0.022, 8, 36);
    lip.rotateY(Math.PI / 2);
    wheelMeshes.push(put(wg, lip, toon(C.rim, { shine: 0.9, metal: 0.7 }), [face, 0, 0], 'thin'));
    for (let k = 0; k < 5; k++) {
      const g = rbox(0.035, 0.52 * R, 0.085, 0.015);
      g.translate(0, 0.3 * R, 0);
      const spoke = put(wg, g, toon(C.rim, { shine: 0.9, metal: 0.7 }), [face, 0, 0], 'thin');
      spoke.rotation.x = (k * Math.PI * 2) / 5;
      wheelMeshes.push(spoke);
    }
    const hub = new THREE.CylinderGeometry(0.15 * R, 0.15 * R, 0.05, 20);
    hub.rotateZ(Math.PI / 2);
    wheelMeshes.push(put(wg, hub, chromeMat(), [face, 0, 0], 'thin'));
    const disc = new THREE.CylinderGeometry(0.5 * R, 0.5 * R, 0.025, 28);
    disc.rotateZ(Math.PI / 2);
    brakeMeshes.push(put(wg, disc, toon(C.disc, { shine: 0.5, metal: 0.6 }), [side * 0.0, 0, 0], 'thin'));
    const caliper = put(wg, rbox(0.07, 0.17, 0.12, 0.03), toon(C.caliper, { shine: 0.6 }), [side * 0.03, 0.26 * R, -0.28 * R], 'thin');
    caliper.rotation.x = 0.6;
    brakeMeshes.push(caliper);
  }
  tag('wheel', ...wheelMeshes);
  tag('brakes', ...brakeMeshes);

  // ---------- beacons ----------
  const beaconGeom = new THREE.SphereGeometry(0.045, 16, 16);
  const beaconAt = (part: PartId, p: V3) => {
    const b = new THREE.Mesh(beaconGeom, new THREE.MeshBasicMaterial({ color: C.beacon, transparent: true, opacity: 0.92 }));
    b.position.set(...p);
    b.renderOrder = 3;
    b.userData.part = part;
    b.userData.beacon = true;
    group.add(b);
    beacons.set(part, b);
    tag(part, b);
  };
  const hoodMidZ = (hoodZ0 + hoodZ1) / 2;
  beaconAt('hood', [0, hoodLine(hoodMidZ) + 0.12, hoodMidZ]);
  beaconAt('oil', [0.14, F + 0.47, bm - 0.07]);
  beaconAt('battery', [-0.34, F + 0.31, bz0 + 0.16]);
  beaconAt('airbox', [0.36, F + 0.29, bz0 + 0.18]);
  beaconAt('coolant', [0.37, F + 0.33, bz1 - 0.12]);
  beaconAt('washer', [-0.37, F + 0.31, bz1 - 0.12]);
  beaconAt('fusebox_engine', [-0.36, F + 0.19, bm + 0.05]);
  beaconAt('engine', [0.02, F + 0.47, bm + 0.16]);
  beaconAt('wiper', [0, S.belt + 0.12, S.cowlZ - 0.06]);
  beaconAt('headlight', [0.6, lightY + 0.16, S.noseZ + 0.02]);
  const lampAt: V3 = suvLampPos ? [suvLampPos.x, suvLampPos.y, suvLampPos.z] : [0.56, tailTop - 0.1, S.tailZ];
  beaconAt('taillight', suvLampPos ? [lampAt[0] + 0.06, lampAt[1] + 0.14, lampAt[2] - 0.1] : [0.56, tailTop + 0.05, S.tailZ - 0.08]);
  beaconAt('wheel', [S.halfW + 0.12, R + 0.32, S.wheelZ[0]]);
  beaconAt('brakes', [S.halfW + 0.12, R, S.wheelZ[1]]);
  beaconAt('trunk', trunkBeacon);
  beaconAt('door', [S.halfW + 0.12, S.belt - 0.28, (doorZ0 + doorZ1) / 2]);
  beaconAt('cabin', [0.36, roofLine(S.seatZ) + 0.14, S.seatZ]);
  beaconAt('fusebox_cabin', [S.halfW + 0.1, S.belt + 0.06, dashZ]);
  beaconAt('fueldoor', [-(S.halfW + 0.12), fuelY, fuelZ]);
  beaconAt('exhaust', [-0.5, S.bottom - 0.12, tipZ - 0.08]);

  // ---------- lids ----------
  const lidState: Record<LidId, boolean> = { hood: false, trunk: false, door: false };
  const lids: Record<LidId, { pivot: THREE.Group; axis: 'x' | 'y'; open: number }> = {
    hood: { pivot: hoodPivot, axis: 'x', open: -1.1 },
    trunk: { pivot: trunkPivot, axis: 'x', open: trunkOpen },
    door: { pivot: doorPivot, axis: 'y', open: -1.0 },
  };

  function setLid(lid: LidId, open: boolean): void {
    if (lidState[lid] === open) return;
    lidState[lid] = open;
    const { pivot, axis, open: angle } = lids[lid];
    const from = pivot.rotation[axis];
    const to = open ? angle : 0;
    tween({
      duration: 750,
      ease: easeInOutCubic,
      tag: `lid:${kind}:${lid}`,
      update: (k) => {
        pivot.rotation[axis] = lerp(from, to, k);
      },
    });
  }

  // ---------- camera views ----------
  const view = (target: V3, dir: V3, dist: number): View => {
    const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
    return { target, pos: [target[0] + d.x, target[1] + d.y, target[2] + d.z] };
  };
  const bayDir: V3 = [0.5, 1.1, 0.9];
  const views: Record<PartId, View> = {
    hood: view([0, hoodLine(hoodMidZ), hoodMidZ], [0.55, 0.75, 1], 3.4),
    engine: view([0.02, F + 0.25, bm], bayDir, 1.9),
    battery: view([-0.34, F + 0.1, bz0 + 0.16], [-0.6, 1.1, 0.9], 1.7),
    oil: view([0.14, F + 0.3, bm - 0.05], bayDir, 1.7),
    airbox: view([0.36, F + 0.1, bz0 + 0.18], [0.7, 1.1, 0.9], 1.7),
    coolant: view([0.37, F + 0.1, bz1 - 0.12], [0.6, 1.0, 1.0], 1.7),
    washer: view([-0.37, F + 0.1, bz1 - 0.12], [-0.6, 1.0, 1.0], 1.7),
    fusebox_engine: view([-0.36, F + 0.06, bm + 0.05], [-0.6, 1.1, 0.9], 1.6),
    wiper: view([0.05, roofLine(wipeZ - 0.22), wipeZ - 0.22], [0.35, 0.75, 1], 2.5),
    headlight: view([0.56, lightY, S.noseZ - 0.05], [0.6, 0.25, 1], 2.1),
    taillight: view(lampAt, [0.6, 0.25, -1], 2.3),
    wheel: view([S.track, R, S.wheelZ[0]], [1, 0.25, 0.45], 2.4),
    brakes: view([S.track, R, S.wheelZ[1]], [1, 0.15, -0.35], 2.0),
    trunk: view([0, S.belt, S.deck ? (S.deck[0] + S.deck[1]) / 2 : S.tailZ], trunkView, 3.3),
    door: view([S.halfW, S.belt - 0.2, (doorZ0 + doorZ1) / 2], [1, 0.3, 0.25], 3.2),
    cabin: view([0.3, S.belt, S.seatZ], [1, 0.45, 0.2], 2.8),
    fusebox_cabin: view([S.ghW[0] - 0.16, S.belt - 0.14, dashZ - 0.12], [1, 0.55, 0.3], 1.9),
    fueldoor: view([-S.halfW, fuelY, fuelZ], [-1, 0.2, -0.45], 2.1),
    exhaust: view([-0.5, S.bottom, S.tailZ], [-0.4, 0.2, -1], 2.2),
  };
  const overview: View = S.suv ? { pos: [5.9, 3.2, 6.9], target: [0, 0.85, 0] } : { pos: [5.4, 2.9, 6.4], target: [0, 0.65, 0] };

  // ---------- paint ----------
  function setPaint(p: Paint, instant = false): void {
    paintState = p;
    const target = new THREE.Color(p.color);
    for (const m of paintMats) {
      const u = m.userData.uniforms as ToonUniforms;
      const c0 = m.color.clone();
      const s0 = u.uShine.value;
      const m0 = u.uMetal.value;
      if (instant) {
        m.color.copy(target);
        u.uShine.value = p.shine;
        u.uMetal.value = p.metal;
        continue;
      }
      tween({
        duration: 420,
        ease: easeInOutCubic,
        tag: `paint:${m.uuid}`,
        update: (k) => {
          m.color.copy(c0).lerp(target, k);
          u.uShine.value = lerp(s0, p.shine, k);
          u.uMetal.value = lerp(m0, p.metal, k);
        },
      });
    }
  }

  function update(t: number): void {
    const s = 1 + 0.18 * Math.sin(t * 2.4);
    beacons.forEach((b) => b.scale.setScalar(s));
  }

  return {
    kind,
    group,
    hotspots,
    beacons,
    views,
    overview,
    setLid,
    isLidOpen: (l) => lidState[l],
    setPaint,
    update,
    poke: (part) => {
      if (part === 'wiper') wipe();
    },
    dispose: () => disposeTree(group),
  };
}
