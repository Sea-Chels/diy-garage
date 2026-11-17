/**
 * Comic-book shading: cel-banded lighting, hard specular, a cartoon horizon
 * reflection for metallic paint, screen-space halftone dots in the shadows,
 * and ink outlines (inverted hull) plus hand-placed ink lines.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export const INK = 0x16111f;

/** Uniforms shared by every toon material; the scene updates them each frame. */
export const shared = {
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, // key light direction, view space
  uUpView: { value: new THREE.Vector3(0, 1, 0) }, // world up, view space
  uDotSize: { value: 6 }, // halftone cell size in device pixels
};

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([60, 140, 205, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const DECL = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uUpView;
uniform float uDotSize;
uniform float uShine;
uniform float uMetal;
uniform float uHalftone;
`;

const COMIC = /* glsl */ `
{
  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);

  // Cartoon horizon reflection: bright sky above a hard line, dark ground below.
  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.03, 0.03, dot(R, normalize(uUpView)));
  vec3 refl = mix(vec3(0.08, 0.06, 0.14), vec3(0.86, 0.92, 1.0), sky);
  vec3 tinted = refl * mix(vec3(1.0), diffuseColor.rgb * 1.5 + 0.2, 0.55);
  outgoingLight = mix(outgoingLight, tinted, uMetal * (0.3 + 0.6 * fres) * 0.7);

  // Hard-edged specular highlight; size and strength follow the finish.
  vec3 H = normalize(normalize(uKeyDir) + V);
  float nh = max(dot(N, H), 0.0);
  float edge = mix(0.90, 0.968, uShine);
  float soft = mix(0.05, 0.004, uShine);
  float spec = smoothstep(edge - soft, edge + soft, nh) * mix(0.2, 0.95, uShine) * step(0.001, uShine);
  outgoingLight += vec3(1.0, 0.98, 0.95) * spec;

  // Thin rim on glancing angles.
  outgoingLight += diffuseColor.rgb * step(0.78, fres) * 0.16 * (0.4 + uShine);

  // Halftone dots where the surface gets little light (relative to its own colour,
  // so dark paint isn't dotted all over).
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  float baseLum = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.03);
  float rel = lum / baseLum;
  float a = 0.7854;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (gl_FragCoord.xy / uDotSize);
  float d = length(fract(q) - 0.5);
  float rad = clamp((0.9 - rel) * 0.6, 0.0, 0.46);
  float dotMask = 1.0 - smoothstep(rad - 0.05, rad + 0.05, d);
  outgoingLight *= 1.0 - dotMask * 0.38 * uHalftone;
}
`;

export interface ToonOpts {
  shine?: number;
  metal?: number;
  halftone?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
}

export type ToonUniforms = { uShine: { value: number }; uMetal: { value: number }; uHalftone: { value: number } };

export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  const u: ToonUniforms = { uShine: { value: o.shine ?? 0 }, uMetal: { value: o.metal ?? 0 }, uHalftone: { value: o.halftone ?? 1 } };
  m.userData.uniforms = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}`)
      .replace('#include <opaque_fragment>', `${COMIC}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'comic-toon';
  return m;
}

/** Tinted, streaky cartoon glass. Unlit and translucent so the cabin shows through. */
export function glass(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTint: { value: new THREE.Color(0x29285c) },
      uStreak: { value: new THREE.Color(0xc3b8ff) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform vec3 uStreak;
      varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float fres = 1.0 - abs(dot(normalize(vN), V));
        // Streaks are pinned to the glass but slide with the camera's orbit angle,
        // like a reflection. The azimuth term wraps seamlessly (2 whole cycles per turn).
        float az = atan(cameraPosition.x, cameraPosition.z);
        float el = cameraPosition.y / max(length(cameraPosition), 0.001);
        float s = fract((vW.x * 0.25 + vW.y * 1.15 - vW.z * 0.7) * 1.5 + az * 0.3183 + el * 0.8);
        float streak = step(s, 0.09) + step(0.15, s) * step(s, 0.19);
        vec3 col = mix(uTint, uStreak, clamp(streak * 0.6 + fres * 0.3, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(0.58 + fres * 0.3 + streak * 0.2, 0.0, 0.95));
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- ink outlines ----------

function hullMaterial(thickness: number, color: THREE.ColorRepresentation = INK): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        // Scale by depth so the line keeps a roughly constant pixel width.
        mv.xyz += n * uThickness * max(-mv.z, 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}

const HULLS = { body: hullMaterial(0.0034), thin: hullMaterial(0.002) };
export type InkWeight = keyof typeof HULLS;

/** Highlight outlines: the selected part gets a thick cyan ink line, hover a thinner one. */
export const HIGHLIGHT = { hover: hullMaterial(0.0045, 0x6ee7ff), selected: hullMaterial(0.0065, 0x6ee7ff) };

export function setHighlight(mesh: THREE.Mesh, level: 'none' | 'hover' | 'selected'): void {
  const hull = mesh.children.find((c) => c.userData.ink) as THREE.Mesh | undefined;
  if (!hull) return;
  hull.userData.base ??= hull.material;
  hull.material = level === 'none' ? hull.userData.base : HIGHLIGHT[level];
}

const smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let s = smoothCache.get(g);
  if (!s) {
    const c = new THREE.BufferGeometry();
    c.setAttribute('position', g.getAttribute('position').clone());
    if (g.index) c.setIndex(g.index.clone());
    s = mergeVertices(c, 1e-4);
    s.computeVertexNormals();
    smoothCache.set(g, s);
  }
  return s;
}

/** Adds an ink silhouette around a mesh. The hull follows the mesh's transforms. */
export function outline(mesh: THREE.Mesh, weight: InkWeight = 'body'): void {
  const hull = new THREE.Mesh(smoothNormals(mesh.geometry), HULLS[weight]);
  hull.raycast = () => {};
  hull.userData.ink = true;
  mesh.add(hull);
}

/** Every live LineMaterial, so the scene can keep their resolution in sync. */
export const lineMaterials = new Set<LineMaterial>();

export function inkLine(points: THREE.Vector3[], width = 2, color: THREE.ColorRepresentation = INK): Line2 {
  const g = new LineGeometry();
  g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, worldUnits: false });
  m.resolution.set(window.innerWidth, window.innerHeight);
  lineMaterials.add(m);
  const line = new Line2(g, m);
  line.computeLineDistances();
  line.raycast = () => {};
  return line;
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o.userData.ink) {
      (o as THREE.Mesh).geometry.dispose(); // hull materials are shared; keep them
      return;
    }
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      if (m instanceof LineMaterial) lineMaterials.delete(m);
      m.dispose();
    }
  });
}
