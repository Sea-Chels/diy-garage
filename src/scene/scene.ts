import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PARTS, type PartId } from '../data/parts';
import { buildCar, type CarRig, type LidId } from './car';
import { tween, updateTweens, easeInOutCubic } from './tween';

export interface SceneApi {
  focus(part: PartId | null): void;
  onSelect(cb: (part: PartId | null) => void): void;
  onHover(cb: (part: PartId | null) => void): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  // Lights
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.7));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.5);
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
  const fill = new THREE.DirectionalLight(0x9cc4ff, 0.6);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(0, 4, -8);
  scene.add(rim);

  // Ground: soft disc that catches the shadow and fades out.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 1, metalness: 0 }),
  );
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

  const car: CarRig = buildCar();
  scene.add(car.group);
  camera.position.set(...car.overview.pos);
  controls.target.set(...car.overview.target);

  // Hover / selection highlighting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const allHotspots: THREE.Mesh[] = [];
  car.hotspots.forEach((list) => allHotspots.push(...list));

  let hovered: PartId | null = null;
  let selected: PartId | null = null;
  const selectCbs: ((p: PartId | null) => void)[] = [];
  const hoverCbs: ((p: PartId | null) => void)[] = [];

  const baseEmissive = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();
  for (const m of allHotspots) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.emissive) baseEmissive.set(m, { color: mat.emissive.clone(), intensity: mat.emissiveIntensity });
  }

  function setGlow(part: PartId | null, strength: number): void {
    if (!part) return;
    for (const m of car.hotspots.get(part) ?? []) {
      if (m.userData.beacon) continue;
      const mat = m.material as THREE.MeshStandardMaterial;
      const base = baseEmissive.get(m);
      if (!base) continue;
      if (strength === 0) {
        mat.emissive.copy(base.color);
        mat.emissiveIntensity = base.intensity;
      } else {
        mat.emissive.set(0x6ee7ff);
        mat.emissiveIntensity = base.intensity + strength;
      }
    }
  }

  function refreshGlow(): void {
    for (const p of car.hotspots.keys()) setGlow(p, 0);
    if (hovered && hovered !== selected) setGlow(hovered, 0.12);
    if (selected) setGlow(selected, 0.2);
  }

  function partVisible(part: PartId): boolean {
    const behind = PARTS[part].behind;
    return !behind || car.isLidOpen(behind);
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
      // Parts hidden under a closed lid can't be picked, but the lid itself can.
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

  // Idle auto-rotate: pause on interaction, resume after a while when nothing is selected.
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

  function focus(part: PartId | null): void {
    selected = part;
    controls.autoRotate = false;
    window.clearTimeout(idleTimer);

    const wantOpen: Record<LidId, boolean> = { hood: false, trunk: false, door: false };
    if (part) {
      const behind = PARTS[part].behind;
      if (behind) wantOpen[behind] = true;
      if (part === 'hood' || part === 'trunk' || part === 'door') wantOpen[part] = true;
    }
    (Object.keys(wantOpen) as LidId[]).forEach((lid) => car.setLid(lid, wantOpen[lid]));

    if (part) {
      // Pull back a little and shift the target so the part sits left of the side panel.
      const v = car.views[part];
      const t = new THREE.Vector3(...v.target);
      const p = new THREE.Vector3(...v.pos).sub(t).multiplyScalar(1.3).add(t);
      const panelOpen = window.innerWidth > 720;
      if (panelOpen) {
        const right = new THREE.Vector3().subVectors(t, p).cross(new THREE.Vector3(0, 1, 0)).normalize();
        const shift = right.multiplyScalar(p.distanceTo(t) * 0.18);
        t.add(shift);
        p.add(shift);
      }
      flyTo([p.x, p.y, p.z], [t.x, t.y, t.z]);
    }
    else {
      flyTo(car.overview.pos, car.overview.target);
      idleTimer = window.setTimeout(() => (controls.autoRotate = true), 4000);
    }
    refreshGlow();
  }

  function resize(): void {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement ?? canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    updateTweens(performance.now());
    car.update(t);
    car.beacons.forEach((b, part) => {
      b.visible = partVisible(part) && part !== selected;
    });
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    focus,
    onSelect: (cb) => selectCbs.push(cb),
    onHover: (cb) => hoverCbs.push(cb),
  };
}
