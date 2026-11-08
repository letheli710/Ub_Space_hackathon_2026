import * as THREE from 'three';

// Shared materials and procedural (canvas-drawn) textures for the modular station ship.

function solarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#16264f';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#4a6fc0';
  g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  g.strokeStyle = '#b8c4d8';
  g.lineWidth = 3;
  g.strokeRect(1, 1, 254, 254);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function panelTexture() {
  // Light hull plating with panel seams and a few darker plates.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d6d9de';
  g.fillRect(0, 0, 256, 256);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 14; i++) {
    g.fillStyle = random() > 0.5 ? '#c3c7cd' : '#e4e6ea';
    g.fillRect(Math.floor(random() * 8) * 32, Math.floor(random() * 8) * 32, 32 * (1 + Math.floor(random() * 2)), 32);
  }
  g.strokeStyle = '#9da3ab';
  g.lineWidth = 1.5;
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

let cache = null;

export function materials() {
  if (!cache) {
    cache = {
      hull: new THREE.MeshStandardMaterial({ color: '#e3e5e9', metalness: 0.35, roughness: 0.5 }),
      plating: new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 0.3, roughness: 0.55 }),
      dark: new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.6, roughness: 0.45 }),
      truss: new THREE.MeshStandardMaterial({ color: '#b9bec6', metalness: 0.5, roughness: 0.4 }),
      gold: new THREE.MeshStandardMaterial({ color: '#c99a3c', metalness: 0.9, roughness: 0.3, emissive: '#3a2600', emissiveIntensity: 0.3 }),
      solar: new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: 0.4, roughness: 0.3, emissive: '#0b1f5a', emissiveIntensity: 0.25 }),
      solarDead: new THREE.MeshStandardMaterial({ map: solarTexture(), color: '#7a6878', metalness: 0.3, roughness: 0.6 }),
      radiator: new THREE.MeshStandardMaterial({ color: '#f2f3f5', metalness: 0.1, roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0d2238', metalness: 0.9, roughness: 0.1, emissive: '#0a3a66', emissiveIntensity: 0.5 }),
      window: new THREE.MeshBasicMaterial({ color: '#ffd38a' }),
      glow: new THREE.MeshBasicMaterial({ color: '#46c8ff' }),
      engineGlow: new THREE.MeshBasicMaterial({
        color: '#7fd6ff',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
  }
  return cache;
}
