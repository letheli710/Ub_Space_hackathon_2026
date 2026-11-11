// PROTOTYPE — Variant N: Ink Cosmos · 水墨太空.
// The solar system as a shan-shui ink painting on xuan paper: space is the empty paper (留白), nebulae
// are ink washes, gas giants drift like misty mountains, the Sun is a vermilion seal-red disc. The real
// StationShip is re-skinned with ink-wash shaders + an inverted-hull brush outline. Hazards are painted
// in ink (vortex blot, flicked meteor strokes, vermilion storm wash) and the ship swerves leaving a
// calligraphic stroke ribbon.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../components/station/StationShip.jsx';
import { FEATURES, INNER, LEAD, OUTER, TABS, TAGLINE, logo } from './mock.jsx';
import './variantN.css';

const CN = {
  'Asteroid Collision': '陨石撞击',
  'Black Hole Encounter': '黑洞遭遇',
  'Solar Storm': '太阳风暴',
  'Alien Encounter': '异星接触',
  'Oxygen Leak': '氧气泄漏',
  'Spacecraft Fire': '舱内火灾',
  'AI System Malfunction': '智能失灵',
  'Robotic Arm Malfunction': '机械臂故障',
  'Engine Failure': '引擎失效',
  'Thruster Failure': '推进器失效',
  'Solar Panel Power Crisis': '光能危机',
};
const TAB_CN = { Home: '首页', Spacecraft: '飞船', Generator: '生成器', 'Planetary Trajectories': '行星轨道', 'AI Logs': '智能日志', 'AI API': '智能接口' };
const SYS_CN = { Structure: '船体', Solar: '光翼', Fuel: '推进剂', Power: '储能', Drive: '推进', Energy: '能源' };
const NUM_CN = ['一', '二', '三', '四'];
const KIND = { 'Black Hole Encounter': 'hole', 'Asteroid Collision': 'meteor', 'Solar Storm': 'storm', 'Alien Encounter': 'alien' };
const FIRE = new Set(['Spacecraft Fire', 'Solar Storm', 'Engine Failure', 'Solar Panel Power Crisis']);
const DODGE = { hole: -1.25, meteor: -0.85, storm: -0.7, alien: 0.95, inner: 0 };
const DEMO = ['Black Hole Encounter', 'Asteroid Collision', 'Solar Storm', 'Spacecraft Fire', 'Alien Encounter'];

const PAGE = {
  home: { x: 2.0, y: -0.35, scale: 0.17 },
  console: { x: 0.2, y: 0.05, scale: 0.15 },
};
const SCROLL = 0.9; // world drift speed (units/s) — the paper slides left, the ship "sails" right

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- GLSL ---------------------------- */

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
const vec3 PAPER = vec3(0.945,0.914,0.846);
const vec3 INK = vec3(0.085,0.08,0.075);
const vec3 RED = vec3(0.74,0.17,0.10);
`;

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const BG_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime, uAspect, uHole, uStorm, uMeteor, uAlien, uSplash, uSplashR, uFire;
uniform vec2 uHoleP, uSplashP, uSunP, uAlienP;
${NOISE}
vec3 col;
void paint(vec3 c, float a){ col = mix(col, c, clamp(a, 0., 1.)); }

void main(){
  float t = uTime;
  vec2 p0 = vUv*2.-1.; p0.x *= uAspect;
  vec2 p = p0;

  // black-hole drag: the painting itself is swirled toward the vortex
  vec2 hq = p0 - uHoleP; float hr = length(hq);
  if(uHole > 0.001){ p = uHoleP + rot(uHole*2.2*exp(-hr*2.4))*hq; }

  // ---- xuan paper: warm tone, cloudy pulp, fibres
  vec2 pu = vUv*vec2(uAspect,1.);
  col = PAPER * (0.955 + 0.07*fbm(pu*3.2));
  float fm = smoothstep(0.55, 0.8, noise(pu*7.));
  float fa = 1.-smoothstep(0., 0.035, abs(noise(rot(0.6)*pu*vec2(26.,3.5))-0.5));
  float fb = 1.-smoothstep(0., 0.035, abs(noise(rot(-0.9)*pu*vec2(22.,3.))-0.5));
  col -= (fa+fb)*fm*0.035;

  // ---- ink-wash nebulae (domain-warped, drifting)
  vec2 q = p*0.85 + vec2(t*0.012, 0.);
  vec2 w = vec2(fbm(q+vec2(1.7,9.2)), fbm(q+vec2(8.3,2.8)));
  float n = fbm(q*1.3 + w*1.8);
  paint(INK, smoothstep(0.5, 0.86, n)*0.17);
  paint(INK, smoothstep(0.5,0.53,n)*(1.-smoothstep(0.53,0.6,n))*0.07);   // bled tide-line

  // ---- dry-brush stars (two parallax layers)
  for(int k=0;k<2;k++){
    float sc = k==0 ? 34. : 80.;
    vec2 sp = (p + vec2(t*(0.008+0.012*float(k)), 0.))*sc;
    vec2 id = floor(sp), fp = fract(sp)-0.5;
    float h = hash(id+float(k)*17.);
    if(h > 0.88){
      vec2 off = vec2(hash(id+3.1), hash(id+7.7))-0.5;
      float r = 0.07 + 0.12*hash(id+1.3);
      float a = 1.-smoothstep(r*0.45, r, length(fp-off*0.6));
      paint(INK, a*(0.35+0.5*noise(sp*5.))*(k==0 ? 0.75 : 0.5));
    }
  }

  // ---- orbits: single brush lines that swell and thin, with dry gaps; planets as ink dots
  vec2 so = rot(-0.22)*(p - uSunP); so.y *= 2.5;
  float rr = length(so);
  for(int i=0;i<4;i++){
    float fi = float(i);
    float R = 0.42 + fi*0.38 + fi*fi*0.16;
    float ang = atan(so.y, so.x);
    float wdt = 0.0022 + 0.0045*pow(0.5+0.5*sin(ang + fi*1.7 + 0.6), 2.);
    float dry = smoothstep(0.22, 0.55, noise(so*38. + fi*9.));
    paint(INK, (1.-smoothstep(wdt*0.35, wdt, abs(rr-R)))*0.5*dry);
    float pa = t*0.06/(1.+fi) + fi*2.1 + 0.8;
    vec2 e = uSunP + rot(0.22)*vec2(cos(pa)*R, sin(pa)*R/2.5);
    float pr = 0.018 + 0.012*fi;
    float pd = length(p-e) + (noise((p-e)*70.)-0.5)*0.006;
    float pin = 1.-smoothstep(pr-0.003, pr+0.003, pd);
    paint(i==2 ? mix(INK,RED,0.6) : INK, pin*(0.45 + 0.35*smoothstep(pr*0.4, pr, pd)));
  }

  // ---- gas giant drifting like a mountain in mist (with a ring)
  vec2 G = vec2(-uAspect*0.58 + sin(t*0.03)*0.04, -0.66);
  vec2 g = p - G; float gr = length(g);
  float gd = gr - 0.6 + (fbm(g*4.+t*0.03)-0.5)*0.05;
  float gin = 1.-smoothstep(-0.01, 0.01, gd);
  float bands = fbm(vec2(g.x*1.4 + t*0.02, g.y*9.));
  float lit = dot(g/(gr+1e-4), normalize(uSunP-G));
  float mist = smoothstep(-1.0, -0.42, p.y);
  float dens = 0.1 + 0.22*bands + 0.22*(0.5-0.5*lit)*smoothstep(0.1,0.6,gr);
  vec2 rg = rot(-0.2)*g; float rgy = rg.y; rg.y *= 4.2;
  float rd = abs(length(rg)-0.95);
  float rw = 0.008 + 0.012*(0.5+0.5*sin(atan(rg.y,rg.x)*1.+1.));
  float ring = (1.-smoothstep(rw*0.4, rw, rd))*smoothstep(0.2,0.5,noise(rg*20.));
  paint(INK, ring*0.45*mist*(1.-gin));                 // ring behind
  paint(INK, gin*dens*mist);
  paint(INK, gin*(1.-smoothstep(0.,0.05,-gd))*0.22*mist);
  paint(INK, ring*0.55*mist*gin*step(rgy, 0.));        // ring in front

  // ---- distant dust ridges, shan-shui style (cun texture, bases dissolve into mist)
  for(int k=0;k<2;k++){
    float fk = float(k);
    float xx = p.x*(0.8+fk*0.55) + t*(0.02+fk*0.035) + fk*13.;
    float h = -0.58 - fk*0.16 + 0.34*fbm(vec2(xx*1.15, fk*5.)) - 0.12;
    float dy = h - p.y;
    float body = smoothstep(0., 0.012, dy);
    float fade = 1.-smoothstep(0., 0.22+0.1*fk, dy);
    float cun = 0.55 + 0.45*noise(vec2(xx*28., p.y*5.));
    paint(INK, body*fade*cun*(0.2 + 0.16*fk));
  }

  // ---- the Sun: a single vermilion seal-red disc
  vec2 sv = p - uSunP;
  float sd = length(sv) + (noise(sv*30.)-0.5)*0.007;
  float SR = 0.15;
  float sunA = 1.-smoothstep(SR-0.003, SR+0.003, sd);
  paint(RED, (1.-smoothstep(SR, SR+0.22+uStorm*0.7, sd))*(0.05+uStorm*0.28)*(1.-sunA));
  paint(RED, sunA*(0.8+0.2*fbm(sv*12.)));

  // ---- solar storm: vermilion wash flooding across the paper
  if(uStorm > 0.001){
    vec2 dir = normalize(vec2(-1.,-0.5));
    float al = dot(sv, dir), pe = dot(sv, vec2(-dir.y, dir.x));
    float sn = fbm(vec2(al*2.-t*0.6, pe*3.));
    float band = 1.-smoothstep(0.2, 0.75+sn*0.5, abs(pe));
    float reach = 1.-smoothstep(uStorm*3.4-0.4, uStorm*3.4, al + (sn-0.5)*0.7);
    float fl = band*reach*step(-0.15, al);
    paint(RED, fl*(0.18+0.32*sn)*uStorm);
    paint(RED, smoothstep(0.62,0.82, noise(vec2(al*3.-t*2.2, pe*36.)))*fl*0.35*uStorm);
  }

  // ---- black hole: a spreading, swirling ink blot
  if(uHole > 0.001){
    float R0 = 0.8*uHole;
    vec2 rq = rot(3.2/(hr*5.+0.35) - t*0.7)*hq;
    float an = fbm(rq*3.2 + vec2(0., t*0.08));
    float fall = 1.-smoothstep(R0*0.3, R0, hr);
    paint(INK, smoothstep(0.42, 0.72, an)*fall*0.8*uHole);
    float ha = atan(hq.y, hq.x);
    float spiral = sin(ha*2. + 10.*log(hr+0.04) + t*2.4);
    paint(INK, smoothstep(0.86,1.,spiral)*fall*smoothstep(0.3,0.6,noise(hq*40.))*0.6*uHole);
    paint(INK, exp(-abs(hr-R0*0.5)*22.)*0.18*uHole);
    float cd = hr - 0.12*uHole - (fbm(hq*9.+t*0.3)-0.5)*0.05;
    paint(INK, 1.-smoothstep(-0.006, 0.012, cd));
  }

  // ---- alien encounter: ripples of ink rings + a red eye
  if(uAlien > 0.001){
    vec2 aq = p0 - uAlienP; float ar = length(aq);
    for(int i=0;i<4;i++){
      float ph = fract(t*0.28 + float(i)*0.25);
      float Rr = ph*0.95;
      float wr = 0.004 + 0.01*(1.-ph);
      float dry = smoothstep(0.25,0.55,noise(aq*30.+float(i)*4.));
      paint(INK, (1.-smoothstep(wr*0.4, wr, abs(ar-Rr)))*(1.-ph)*dry*0.8*uAlien);
    }
    paint(RED, (1.-smoothstep(0.03,0.04,ar+(noise(aq*50.)-0.5)*0.01))*uAlien);
  }

  // ---- meteors: flicked ink strokes with a heavy head and dry-brush tail
  if(uMeteor > 0.001){
    vec2 dir = normalize(vec2(-1., -0.42));
    float travel = (2.*uAspect + 1.6)/0.92;
    for(int i=0;i<6;i++){
      float fi = float(i);
      float per = 2.0 + hash(vec2(fi,1.))*1.6;
      float ph = fract(t/per + hash(vec2(fi,2.)));
      vec2 head = vec2(uAspect+0.7, -0.1 + hash(vec2(fi,3.))*1.5) + dir*ph*travel;
      float L = 0.45 + hash(vec2(fi,4.))*0.55;
      vec2 tail = head - dir*L;
      vec2 pa = p0 - tail, ba = head - tail;
      float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.);
      float d = length(pa - ba*h);
      float wdt = mix(0.0012, 0.017, h*h);
      float dry = smoothstep(0.3, 0.6, noise(vec2(h*36.+fi*7., d*260.)));
      float a = (1.-smoothstep(wdt*0.45, wdt, d))*mix(dry, 1., h*h);
      vec2 hd = p0-head;
      a = max(a, 1.-smoothstep(0.016, 0.026, length(hd) + (noise(hd*60.)-0.5)*0.012));
      paint(INK, a*uMeteor*0.92);
    }
  }

  // ---- emergency ink splash near the ship (vermilion for fire)
  if(uSplash > 0.001){
    vec2 s = p0 - uSplashP; float r = length(s);
    vec2 dn = s/(r+1e-4);
    float spikes = pow(noise(dn*2.6+7.), 2.)*1.1 + 0.35*noise(dn*9.+3.);
    float R = uSplashR*(0.5 + spikes);
    float blot = 1.-smoothstep(R-0.012, R+0.012, r + (fbm(s*14.)-0.5)*0.06);
    float hollow = smoothstep(uSplashR*0.25, uSplashR*0.7, r);
    vec2 cs = s*16.; vec2 cid = floor(cs); vec2 cf = fract(cs)-0.5;
    float ch = hash(cid+11.);
    vec2 co = vec2(hash(cid+2.), hash(cid+5.))-0.5;
    float drop = step(0.8, ch)*step(R*0.85, r)*step(r, uSplashR*2.4)
               *(1.-smoothstep(0.08+0.14*ch, 0.14+0.14*ch, length(cf-co*0.5)));
    vec3 c = mix(INK, RED, uFire);
    paint(c, (blot*hollow*0.8 + drop*0.9)*uSplash);
  }

  // ---- aged edges
  vec2 vq = (vUv-0.5)*vec2(1.,0.9);
  col *= 1. - 0.16*smoothstep(0.35, 0.85, length(vq)*1.4);
  gl_FragColor = vec4(col, 1.);
}`;

const SHIP_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
void main(){
  vUv2 = uv;
  vec4 lp = vec4(position, 1.);
  vec3 nn = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp; nn = mat3(instanceMatrix) * nn;
  #endif
  vec4 mv = modelViewMatrix * lp;
  vN = normalize(normalMatrix * nn); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const SHIP_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
uniform float uTone, uUseMap, uFlash, uAlpha, uRed;
uniform sampler2D uMap;
${NOISE}
void main(){
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV);
  float ndl = dot(n, normalize(vec3(0.5, 0.75, 0.55)));
  float shade = smoothstep(0.35, -0.65, ndl);
  float tone = uTone + shade*0.5 + pow(1.-abs(dot(n,v)), 2.5)*0.4;
  if(uUseMap > 0.5){ vec3 m = texture2D(uMap, vUv2).rgb; tone += (0.6 - dot(m, vec3(.3,.59,.11)))*0.35; }
  vec2 fc = gl_FragCoord.xy;
  tone += ((noise(fc*0.45)*0.6 + noise(fc*0.07)*0.4) - 0.5)*0.24;
  tone = clamp(tone, 0., 1.);
  tone = mix(tone, floor(tone*3.+0.5)/3., 0.45);       // soft wash levels
  vec3 c = mix(PAPER, INK, tone);
  c = mix(c, RED, clamp(uRed + uFlash*(0.25+0.4*shade), 0., 0.9));
  gl_FragColor = vec4(c, uAlpha);
}`;

const HULL_VERT = /* glsl */ `
uniform float uW, uTime;
void main(){
  vec4 lp = vec4(position, 1.);
  vec3 nn = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp; nn = mat3(instanceMatrix) * nn;
  #endif
  vec4 mv = modelViewMatrix * lp;
  vec3 n = normalize(normalMatrix * nn);
  float s = floor(uTime*6.);                                  // hand-drawn "boil" at 6 fps
  float wob = 0.6 + 0.45*sin(position.x*0.9 + s*1.7) * sin(position.z*0.7 - s*1.3) + 0.3*sin(position.y*1.3 + s);
  mv.xyz += n * uW * max(wob, 0.15);
  gl_Position = projectionMatrix * mv;
}`;
const HULL_FRAG = /* glsl */ `
precision highp float;
${NOISE}
void main(){
  float gap = noise(gl_FragCoord.xy*0.12);
  if(gap > 0.82) discard;
  gl_FragColor = vec4(INK, 1.);
}`;

const TRAIL_VERT = /* glsl */ `
attribute float aAmp;
varying vec2 vUv; varying float vA;
void main(){ vUv = uv; vA = aAmp; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const TRAIL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; varying float vA;
${NOISE}
void main(){
  float across = abs(vUv.y-0.5)*2.;
  float bristle = noise(vec2(vUv.x*5., vUv.y*30.));
  float dry = smoothstep(0.15+vUv.x*0.55, 0.6+vUv.x*0.3, bristle + (1.-across)*0.25);
  float edge = 1.-smoothstep(0.7, 1., across);
  float a = edge*mix(1., dry, smoothstep(0., 0.45, vUv.x))*vA*(1.-vUv.x*0.55);
  gl_FragColor = vec4(INK, a*0.92);
}`;

/* ---------------------------------------------------------------- ink re-skin -------------------- */

const lum = (c) => (c ? 0.3 * c.r + 0.59 * c.g + 0.11 * c.b : 0.7);

function makeInk(m, glow, shared) {
  const uniforms = {
    uTone: { value: 0.1 },
    uUseMap: { value: 0 },
    uMap: { value: null },
    uAlpha: { value: 1 },
    uRed: { value: 0 },
    uFlash: shared.uFlash,
  };
  if (glow) {
    uniforms.uTone.value = 0.15;
    uniforms.uRed.value = 0.75;
    uniforms.uAlpha.value = 0.5;
  } else {
    const basic = m.isMeshBasicMaterial;
    uniforms.uTone.value = basic ? 0.78 : 0.04 + (1 - lum(m.color)) * 0.55;
    if (m.map) {
      uniforms.uMap.value = m.map;
      uniforms.uUseMap.value = 1;
    }
    if (m.emissive && m.emissive.r > m.emissive.b * 2 && (m.emissiveIntensity ?? 0) > 0.2) uniforms.uRed.value = 0.15;
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHIP_VERT,
    fragmentShader: SHIP_FRAG,
    side: m.side ?? THREE.FrontSide,
    transparent: glow,
    depthWrite: !glow,
  });
  mat.userData.vnInk = true;
  return mat;
}

function inkify(root, cache, shared) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.vnHull) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.userData?.vnInk) return;
    const glow = m.blending === THREE.AdditiveBlending || m.isShaderMaterial || (m.transparent && m.opacity < 0.95);
    let ink = cache.get(m.uuid);
    if (!ink) {
      ink = makeInk(m, glow, shared);
      cache.set(m.uuid, ink);
    }
    o.material = ink;
    if (!glow && !o.userData.vnHasHull && o.geometry?.attributes?.normal) {
      const hull = o.isInstancedMesh
        ? new THREE.InstancedMesh(o.geometry, shared.hull, o.count)
        : new THREE.Mesh(o.geometry, shared.hull);
      if (o.isInstancedMesh) hull.instanceMatrix = o.instanceMatrix;
      hull.userData.vnHull = true;
      hull.raycast = () => {};
      hull.frustumCulled = false;
      o.userData.vnHasHull = true;
      o.add(hull);
    }
  });
}

/* ---------------------------------------------------------------- scene -------------------------- */

const TRAIL_N = 120;

function Trail({ headRef }) {
  const { geo, pts } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_N * 2 * 3);
    const uv = new Float32Array(TRAIL_N * 2 * 2);
    const amp = new Float32Array(TRAIL_N * 2);
    const idx = [];
    for (let i = 0; i < TRAIL_N; i++) {
      const s = i / (TRAIL_N - 1);
      uv.set([s, 0, s, 1], i * 4);
      if (i < TRAIL_N - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aAmp', new THREE.BufferAttribute(amp, 1));
    g.setIndex(idx);
    const p = Array.from({ length: TRAIL_N }, () => ({ x: 0, y: 0, a: 0 }));
    return { geo: g, pts: p };
  }, []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    [],
  );
  const acc = useRef(0);
  const init = useRef(false);

  useFrame((_, dt) => {
    const h = headRef.current;
    if (!init.current) {
      pts.forEach((p, i) => Object.assign(p, { x: h.x - i * 0.03, y: h.y, a: 0 }));
      init.current = true;
    }
    for (const p of pts) p.x -= SCROLL * dt;
    acc.current += dt;
    if (acc.current > 1 / 30) {
      acc.current = 0;
      const last = pts.pop();
      pts.unshift(last);
    }
    Object.assign(pts[0], { x: h.x, y: h.y, a: h.amp });
    const pos = geo.attributes.position.array;
    const amp = geo.attributes.aAmp.array;
    for (let i = 0; i < TRAIL_N; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(TRAIL_N - 1, i + 1)];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const s = i / (TRAIL_N - 1);
      const w = 0.16 * pts[i].a * Math.pow(1 - s, 1.2) * sstep(0, 0.05, s) + 0.004;
      pos.set([pts[i].x - dy * w, pts[i].y + dx * w, -0.4, pts[i].x + dy * w, pts[i].y - dx * w, -0.4], i * 6);
      amp[i * 2] = amp[i * 2 + 1] = Math.min(1, pts[i].a * 1.4);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAmp.needsUpdate = true;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={1} />;
}

function World({ event, page }) {
  const { camera, size } = useThree();
  const shared = useMemo(
    () => ({
      uFlash: { value: 0 },
      hull: new THREE.ShaderMaterial({
        uniforms: { uW: { value: 0.022 }, uTime: { value: 0 } },
        vertexShader: HULL_VERT,
        fragmentShader: HULL_FRAG,
        side: THREE.BackSide,
      }),
    }),
    [],
  );
  const cache = useMemo(() => new Map(), []);
  const bg = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uAspect: { value: 1 },
          uHole: { value: 0 }, uStorm: { value: 0 }, uMeteor: { value: 0 }, uAlien: { value: 0 },
          uSplash: { value: 0 }, uSplashR: { value: 0.2 }, uFire: { value: 0 },
          uHoleP: { value: new THREE.Vector2() }, uSplashP: { value: new THREE.Vector2() },
          uSunP: { value: new THREE.Vector2() }, uAlienP: { value: new THREE.Vector2() },
        },
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  const outer = useRef();
  const yawG = useRef();
  const rollG = useRef();
  const scaleG = useRef();
  const shipRoot = useRef();
  const head = useRef({ x: 0, y: 0, amp: 0 });
  const ev = useRef(null);
  const st = useRef({ y: 0, vy: 0, bx: PAGE[page].x, by: PAGE[page].y, sc: PAGE[page].scale, lv: { hole: 0, storm: 0, meteor: 0, alien: 0 }, inkT: 0, fire: 0 });
  const v3 = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    ev.current = event ? { name: event.name, start: null } : null;
  }, [event?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const toScreen = (x, y, out) => {
    v3.set(x, y, 0).project(camera);
    out.set(v3.x * (size.width / size.height), v3.y);
  };

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const s = st.current;
    const u = bg.uniforms;
    const aspect = size.width / size.height;
    const cfg = PAGE[page];
    const k = 1 - Math.exp(-dt * 2.5);
    s.bx += (cfg.x - s.bx) * k;
    s.by += (cfg.y - s.by) * k;
    s.sc += (cfg.scale - s.sc) * k;

    const e = ev.current;
    if (e && e.start === null) e.start = t;
    const age = e ? t - e.start : 99;
    const kind = e ? KIND[e.name] || 'inner' : null;
    const hz = e ? sstep(0, 1.2, age) * (1 - 0.65 * sstep(7, 11, age)) : 0;
    const env = e ? sstep(0.5, 1.5, age) * (1 - sstep(4.5, 7.5, age)) : 0;

    // hazard levels ease in and out
    for (const key of Object.keys(s.lv)) s.lv[key] += ((kind === key ? hz : 0) - s.lv[key]) * (1 - Math.exp(-dt * 3));
    s.fire += ((e && FIRE.has(e.name) ? 1 : 0) - s.fire) * (1 - Math.exp(-dt * 4));

    // emergency manoeuvre: damped spring toward a dodge offset, banking with vertical speed
    let target = (kind ? DODGE[kind] : 0) * env;
    if (kind === 'meteor') target += Math.sin(t * 5) * 0.18 * env;
    s.vy += ((target - s.y) * 11 - s.vy * 5.2) * dt;
    s.y += s.vy * dt;
    const bob = Math.sin(t * 0.6) * 0.08;
    const x = s.bx;
    const y = s.by + s.y + bob;
    const heading = Math.atan2(s.vy, SCROLL * 1.4) * 0.85;
    outer.current.position.set(x, y, 0);
    outer.current.rotation.z = heading;
    yawG.current.rotation.y = Math.PI / 2 - 0.5 + Math.sin(t * 0.25) * 0.12 + (kind === 'inner' ? Math.sin(t * 2.2) * 0.12 * env : 0);
    rollG.current.rotation.z = -s.vy * 0.55 + (kind === 'inner' ? Math.sin(t * 3.1) * 0.3 * env : 0);
    scaleG.current.scale.setScalar(s.sc);

    // trail head sits at the engines (behind the ship along its heading)
    const back = s.sc * 15;
    head.current.x = x - Math.cos(heading) * back;
    head.current.y = y - Math.sin(heading) * back;
    head.current.amp = 0.2 + Math.min(1, Math.abs(s.vy) * 0.9 + env * 0.5) * 0.8;

    // background uniforms
    u.uTime.value = t;
    u.uAspect.value = aspect;
    u.uHole.value = s.lv.hole;
    u.uStorm.value = s.lv.storm;
    u.uMeteor.value = s.lv.meteor;
    u.uAlien.value = s.lv.alien;
    u.uFire.value = s.fire;
    u.uSunP.value.set(aspect * 0.62, 0.6);
    toScreen(s.bx + 3.4 - Math.min(age, 20) * 0.45, s.by + 1.05, u.uHoleP.value);
    toScreen(s.bx + 1.7, s.by - 1.35, u.uAlienP.value);
    if (age < 0.35) toScreen(x + 0.5, y, u.uSplashP.value);
    u.uSplash.value = e ? sstep(0.25, 0.7, age) * (1 - sstep(2.6, 6.5, age)) : Math.max(0, u.uSplash.value - dt);
    u.uSplashR.value = 0.12 + 0.5 * (1 - Math.pow(1 - Math.min(1, Math.max(0, (age - 0.25) / 1.5)), 3));

    shared.hull.uniforms.uTime.value = t;
    shared.uFlash.value = s.fire * (0.55 + 0.45 * Math.sin(t * 7)) * (kind === 'storm' ? 0.5 : 1);

    s.inkT -= dt;
    if (s.inkT <= 0 && shipRoot.current) {
      s.inkT = 0.3;
      inkify(shipRoot.current, cache, shared);
    }
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-10} material={bg}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <Trail headRef={head} />
      <group ref={outer}>
        <group rotation={[0.34, 0, 0]}>
          <group ref={yawG}>
            <group ref={rollG}>
              <group ref={scaleG}>
                <group ref={shipRoot} position={[0, 0, 3.5]}>
                  <StationShip event={event} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

/* ---------------------------------------------------------------- overlay ------------------------ */

function Seal({ chars, className = '' }) {
  return (
    <div className={`vn-seal ${className}`} aria-hidden="true">
      {chars.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  );
}

function Filters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="vn-rough">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="5" />
      </filter>
      <filter id="vn-bleed">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" result="d" />
        <feGaussianBlur in="d" stdDeviation="0.6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="d" /></feMerge>
      </filter>
    </svg>
  );
}

function Nav({ tab, onTab, sim }) {
  return (
    <header className="vn-top">
      <div className="vn-brand">
        <img src={logo} alt="" />
        <span>Interstellar X<sup>4</sup></span>
        <em>{sim.met}</em>
      </div>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>
            <b>{TAB_CN[t]}</b>
            <span>{t}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

function Alarm({ event, page }) {
  if (!event) return null;
  return (
    <div key={event.name} className={`vn-alarm vn-alarm-${page}`} role="status">
      <div className="vn-alarm-cn">{CN[event.name] || event.name}</div>
      <Seal chars={['警']} className="vn-seal-alarm" />
      <div className="vn-alarm-en">{event.name}</div>
    </div>
  );
}

function Home({ sim, onTab, shown }) {
  return (
    <>
      <section className="vn-hero">
        <div className="vn-vt">
          星际<span className="vn-tcu">X⁴</span>
        </div>
        <div className="vn-vsub">
          <span>航天灾难模拟</span>
          <span className="vn-dim">以智御变 · 行于星海</span>
          <Seal chars={['星', '际']} />
        </div>
        <div className="vn-en">
          <h1>Interstellar X<sup>4</sup></h1>
          <p className="vn-tag">{TAGLINE}</p>
          <p className="vn-lead">{LEAD}</p>
          <button className="vn-cta" onClick={() => onTab('Generator')}>
            <span>Launch Simulation</span>
            <i>启航</i>
          </button>
        </div>
      </section>
      <ul className="vn-features">
        {FEATURES.map((f, i) => (
          <li key={f}><b>{NUM_CN[i]}</b>{f}</li>
        ))}
      </ul>
      <aside className="vn-colophon-home">
        <div className="vn-vcol">
          {shown ? `${CN[shown.name] || ''} · 应急演示` : '星海无波 · 一切如常'}
        </div>
        <div className="vn-vcol vn-dim">
          {sim.nav.origin} → {sim.nav.destination} · 第{sim.day}日
        </div>
      </aside>
    </>
  );
}

function Console({ sim }) {
  const active = sim.event?.name;
  const Item = ({ name }) => (
    <button className={active === name ? 'on' : ''} onClick={() => sim.trigger(name)}>
      <b>{CN[name]}</b>
      <span>{name}</span>
    </button>
  );
  return (
    <>
      <section className="vn-inject">
        <h3><b>天外之患</b><span>Outer hazards</span></h3>
        <div className="vn-list">{OUTER.map((n) => <Item key={n} name={n} />)}</div>
        <h3><b>舱内之危</b><span>Inner faults</span></h3>
        <div className="vn-list">{INNER.map((n) => <Item key={n} name={n} />)}</div>
        <button className="vn-reset" onClick={sim.clear}><b>复归平静</b><span>Reset</span></button>
      </section>
      <aside className="vn-colophon">
        <div className="vn-meta">
          <span>MET {sim.met}</span>
          <span>第{sim.day}日</span>
          <span>{sim.nav.origin} → {sim.nav.destination} · {Math.round(sim.nav.progress * 100)}%</span>
          <span>{sim.velocity} km/s</span>
        </div>
        <h3><b>舟况</b><span>Systems</span></h3>
        {sim.systems.map((s) => (
          <div key={s.key} className={`vn-sys ${s.value < 80 ? 'low' : ''}`}>
            <b>{SYS_CN[s.key]}</b>
            <span>{s.label}</span>
            <i style={{ '--v': `${s.value}%` }} />
            <em>{s.value}</em>
          </div>
        ))}
        <h3><b>智能</b><span>AI agents</span></h3>
        {sim.agents.map((a) => (
          <div key={a.name} className={`vn-agent ${a.ok ? '' : 'warn'}`}>
            <i />
            <b>{a.name}</b>
            <span>{a.state}</span>
          </div>
        ))}
        <h3><b>记事</b><span>Log</span></h3>
        <ol className="vn-log">
          {sim.logs.slice(0, 3).map((l, i) => (
            <li key={`${l.t}-${i}`} className={l.alert ? 'alert' : ''}>{l.text}</li>
          ))}
        </ol>
      </aside>
    </>
  );
}

export default function VariantN({ page, tab, onTab, sim }) {
  const [demo, setDemo] = useState(null);

  // Home autoplay: an emergency every 13 s (active for 8 s), cycling through the outer hazards.
  useEffect(() => {
    if (page !== 'home') {
      setDemo(null);
      return undefined;
    }
    let sec = 0;
    let i = 0;
    const id = setInterval(() => {
      sec += 1;
      const ph = sec % 13;
      if (ph === 2) setDemo({ name: DEMO[i++ % DEMO.length], severity: 65 });
      if (ph === 10) setDemo(null);
    }, 1000);
    return () => clearInterval(id);
  }, [page]);

  const shown = page === 'home' ? sim.event || demo : sim.event;

  return (
    <div className={`vn vn-${page} ${shown ? 'vn-alert' : ''}`}>
      <Filters />
      <div className="vn-canvas">
        <Canvas flat dpr={[1, 1.5]} camera={{ position: [0, 0, 10], fov: 40 }} gl={{ antialias: true }}>
          <World event={shown} page={page} />
        </Canvas>
      </div>
      <div className="vn-grain" aria-hidden="true" />
      <Nav tab={tab} onTab={onTab} sim={sim} />
      <Alarm event={shown} page={page} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} shown={shown} /> : <Console sim={sim} />}
    </div>
  );
}
