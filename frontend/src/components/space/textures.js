import * as THREE from 'three';

// Procedural planet textures drawn on a canvas, so no image files are needed.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function ellipseWrapped(g, x, y, rx, ry, angle, width) {
  for (const dx of [-width, 0, width]) {
    g.beginPath();
    g.ellipse(x + dx, y, rx, ry, angle, 0, Math.PI * 2);
    g.fill();
  }
}

function planetTexture({ base, spots, count, seed, caps, clouds = 0 }) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const random = seeded(seed);

  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < count; i++) {
    g.globalAlpha = 0.45 + random() * 0.55;
    g.fillStyle = spots[Math.floor(random() * spots.length)];
    const rx = 18 + random() * 90;
    ellipseWrapped(g, random() * w, 50 + random() * (h - 100), rx, rx * (0.3 + random() * 0.5), random() * Math.PI, w);
  }

  if (caps) {
    g.globalAlpha = 0.9;
    g.fillStyle = caps;
    g.fillRect(0, 0, w, 26);
    g.fillRect(0, h - 26, w, 26);
  }

  g.fillStyle = '#ffffff';
  for (let i = 0; i < clouds; i++) {
    g.globalAlpha = 0.18 + random() * 0.25;
    const rx = 40 + random() * 140;
    ellipseWrapped(g, random() * w, 30 + random() * (h - 60), rx, 6 + random() * 14, random() * 0.4 - 0.2, w);
  }
  g.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function bandedTexture({ base, bands, seed }) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const random = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h) {
    const band = 8 + random() * 34;
    g.globalAlpha = 0.35 + random() * 0.5;
    g.fillStyle = bands[Math.floor(random() * bands.length)];
    g.fillRect(0, y, w, band);
    y += band;
  }
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radialTexture(stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  return radialTexture([
    [0, 'rgba(255,240,200,1)'],
    [0.2, 'rgba(255,200,110,0.7)'],
    [0.5, 'rgba(255,150,60,0.18)'],
    [1, 'rgba(255,120,40,0)'],
  ]);
}

let cache = null;

/** Textures are created once and shared across scenes. */
export function getTextures() {
  if (!cache) {
    cache = {
      Mercury: planetTexture({ base: '#8f979e', spots: ['#6f767c', '#b5bcc2', '#7d858b'], count: 90, seed: 11 }),
      Venus: bandedTexture({ base: '#d9ad72', bands: ['#e8c48f', '#c99a5e', '#f0d5a8'], seed: 13 }),
      Earth: planetTexture({
        base: '#1d4f9c',
        spots: ['#2f7d4a', '#3f8f45', '#b9a46a', '#2a6e3f'],
        count: 70,
        seed: 7,
        caps: '#e8f2ff',
        clouds: 45,
      }),
      Mars: planetTexture({
        base: '#b4532c',
        spots: ['#8a3a1c', '#cf7748', '#6b2a14', '#a24a25'],
        count: 90,
        seed: 21,
        caps: '#f2e9e2',
      }),
      Jupiter: bandedTexture({ base: '#c9a27a', bands: ['#e3c9a4', '#a87a52', '#f1e2c8', '#8f5f3c'], seed: 17 }),
      Saturn: bandedTexture({ base: '#d8c395', bands: ['#e9dbb6', '#bfa874', '#f3ead0'], seed: 19 }),
      Uranus: bandedTexture({ base: '#8ce7ed', bands: ['#a6eef2', '#7fd6dd'], seed: 23 }),
      Neptune: bandedTexture({ base: '#4a78d0', bands: ['#5d8be0', '#3b63b5', '#7aa2ea'], seed: 29 }),
      Moon: planetTexture({ base: '#9c9c9c', spots: ['#7d7d7d', '#b3b3b3', '#6c6c6c'], count: 80, seed: 3 }),
      glow: glowTexture(),
      blackHoleGlow: radialTexture([
        [0, 'rgba(160,90,255,0.9)'],
        [0.25, 'rgba(120,50,230,0.45)'],
        [0.6, 'rgba(80,30,180,0.12)'],
        [1, 'rgba(60,20,150,0)'],
      ]),
    };
  }
  return cache;
}
