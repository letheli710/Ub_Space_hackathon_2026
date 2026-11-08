import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural asteroid: no image textures. A noisy, cratered, elongated rock with
// glowing ice-blue cracks at one end and violet veins at the other.

// ---------- small deterministic 3D value noise ----------
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function noise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
function fbm(x, y, z, octaves = 6) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency, z * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

const STRETCH = new THREE.Vector3(1.65, 0.95, 1.05); // long axis along X
const BLUE = new THREE.Color('#2fb8ff');
const VIOLET = new THREE.Color('#a64dff');
const ROCK_DARK = new THREE.Color('#1b2130');
const ROCK_LIGHT = new THREE.Color('#7b8296');

function buildGeometry(seed = 7) {
  let geometry = new THREE.IcosahedronGeometry(1, 6);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);

  // Craters: random directions with a bowl and a slightly raised rim.
  const craters = [];
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 16; i++) {
    craters.push({
      dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
      size: 0.12 + rand() * 0.3,
    });
  }

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const dirs = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();
    // Lumpy overall shape plus finer rubble.
    const signed = (f, o) => (fbm(p.x * f + o, p.y * f, p.z * f, 4) - 0.5) * 2;
    let radius = 1 + 0.42 * signed(1.1, 5) + 0.14 * signed(3.2, 9) + 0.05 * signed(9, 13);
    let craterDepth = 0;
    for (const crater of craters) {
      const r = p.angleTo(crater.dir) / crater.size;
      if (r < 1) craterDepth += (1 - r * r) * 0.55 * crater.size;
      else if (r < 1.35) radius += Math.sin(((r - 1) / 0.35) * Math.PI) * 0.12 * crater.size;
    }
    radius -= craterDepth;

    // Rock color: lighter ridges, darker crater floors.
    const tone = 0.6 * fbm(p.x * 7 + 11, p.y * 7, p.z * 7, 4) + 0.4 * fbm(p.x * 22, p.y * 22, p.z * 22, 3);
    color.copy(ROCK_DARK).lerp(ROCK_LIGHT, THREE.MathUtils.clamp((tone - 0.35) * 2.2 - craterDepth * 4, 0, 1));

    // Each end of the rock picks up a faint tint from its glow.
    const blueEnd = THREE.MathUtils.smoothstep(-p.x, -0.15, 0.7);
    const violetEnd = THREE.MathUtils.smoothstep(p.x, -0.05, 0.75);
    color.lerp(BLUE, blueEnd * 0.07).lerp(VIOLET, violetEnd * 0.07);
    dirs.set([p.x, p.y, p.z], i * 3);

    p.multiplyScalar(radius).multiply(STRETCH);
    position.setXYZ(i, p.x, p.y, p.z);
    colors.set([color.r, color.g, color.b], i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const GLSL_NOISE = /* glsl */ `
  float aHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float aNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(aHash(i), aHash(i + vec3(1, 0, 0)), f.x), mix(aHash(i + vec3(0, 1, 0)), aHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(aHash(i + vec3(0, 0, 1)), aHash(i + vec3(1, 0, 1)), f.x), mix(aHash(i + vec3(0, 1, 1)), aHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float aFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * aNoise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
  float ridge(vec3 p) {
    return 1.0 - abs(aFbm(p) * 2.0 - 1.0);
  }
`;

function rockMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.05,
  });
  // Per-pixel rock grain and glowing cracks (blue at one end, violet at the other).
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aDir;\nvarying vec3 vDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = aDir;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDir;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 0.65 + 0.7 * aFbm(vDir * 14.0) * aFbm(vDir * 40.0 + 5.0) * 2.0;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float crack = smoothstep(0.955, 0.99, ridge(vDir * 2.6 + vec3(0.0, 7.0, 0.0)));
        float fine = smoothstep(0.97, 0.995, ridge(vDir * 7.0 + 3.0));
        float blueEnd = smoothstep(0.2, 0.85, -vDir.x);
        float violetEnd = smoothstep(0.25, 0.85, vDir.x);
        totalEmissiveRadiance += vec3(0.18, 0.72, 1.0) * (crack * 2.4 + fine * 1.3) * blueEnd;
        totalEmissiveRadiance += vec3(0.65, 0.3, 1.0) * (crack * 2.0 + fine * 1.1) * violetEnd;`,
      );
  };
  return material;
}

function rimMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying float vSide;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        vSide = position.x;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying float vSide;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormalView, vViewDir)), 2.5);
        vec3 color = mix(vec3(0.18, 0.72, 1.0), vec3(0.65, 0.3, 1.0), smoothstep(-1.2, 1.2, vSide));
        gl_FragColor = vec4(color * rim * 0.9, rim);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

let shared = null;
function getShared() {
  if (!shared) shared = { geometry: buildGeometry(), rock: rockMaterial(), rim: rimMaterial() };
  return shared;
}

/** The asteroid model, about 2.8 units long at size 1. */
export default function Asteroid({ size = 1 }) {
  const { geometry, rock, rim } = useMemo(getShared, []);
  return (
    <group scale={size}>
      <mesh geometry={geometry} material={rock} />
      <mesh geometry={geometry} material={rim} scale={1.04} />
    </group>
  );
}
