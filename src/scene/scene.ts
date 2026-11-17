import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PARTS, type PartId } from '../data/parts';
import { buildCar, type BodyKind, type CarRig, type LidId, type Paint } from './car';
import { tween, updateTweens, easeInOutCubic, easeOutBack, lerp } from './tween';
import { lineMaterials, setHighlight, shared, toon } from './toon';

export interface Appearance extends Paint {
  kind: BodyKind;
}

export interface SceneApi {
  focus(part: PartId | null): void;
  onSelect(cb: (part: PartId | null) => void): void;
  onHover(cb: (part: PartId | null) => void): void;
  setAppearance(a: Appearance): void;
}

export function createScene(canvas: HTMLCanvasElement, initial: Appearance): SceneApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // keep comic colours punchy

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  // Lights: warm key, cool fill, magenta + cyan rims for the Spider-Verse look.
  scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x2a1830, 0.75));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.45);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -5;
  key.shadow.camera.right = key.shadow.camera.top = 5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const magenta = new THREE.DirectionalLight(0xff4fd8, 0.9);
  magenta.position.set(-6, 3, -4);
  scene.add(magenta);
  const cyan = new THREE.DirectionalLight(0x45e0ff, 0.8);
  cyan.position.set(6, 2.5, -5);
  scene.add(cyan);
  const front = new THREE.DirectionalLight(0xb8c4ff, 0.3);
  front.position.set(-2, 3, 7);
  scene.add(front);

  // Ground: toon disc so the car's shadow picks up halftone dots.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64), toon(0x1d2133, { halftone: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(6.2, 7, 64),
    new THREE.MeshBasicMaterial({ color: 0x0f1218, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  scene.add(ring);

  let car: CarRig = buildCar(initial.kind);
  car.setPaint(initial, true);
  scene.add(car.group);
  camera.position.set(...car.overview.pos);
  controls.target.set(...car.overview.target);

  // Hover / selection highlighting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let allHotspots: THREE.Mesh[] = [];
  const baseEmissive = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();

  function indexHotspots(): void {
    allHotspots = [];
    baseEmissive.clear();
    car.hotspots.forEach((list) => allHotspots.push(...list));
    for (const m of allHotspots) {
      const mat = m.material as THREE.MeshToonMaterial;
      if (mat.emissive) baseEmissive.set(m, { color: mat.emissive.clone(), intensity: mat.emissiveIntensity });
    }
  }
  indexHotspots();

  const HILITE = new THREE.Color(0x6ee7ff);
  let hovered: PartId | null = null;
  let selected: PartId | null = null;
  const selectCbs: ((p: PartId | null) => void)[] = [];
  const hoverCbs: ((p: PartId | null) => void)[] = [];

  function setGlow(part: PartId | null, level: 'none' | 'hover' | 'selected'): void {
    if (!part) return;
    for (const m of car.hotspots.get(part) ?? []) {
      if (m.userData.beacon) continue;
      setHighlight(m, level);
      // A faint lift so small dark parts read as selected too.
      const mat = m.material as THREE.MeshToonMaterial;
      const base = baseEmissive.get(m);
      if (!base) continue;
      if (level === 'selected') {
        mat.emissive.copy(base.color).lerp(HILITE, 0.1);
        mat.emissiveIntensity = Math.max(base.intensity, 1);
      } else {
        mat.emissive.copy(base.color);
        mat.emissiveIntensity = base.intensity;
      }
    }
  }

  function refreshGlow(): void {
    for (const p of car.hotspots.keys()) setGlow(p, 'none');
    if (hovered && hovered !== selected) setGlow(hovered, 'hover');
    if (selected) setGlow(selected, 'selected');
  }

  function partVisible(part: PartId): boolean {
    const { behind, seeThrough } = PARTS[part];
    return !behind || seeThrough === true || car.isLidOpen(behind);
  }

  function pickPart(ev: PointerEvent): PartId | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(allHotspots, false);
    for (const h of hits) {
      const part = h.object.userData.part as PartId | undefined;
      if (!part) continue;
      if (h.object.userData.beacon && !h.object.visible) continue;
      if (!partVisible(part)) continue;
      return part;
    }
    return null;
  }

  let downAt: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const part = pickPart(e);
    if (part && part === selected) car.poke(part); // re-clicking replays the part's little animation
    selectCbs.forEach((cb) => cb(part));
  });
  canvas.addEventListener('pointermove', (e) => {
    const part = pickPart(e);
    if (part !== hovered) {
      hovered = part;
      canvas.style.cursor = part ? 'pointer' : 'grab';
      refreshGlow();
      hoverCbs.forEach((cb) => cb(part));
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    refreshGlow();
    hoverCbs.forEach((cb) => cb(null));
  });

  let idleTimer: number | undefined;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    window.clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!selected) controls.autoRotate = true;
    }, 9000);
  });

  function flyTo(pos: [number, number, number], target: [number, number, number]): void {
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    const p1 = new THREE.Vector3(...pos);
    const t1 = new THREE.Vector3(...target);
    tween({
      duration: 950,
      ease: easeInOutCubic,
      tag: 'camera',
      update: (k) => {
        camera.position.lerpVectors(p0, p1, k);
        controls.target.lerpVectors(t0, t1, k);
      },
    });
  }

  function applyLids(part: PartId | null): void {
    const want: Record<LidId, boolean> = { hood: false, trunk: false, door: false };
    if (part) {
      const behind = PARTS[part].behind;
      if (behind) want[behind] = true;
      if (part === 'hood' || part === 'trunk' || part === 'door') want[part] = true;
    }
    (Object.keys(want) as LidId[]).forEach((lid) => car.setLid(lid, want[lid]));
  }

  function flyToPart(part: PartId | null): void {
    if (part) {
      // Pull back a little and shift the target so the part sits left of the side panel.
      const v = car.views[part];
      const t = new THREE.Vector3(...v.target);
      const p = new THREE.Vector3(...v.pos).sub(t).multiplyScalar(1.3).add(t);
      if (window.innerWidth > 720) {
        const right = new THREE.Vector3().subVectors(t, p).cross(new THREE.Vector3(0, 1, 0)).normalize();
        const shift = right.multiplyScalar(p.distanceTo(t) * 0.18);
        t.add(shift);
        p.add(shift);
      }
      flyTo([p.x, p.y, p.z], [t.x, t.y, t.z]);
    } else {
      flyTo(car.overview.pos, car.overview.target);
      idleTimer = window.setTimeout(() => (controls.autoRotate = true), 4000);
    }
  }

  function focus(part: PartId | null): void {
    selected = part;
    controls.autoRotate = false;
    window.clearTimeout(idleTimer);
    applyLids(part);
    flyToPart(part);
    refreshGlow();
    if (part) car.poke(part);
  }

  // ---------- body swaps + paint ----------
  let swapping = false;
  let pending: Appearance | null = null;
  let current: Appearance = initial;

  function swap(a: Appearance): void {
    swapping = true;
    const old = car;
    tween({
      duration: 220,
      ease: (t) => t * t,
      tag: 'swap-out',
      update: (k) => old.group.scale.setScalar(Math.max(0.001, lerp(1, 0, k))),
      done: () => {
        scene.remove(old.group);
        old.dispose();
        car = buildCar(a.kind);
        car.setPaint(a, true);
        car.group.scale.setScalar(0.001);
        scene.add(car.group);
        syncLineResolution();
        indexHotspots();
        applyLids(selected);
        refreshGlow();
        if (selected) flyToPart(selected);
        else flyTo(car.overview.pos, car.overview.target);
        tween({
          duration: 560,
          ease: easeOutBack,
          tag: 'swap-in',
          update: (k) => car.group.scale.setScalar(Math.max(0.001, k)),
          done: () => {
            swapping = false;
            if (pending) {
              const next = pending;
              pending = null;
              setAppearance(next);
            }
          },
        });
      },
    });
  }

  function setAppearance(a: Appearance): void {
    if (swapping) {
      pending = a;
      return;
    }
    const prev = current;
    current = a;
    if (a.kind !== car.kind) swap(a);
    else if (a.color !== prev.color || a.shine !== prev.shine || a.metal !== prev.metal) car.setPaint(a);
  }

  // ---------- render loop ----------
  function syncLineResolution(): void {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;
    lineMaterials.forEach((m) => m.resolution.set(w, h));
  }

  function resize(): void {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    shared.uDotSize.value = 5.5 * renderer.getPixelRatio();
    syncLineResolution();
  }
  window.addEventListener('resize', resize);
  resize();

  const keyDir = new THREE.Vector3();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    updateTweens(performance.now());
    car.update(t);
    car.beacons.forEach((b, part) => {
      b.visible = partVisible(part) && part !== selected;
    });
    controls.update();
    camera.updateMatrixWorld();
    keyDir.copy(key.position).sub(key.target.position).normalize();
    shared.uKeyDir.value.copy(keyDir).transformDirection(camera.matrixWorldInverse);
    shared.uUpView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    renderer.render(scene, camera);
  });

  return {
    focus,
    onSelect: (cb) => selectCbs.push(cb),
    onHover: (cb) => hoverCbs.push(cb),
    setAppearance,
  };
}
