/**
 * Stylized low-poly car built from primitives. This module is intentionally
 * self-contained so the model can be iterated (or replaced with a GLB) without
 * touching the rest of the app. The contract with the scene is `CarRig`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PartId } from '../data/parts';
import { tween, easeInOutCubic, lerp } from './tween';

export interface View {
  pos: [number, number, number];
  target: [number, number, number];
}

export type LidId = 'hood' | 'trunk' | 'door';

export interface CarRig {
  group: THREE.Group;
  /** Meshes that respond to hover/click, keyed by part. */
  hotspots: Map<PartId, THREE.Mesh[]>;
  /** Small pulsing markers that advertise clickable parts. */
  beacons: Map<PartId, THREE.Mesh>;
  views: Record<PartId, View>;
  overview: View;
  setLid(lid: LidId, open: boolean): void;
  isLidOpen(lid: LidId): boolean;
  update(t: number): void;
}

// Palette: tweak freely.
const C = {
  body: 0xf2694c,
  bodyDark: 0xc84f36,
  glass: 0x1b2230,
  trim: 0x23272f,
  chrome: 0xe8e4d8,
  tire: 0x1a1c20,
  hub: 0xd8d4c8,
  bay: 0x15181d,
  engine: 0x5a606b,
  battery: 0x2c2f36,
  airbox: 0x3a3f48,
  coolant: 0xdbe8ee,
  washer: 0x4aa3df,
  fuse: 0x2a2d33,
  oil: 0xf5c542,
  brake: 0xd94141,
  beacon: 0x6ee7ff,
  headlight: 0xfff4d6,
  taillight: 0xff3b3b,
  seat: 0x3b3f47,
};

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...opts });
}

function box(w: number, h: number, d: number, m: THREE.Material, r = 0.03): THREE.Mesh {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 32): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

export function buildCar(): CarRig {
  const group = new THREE.Group();
  const hotspots = new Map<PartId, THREE.Mesh[]>();
  const beacons = new Map<PartId, THREE.Mesh>();

  const tag = (part: PartId, ...meshes: THREE.Mesh[]) => {
    const list = hotspots.get(part) ?? [];
    for (const m of meshes) {
      // Own material per hotspot so highlighting one part never tints the shared body paint.
      if (!m.userData.beacon) m.material = (m.material as THREE.Material).clone();
      m.userData.part = part;
      list.push(m);
    }
    hotspots.set(part, list);
  };

  const bodyMat = mat(C.body, { roughness: 0.35, metalness: 0.15 });
  const trimMat = mat(C.trim, { roughness: 0.8 });
  const glassMat = mat(C.glass, { roughness: 0.15, metalness: 0.4 });
  const chromeMat = mat(C.chrome, { roughness: 0.3, metalness: 0.6 });

  // ---------- underbody ----------
  group.add(at(box(1.5, 0.22, 4.1, trimMat, 0.04), 0, 0.36, 0));

  // ---------- main tub (cabin + rear), z from -2.2 to 0.7 ----------
  const tub = at(box(1.8, 0.42, 2.9, bodyMat, 0.08), 0, 0.64, -0.75);
  group.add(tub);

  // ---------- nose: fenders, fascia, bay floor (z 0.7 .. 2.2) ----------
  const fenderL = at(box(0.22, 0.42, 1.5, bodyMat, 0.06), 0.79, 0.64, 1.45);
  const fenderR = at(box(0.22, 0.42, 1.5, bodyMat, 0.06), -0.79, 0.64, 1.45);
  const fascia = at(box(1.8, 0.42, 0.26, bodyMat, 0.06), 0, 0.64, 2.07);
  const bayFloor = at(box(1.4, 0.06, 1.3, mat(C.bay, { roughness: 0.95 }), 0.01), 0, 0.46, 1.35);
  const firewall = at(box(1.4, 0.4, 0.04, mat(C.bay, { roughness: 0.95 }), 0.01), 0, 0.65, 0.72);
  group.add(fenderL, fenderR, fascia, bayFloor, firewall);

  // grille + bumper
  group.add(at(box(0.9, 0.16, 0.06, trimMat, 0.02), 0, 0.6, 2.21));
  group.add(at(box(1.84, 0.1, 0.3, trimMat, 0.03), 0, 0.42, 2.1));
  group.add(at(box(1.84, 0.1, 0.3, trimMat, 0.03), 0, 0.42, -2.1));

  // ---------- greenhouse ----------
  const profile = new THREE.Shape();
  profile.moveTo(0.78, 0.84); // windshield base (z, y)
  profile.lineTo(0.15, 1.42); // roof front
  profile.lineTo(-1.25, 1.44); // roof rear
  profile.lineTo(-1.72, 0.84); // rear glass base
  profile.lineTo(0.78, 0.84);
  const ghGeom = new THREE.ExtrudeGeometry(profile, { depth: 1.56, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
  ghGeom.rotateY(-Math.PI / 2); // shape x → world z, extrusion → world x
  ghGeom.translate(0.78, 0, 0);
  const greenhouse = new THREE.Mesh(ghGeom, glassMat);
  greenhouse.castShadow = true;
  group.add(greenhouse);
  // roof cap in body color
  group.add(at(box(1.5, 0.06, 1.3, bodyMat, 0.03), 0, 1.47, -0.55));
  // B pillar / door seam hint
  group.add(at(box(1.62, 0.5, 0.04, trimMat, 0.01), 0, 1.1, -0.45));

  // ---------- hood (pivot at rear edge, z = 0.72) ----------
  const hoodPivot = at(new THREE.Group(), 0, 0.9, 0.72);
  const hoodPlate = at(box(1.56, 0.1, 1.42, bodyMat, 0.03), 0, 0.0, 0.71);
  hoodPivot.add(hoodPlate);
  group.add(hoodPivot);
  tag('hood', hoodPlate);

  // ---------- trunk lid (pivot at front edge, z = -1.62) ----------
  const trunkPivot = at(new THREE.Group(), 0, 0.9, -1.62);
  const trunkPlate = at(box(1.56, 0.1, 0.6, bodyMat, 0.03), 0, 0, -0.3);
  trunkPivot.add(trunkPlate);
  group.add(trunkPivot);
  group.add(at(box(1.46, 0.02, 0.52, mat(C.bay, { roughness: 1 }), 0.005), 0, 0.855, -1.92)); // dark opening
  // spare tire peeking in the trunk
  const spare = cyl(0.26, 0.26, 0.08, mat(C.tire, { roughness: 0.9 }));
  spare.rotation.x = Math.PI / 2;
  spare.rotation.z = 0.1;
  group.add(at(spare, 0.1, 0.8, -1.92));
  tag('trunk', trunkPlate, spare);

  // ---------- driver door (+X side, pivot at front edge z = 0.6) ----------
  const doorPivot = at(new THREE.Group(), 0.905, 0.64, 0.6);
  const doorPlate = at(box(0.05, 0.4, 1.02, bodyMat, 0.02), 0, 0, -0.51);
  const handle = at(box(0.03, 0.04, 0.14, chromeMat, 0.01), 0.035, 0.08, -0.85);
  doorPivot.add(doorPlate, handle);
  group.add(doorPivot);
  group.add(at(box(0.02, 0.36, 0.98, mat(C.bay, { roughness: 1 }), 0.005), 0.895, 0.64, 0.09)); // dark recess
  tag('door', doorPlate, handle);
  // passenger side door seam (static)
  group.add(at(box(0.05, 0.4, 1.02, bodyMat, 0.02), -0.905, 0.64, 0.09));
  group.add(at(box(0.03, 0.04, 0.14, chromeMat, 0.01), -0.94, 0.72, -0.25));
  // mirrors
  const mirrorL = at(box(0.1, 0.08, 0.14, bodyMat, 0.02), 1.0, 1.0, 0.62);
  const mirrorR = at(box(0.1, 0.08, 0.14, bodyMat, 0.02), -1.0, 1.0, 0.62);
  group.add(mirrorL, mirrorR);
  tag('door', mirrorL, mirrorR);

  // ---------- cabin bits (visible through the open door) ----------
  const seat = at(box(0.42, 0.2, 0.5, mat(C.seat, { roughness: 0.9 }), 0.03), 0.45, 0.95, 0.0);
  const seatBack = at(box(0.42, 0.5, 0.12, mat(C.seat, { roughness: 0.9 }), 0.03), 0.45, 1.25, -0.28);
  const dash = at(box(1.5, 0.18, 0.3, trimMat, 0.03), 0, 0.98, 0.62);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 10, 32), trimMat);
  wheel.rotation.x = -1.1;
  at(wheel, 0.45, 1.12, 0.42);
  const fuseCabin = at(box(0.16, 0.12, 0.05, mat(C.fuse, { roughness: 0.9 }), 0.01), 0.72, 0.78, 0.58);
  group.add(seat, seatBack, dash, wheel, fuseCabin);
  tag('cabin', seat, seatBack, dash, wheel);
  tag('fusebox_cabin', fuseCabin);

  // ---------- engine bay contents ----------
  const engine = at(box(0.8, 0.28, 0.62, mat(C.engine, { roughness: 0.6, metalness: 0.3 }), 0.04), 0.05, 0.63, 1.3);
  const valveCover = at(box(0.6, 0.06, 0.4, mat(C.trim, { roughness: 0.5, metalness: 0.4 }), 0.02), 0.05, 0.79, 1.3);
  group.add(engine, valveCover);
  // belt pulley on the side
  const pulley = cyl(0.1, 0.1, 0.04, chromeMat, 24);
  pulley.rotation.z = Math.PI / 2;
  group.add(at(pulley, 0.47, 0.62, 1.3));
  tag('engine', engine, valveCover, pulley);

  const oilCap = cyl(0.06, 0.06, 0.04, mat(C.oil, { roughness: 0.4 }), 20);
  at(oilCap, 0.2, 0.83, 1.18);
  const dipstick = cyl(0.012, 0.012, 0.18, mat(C.oil, { roughness: 0.4 }), 10);
  const dipRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 20), mat(C.oil));
  at(dipstick, -0.3, 0.72, 1.5);
  at(dipRing, -0.3, 0.82, 1.5);
  group.add(oilCap, dipstick, dipRing);
  tag('oil', oilCap, dipstick, dipRing);

  const battery = at(box(0.34, 0.22, 0.22, mat(C.battery, { roughness: 0.85 }), 0.02), -0.5, 0.6, 0.95);
  const termPos = cyl(0.025, 0.025, 0.05, mat(0xd94141), 12);
  const termNeg = cyl(0.025, 0.025, 0.05, trimMat, 12);
  at(termPos, -0.6, 0.73, 0.88);
  at(termNeg, -0.4, 0.73, 0.88);
  group.add(battery, termPos, termNeg);
  tag('battery', battery, termPos, termNeg);

  const airbox = at(box(0.36, 0.22, 0.3, mat(C.airbox, { roughness: 0.9 }), 0.03), 0.48, 0.6, 0.95);
  const intake = cyl(0.06, 0.06, 0.35, mat(C.airbox, { roughness: 0.9 }), 16);
  intake.rotation.x = Math.PI / 2;
  at(intake, 0.48, 0.62, 1.3);
  group.add(airbox, intake);
  tag('airbox', airbox, intake);

  const coolant = at(box(0.18, 0.24, 0.2, mat(C.coolant, { roughness: 0.4, transparent: true, opacity: 0.85 }), 0.03), 0.55, 0.6, 1.72);
  const coolantCap = cyl(0.045, 0.045, 0.03, mat(0x2b6cb0), 16);
  at(coolantCap, 0.55, 0.735, 1.72);
  group.add(coolant, coolantCap);
  tag('coolant', coolant, coolantCap);

  const washer = at(box(0.16, 0.22, 0.2, mat(C.washer, { roughness: 0.4, transparent: true, opacity: 0.85 }), 0.03), -0.56, 0.59, 1.72);
  const washerCap = cyl(0.045, 0.045, 0.03, mat(0x2b6cb0), 16);
  at(washerCap, -0.56, 0.715, 1.72);
  group.add(washer, washerCap);
  tag('washer', washer, washerCap);

  const fuseEngine = at(box(0.26, 0.14, 0.2, mat(C.fuse, { roughness: 0.9 }), 0.02), -0.5, 0.56, 1.38);
  group.add(fuseEngine);
  tag('fusebox_engine', fuseEngine);

  // ---------- lights ----------
  const headMat = mat(C.headlight, { emissive: C.headlight, emissiveIntensity: 0.9, roughness: 0.3 });
  const tailMat = mat(C.taillight, { emissive: C.taillight, emissiveIntensity: 0.9, roughness: 0.3 });
  const headL = at(box(0.36, 0.14, 0.06, headMat, 0.03), 0.6, 0.72, 2.22);
  const headR = at(box(0.36, 0.14, 0.06, headMat, 0.03), -0.6, 0.72, 2.22);
  const tailL = at(box(0.4, 0.12, 0.06, tailMat, 0.03), 0.6, 0.72, -2.22);
  const tailR = at(box(0.4, 0.12, 0.06, tailMat, 0.03), -0.6, 0.72, -2.22);
  group.add(headL, headR, tailL, tailR);
  tag('headlight', headL, headR);
  tag('taillight', tailL, tailR);
  // plate
  group.add(at(box(0.36, 0.12, 0.02, chromeMat, 0.01), 0, 0.6, -2.23));

  // ---------- wipers ----------
  const wiperMat = trimMat;
  const w1 = at(box(0.02, 0.02, 0.5, wiperMat, 0.005), 0.25, 0.9, 0.68);
  const w2 = at(box(0.02, 0.02, 0.5, wiperMat, 0.005), -0.3, 0.9, 0.68);
  w1.rotation.set(-0.75, 0.3, 0);
  w2.rotation.set(-0.75, 0.3, 0);
  group.add(w1, w2);
  tag('wiper', w1, w2);

  // ---------- fuel door (passenger side rear) ----------
  const fuelDoor = at(box(0.02, 0.16, 0.16, mat(C.bodyDark, { roughness: 0.4 }), 0.01), -0.91, 0.76, -1.5);
  group.add(fuelDoor);
  tag('fueldoor', fuelDoor);

  // ---------- exhaust ----------
  const pipe = cyl(0.04, 0.04, 1.4, chromeMat, 14);
  pipe.rotation.x = Math.PI / 2;
  at(pipe, -0.55, 0.26, -1.6);
  const muffler = cyl(0.1, 0.1, 0.5, mat(0x9a9890, { roughness: 0.5, metalness: 0.5 }), 14);
  muffler.rotation.x = Math.PI / 2;
  at(muffler, -0.55, 0.28, -1.3);
  const tip = cyl(0.05, 0.05, 0.12, chromeMat, 14);
  tip.rotation.x = Math.PI / 2;
  at(tip, -0.55, 0.26, -2.3);
  group.add(pipe, muffler, tip);
  tag('exhaust', pipe, muffler, tip);

  // ---------- wheels + brakes ----------
  const tireMat = mat(C.tire, { roughness: 0.95 });
  const hubMat = mat(C.hub, { roughness: 0.4, metalness: 0.5 });
  const discMat = mat(0x8c8c8c, { roughness: 0.4, metalness: 0.6 });
  const caliperMat = mat(C.brake, { roughness: 0.5 });
  const wheelMeshes: THREE.Mesh[] = [];
  const brakeMeshes: THREE.Mesh[] = [];
  for (const [x, z] of [[0.9, 1.4], [-0.9, 1.4], [0.9, -1.4], [-0.9, -1.4]] as const) {
    const side = Math.sign(x);
    const tire = cyl(0.36, 0.36, 0.26, tireMat, 36);
    tire.rotation.z = Math.PI / 2;
    at(tire, x, 0.36, z);
    const hub = cyl(0.22, 0.22, 0.27, hubMat, 10);
    hub.rotation.z = Math.PI / 2;
    at(hub, x, 0.36, z);
    const disc = cyl(0.24, 0.24, 0.03, discMat, 24);
    disc.rotation.z = Math.PI / 2;
    at(disc, x - side * 0.15, 0.36, z);
    const caliper = at(box(0.08, 0.12, 0.2, caliperMat, 0.02), x - side * 0.15, 0.54, z + 0.1);
    group.add(tire, hub, disc, caliper);
    wheelMeshes.push(tire, hub);
    brakeMeshes.push(disc, caliper);
  }
  tag('wheel', ...wheelMeshes);
  tag('brakes', ...brakeMeshes);

  // ---------- beacons ----------
  const beaconMat = new THREE.MeshBasicMaterial({ color: C.beacon, transparent: true, opacity: 0.9 });
  const beaconGeom = new THREE.SphereGeometry(0.045, 16, 16);
  const beaconAt = (part: PartId, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(beaconGeom, beaconMat.clone());
    at(b, x, y, z);
    b.userData.part = part;
    b.userData.beacon = true;
    group.add(b);
    beacons.set(part, b);
    tag(part, b);
  };
  beaconAt('hood', 0, 1.0, 1.4);
  beaconAt('oil', 0.2, 0.98, 1.18);
  beaconAt('battery', -0.5, 0.86, 0.95);
  beaconAt('airbox', 0.48, 0.86, 0.95);
  beaconAt('coolant', 0.55, 0.88, 1.72);
  beaconAt('washer', -0.56, 0.86, 1.72);
  beaconAt('fusebox_engine', -0.5, 0.76, 1.38);
  beaconAt('engine', 0.05, 1.0, 1.42);
  beaconAt('wiper', 0, 1.04, 0.66);
  beaconAt('headlight', 0.6, 0.92, 2.3);
  beaconAt('taillight', 0.6, 0.92, -2.3);
  beaconAt('wheel', 1.1, 0.8, 1.4);
  beaconAt('brakes', 1.1, 0.5, -1.4);
  beaconAt('trunk', 0, 1.06, -1.9);
  beaconAt('door', 1.06, 0.9, 0.1);
  beaconAt('cabin', 0.45, 1.5, 0.0);
  beaconAt('fusebox_cabin', 0.9, 0.78, 0.58);
  beaconAt('fueldoor', -1.06, 0.76, -1.5);
  beaconAt('exhaust', -0.55, 0.12, -2.3);

  // ---------- lids ----------
  const lidState: Record<LidId, boolean> = { hood: false, trunk: false, door: false };
  const lids: Record<LidId, { pivot: THREE.Group; axis: 'x' | 'y'; open: number }> = {
    hood: { pivot: hoodPivot, axis: 'x', open: -1.15 },
    trunk: { pivot: trunkPivot, axis: 'x', open: 1.2 },
    door: { pivot: doorPivot, axis: 'y', open: 1.0 },
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
      tag: `lid:${lid}`,
      update: (k) => {
        pivot.rotation[axis] = lerp(from, to, k);
      },
    });
  }

  const views: Record<PartId, View> = {
    hood: { pos: [2.6, 3.4, 4.8], target: [0, 0.7, 1.4] },
    engine: { pos: [1.3, 2.6, 3.4], target: [0.05, 0.7, 1.3] },
    battery: { pos: [-1.7, 2.1, 2.5], target: [-0.5, 0.62, 0.95] },
    oil: { pos: [1.5, 2.3, 2.7], target: [0.15, 0.8, 1.25] },
    airbox: { pos: [1.9, 2.1, 2.4], target: [0.48, 0.62, 0.95] },
    coolant: { pos: [1.7, 1.9, 3.5], target: [0.55, 0.62, 1.72] },
    washer: { pos: [-1.7, 1.9, 3.5], target: [-0.56, 0.62, 1.72] },
    fusebox_engine: { pos: [-1.9, 2.0, 3.1], target: [-0.5, 0.58, 1.38] },
    wiper: { pos: [1.6, 2.5, 3.0], target: [0, 0.92, 0.68] },
    headlight: { pos: [2.4, 1.5, 4.4], target: [0.6, 0.72, 2.2] },
    taillight: { pos: [2.4, 1.5, -4.4], target: [0.6, 0.72, -2.2] },
    wheel: { pos: [3.4, 1.2, 2.8], target: [0.9, 0.4, 1.4] },
    brakes: { pos: [3.0, 0.9, -2.5], target: [0.9, 0.4, -1.4] },
    trunk: { pos: [2.6, 3.2, -4.6], target: [0, 0.85, -1.9] },
    door: { pos: [4.2, 1.7, 1.4], target: [0.9, 0.75, 0.1] },
    cabin: { pos: [3.6, 2.0, 1.4], target: [0.45, 0.95, 0.1] },
    fusebox_cabin: { pos: [2.9, 1.3, 1.9], target: [0.72, 0.78, 0.58] },
    fueldoor: { pos: [-3.2, 1.3, -2.8], target: [-0.9, 0.76, -1.5] },
    exhaust: { pos: [-2.2, 0.7, -4.4], target: [-0.55, 0.3, -2.2] },
  };

  const overview: View = { pos: [5.4, 2.9, 6.4], target: [0, 0.6, 0] };

  function update(t: number): void {
    // Gentle beacon pulse; hidden beacons are handled by the scene.
    const s = 1 + 0.18 * Math.sin(t * 2.4);
    beacons.forEach((b) => b.scale.setScalar(s));
  }

  return { group, hotspots, beacons, views, overview, setLid, isLidOpen: (l) => lidState[l], update };
}
