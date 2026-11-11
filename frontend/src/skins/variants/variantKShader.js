// Variant K full-screen "oil painting" pass.
// Sky = flow field (swirls + stars + hazards) → line-integral-convolution brush strokes → stepped palette.
// Ship = 3D scene rendered to an FBO, run through a Kuwahara filter, outlined and graded on top.

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uSceneRes;
uniform vec2 uRes;
uniform float uTime, uAspect;
uniform float uAlert, uBurn, uShield, uStorm, uStormR, uBH, uAlien, uFire;
uniform vec2 uShip, uTail, uSun, uBHPos, uAlienPos;
uniform float uShipR;
uniform vec4 uComet0, uComet1, uComet2;
uniform vec3 uCometA;

#define STAR_N 9
// Star table as a function (portable: no GLSL ES 3 array constructors). xy = uv position, z = radius.
vec3 starAt(int i) {
  if (i == 0) return vec3(0.07, 0.84, 0.018);
  if (i == 1) return vec3(0.21, 0.69, 0.015);
  if (i == 2) return vec3(0.35, 0.91, 0.022);
  if (i == 3) return vec3(0.49, 0.80, 0.013);
  if (i == 4) return vec3(0.60, 0.93, 0.017);
  if (i == 5) return vec3(0.66, 0.66, 0.012);
  if (i == 6) return vec3(0.13, 0.53, 0.012);
  if (i == 7) return vec3(0.40, 0.62, 0.010);
  return vec3(0.93, 0.60, 0.014);
}

// Portable helpers: smoothstep with reversed edges and pow() of a negative base are undefined in GLSL
// (NaN on some WebKit/Metal drivers → black frame), so use explicit versions.
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float sq(float x) { return x * x; }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 toP(vec2 uv) { return (uv - 0.5) * vec2(uAspect, 1.0); }

vec2 swirl(vec2 d, float r, float s) { float l = length(d); return s * vec2(-d.y, d.x) / (l + 0.015) * exp(-(l * l) / (r * r)); }

vec2 flow(vec2 p) {
  float t = uTime;
  vec2 v = vec2(1.0, 0.45 * sin(p.x * 2.6 + t * 0.05 + 1.7 * sin(p.y * 2.3 - t * 0.03)));
  v += swirl(p - toP(vec2(0.44, 0.76)), 0.30, 1.9);
  v += swirl(p - toP(vec2(0.27, 0.80)), 0.17, -1.3);
  v += swirl(p - uSun, 0.27, 2.2);
  for (int i = 0; i < STAR_N; i++) { vec3 st = starAt(i); v += swirl(p - toP(st.xy), st.z * 4.5, 0.55); }
  float near = exp(-length(p - uShip) * 3.0);
  float a = (vnoise(p * 3.0 + vec2(t * 0.06, -t * 0.04)) - 0.5) * (1.6 + uAlert * (0.6 + near * 4.0));
  a += uAlert * near * sin(t * 3.0 + p.x * 20.0) * 0.6;
  v = rot(a) * v;
  vec2 d = p - uBHPos; float l = length(d);
  v += uBH * (vec2(-d.y, d.x) * 2.4 - d * 0.9) / (l * l + 0.004) * 0.06;
  vec2 ds = p - uSun; float ls = length(ds);
  v += uStorm * ds / (ls + 0.01) * 2.2 * exp(-ls * 1.2);
  vec2 c0 = p - uComet0.xy; v -= uCometA.x * uComet0.zw * exp(-dot(c0, c0) / 0.02) * 3.0;
  vec2 c1 = p - uComet1.xy; v -= uCometA.y * uComet1.zw * exp(-dot(c1, c1) / 0.02) * 3.0;
  vec2 c2 = p - uComet2.xy; v -= uCometA.z * uComet2.zw * exp(-dot(c2, c2) / 0.02) * 3.0;
  vec2 q = p - uTail; v += uBurn * normalize(uTail - uShip + 1e-5) * 3.0 * exp(-dot(q, q) / 0.015);
  return normalize(v + 1e-5);
}

// Line integral convolution of chunky cell noise along the flow = brush strokes.
float lic(vec2 p, vec2 f0, vec2 fa, vec2 fb, float px, float len) {
  float h = len / uRes.y / 8.0;
  vec2 drift = vec2(uTime * (0.006 + uAlert * 0.01), 0.0);
  float s = 0.0, w = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i), k = 1.0 - fi / 8.0, m = fi / 8.0;
    vec2 a = p + mix(f0, fa, m) * h * fi, b = p - mix(f0, fb, m) * h * fi;
    s += (hash(floor((a + drift) * uRes.y / px)) + hash(floor((b + drift) * uRes.y / px))) * k;
    w += 2.0 * k;
  }
  return clamp((s / w - 0.5) * 3.2 + 0.5, 0.0, 1.0);
}

vec3 skyPal(float x) {
  vec3 c0 = vec3(0.03, 0.06, 0.17), c1 = vec3(0.07, 0.16, 0.42), c2 = vec3(0.15, 0.32, 0.66);
  vec3 c3 = vec3(0.36, 0.58, 0.80), c4 = vec3(0.70, 0.82, 0.78), c5 = vec3(0.93, 0.80, 0.36);
  x = clamp(x, 0.0, 1.0) * 5.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  if (x < 4.0) return mix(c3, c4, x - 3.0);
  return mix(c4, c5, x - 4.0);
}

// Haloed orb with concentric stroke rings (stars, Sun).
vec3 orb(vec3 col, float d, float r, float s1, float phase, float boost) {
  float m = sstep(r * (6.0 + boost * 3.0), 0.0, d);
  float ring = 0.5 + 0.5 * sin(d / r * 6.5 - uTime * 0.7 + phase + s1 * 2.2);
  vec3 outer = mix(vec3(0.55, 0.75, 0.86), vec3(0.97, 0.84, 0.38), sstep(r * 4.0, r * 1.2, d));
  col = mix(col, outer, clamp(pow(m, 1.6) * (0.35 + 0.65 * ring) * (0.75 + 0.25 * s1), 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.97, 0.84), sstep(r * 1.0, r * 0.55, d));
  return col;
}

vec4 planet(vec2 p, vec2 c, float r, vec3 a, vec3 b, float band, float s2) {
  vec2 d = (p - c) / r; float l = length(d);
  if (l > 1.1) return vec4(0.0);
  float z = sqrt(max(0.0, 1.0 - l * l)); vec3 n = vec3(d, z);
  vec3 L = normalize(vec3(uSun - c, 0.5));
  float lam = clamp(dot(n, L), 0.0, 1.0);
  float dab = hash(floor(rot(0.7) * d * 9.0 + floor(d.y * 4.0)));
  float stripe = 0.5 + 0.5 * sin(d.y * band + vnoise(d * 3.0) * 2.5 + dab * 1.2);
  vec3 c0 = mix(a, b, stripe);
  float sh = floor((0.22 + lam * 0.95 + (s2 - 0.5) * 0.35) * 4.0) / 4.0;
  vec3 col = c0 * sh + vec3(0.95, 0.85, 0.5) * pow(lam, 8.0) * 0.35;
  col = mix(col, vec3(0.04, 0.07, 0.2), sstep(0.84, 1.0, l) * 0.85);
  return vec4(col, sstep(1.1, 1.0, l));
}

vec3 ringBand(vec3 col, vec2 p, vec2 c, float r, float s1, bool front) {
  vec2 q = rot(0.35) * (p - c);
  float e = length(q * vec2(1.0, 3.4)) / r;
  float m = sstep(1.3, 1.38, e) * sstep(2.05, 1.95, e);
  bool isFront = q.y < 0.0;
  if (isFront != front) return col;
  vec3 rc = mix(vec3(0.85, 0.70, 0.42), vec3(0.98, 0.9, 0.62), 0.5 + 0.5 * sin(e * 30.0 + s1 * 2.0));
  return mix(col, rc, m * 0.9);
}

vec4 kuwahara(vec2 uv) {
  vec2 tx = 1.0 / uSceneRes;
  vec3 m0 = vec3(0), m1 = vec3(0), m2 = vec3(0), m3 = vec3(0);
  vec3 q0 = vec3(0), q1 = vec3(0), q2 = vec3(0), q3 = vec3(0);
  float a0 = 0.0, a1 = 0.0, a2 = 0.0, a3 = 0.0;
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    vec4 c = texture2D(uScene, uv + vec2(i, j) * tx);
    vec3 cc = c.rgb / (1.0 + c.rgb);
    if (i <= 0 && j <= 0) { m0 += cc; q0 += cc * cc; a0 += c.a; }
    if (i >= 0 && j <= 0) { m1 += cc; q1 += cc * cc; a1 += c.a; }
    if (i <= 0 && j >= 0) { m2 += cc; q2 += cc * cc; a2 += c.a; }
    if (i >= 0 && j >= 0) { m3 += cc; q3 += cc * cc; a3 += c.a; }
  }
  float n = 16.0;
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  vec3 v0 = q0 / n - m0 * m0, v1 = q1 / n - m1 * m1, v2 = q2 / n - m2 * m2, v3 = q3 / n - m3 * m3;
  float s0 = v0.r + v0.g + v0.b, s1 = v1.r + v1.g + v1.b, s2 = v2.r + v2.g + v2.b, s3 = v3.r + v3.g + v3.b;
  vec4 best = vec4(m0, a0 / n); float bs = s0;
  if (s1 < bs) { bs = s1; best = vec4(m1, a1 / n); }
  if (s2 < bs) { bs = s2; best = vec4(m2, a2 / n); }
  if (s3 < bs) { bs = s3; best = vec4(m3, a3 / n); }
  return best;
}

vec3 comet(vec3 col, vec2 p, vec4 cm, float A, float s1) {
  if (A < 0.01) return col;
  vec2 dir = cm.zw; vec2 q = p - cm.xy;
  float along = dot(q, -dir), perp = dot(q, vec2(-dir.y, dir.x));
  float w = 0.008 + max(along, 0.0) * 0.08;
  float tail = step(0.0, along) * exp(-perp * perp / (w * w)) * exp(-along * 2.6);
  col *= 1.0 - 0.4 * A * step(0.0, along) * exp(-perp * perp / (w * w * 3.5)) * exp(-along * 2.6);
  vec3 tc = mix(vec3(0.96, 0.62, 0.22), vec3(1.0, 0.95, 0.78), exp(-along * 7.0));
  col = mix(col, tc, clamp(tail * (0.55 + 0.75 * s1) * 1.3, 0.0, 1.0) * A);
  float lq = length(q);
  col = mix(col, vec3(1.0, 0.95, 0.78), sstep(0.032, 0.012, lq) * A);
  col = mix(col, vec3(0.32, 0.2, 0.12), sstep(0.012, 0.008, lq) * A);
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = toP(uv);
  float t = uTime;

  // Gravitational lensing near the black hole bends the painted sky.
  vec2 dbh = p - uBHPos; float lbh = length(dbh);
  vec2 ps = p - dbh / (lbh + 1e-4) * uBH * 0.005 / (lbh + 0.012);

  vec2 f0 = flow(ps);
  float hl = 25.0 / uRes.y;
  vec2 fa = flow(ps + f0 * hl), fb = flow(ps - f0 * hl);
  float s1 = lic(ps, f0, fa, fb, 5.5, 50.0);
  float s2 = lic(ps + 0.37, f0, fa, fb, 2.6, 22.0);

  // Large-scale tonal bands that follow the swirls.
  float big = fbm(ps * 1.5 + f0 * 0.12 + vec2(0.0, t * 0.01));
  float la = length(ps - toP(vec2(0.44, 0.76)));
  float rings = (0.5 + 0.5 * sin(la * 62.0 - t * 0.35)) * exp(-la / 0.22);
  float tone = 0.12 + big * 0.62 + (s1 - 0.5) * 0.34 + (s2 - 0.5) * 0.16 + rings * 0.22 - (0.55 - uv.y) * 0.32;
  tone = floor(tone * 8.0 + s2 * 0.7) / 8.0;
  vec3 col = skyPal(tone);

  // Agitation: strokes near the ship redden while danger is live.
  float near = exp(-length(p - uShip) * 2.6);
  col = mix(col, col * vec3(1.35, 0.55, 0.5) + vec3(0.16, 0.02, 0.0), uAlert * (0.12 + 0.45 * near) * (0.6 + 0.6 * s1));

  // Stars and the Sun.
  for (int i = 0; i < STAR_N; i++) {
    vec3 st = starAt(i);
    vec2 sp = toP(st.xy);
    float r = st.z * (1.0 + 0.1 * sin(t * 1.3 + float(i) * 2.1));
    col = orb(col, length(ps - sp), r, s1, float(i), 0.0);
  }
  float ls = length(ps - uSun);
  col = orb(col, ls, 0.045 * (1.0 + uStorm * 0.25), s1, 0.0, 1.0 + uStorm * 1.5);
  col = mix(col, vec3(0.98, 0.62, 0.16), sstep(0.03, 0.0, abs(ls - 0.06)) * 0.5 * (0.5 + s2));

  // Planets as dabbed impasto spheres.
  vec2 gC = toP(vec2(0.90, 0.13)); float gR = 0.085;
  col = ringBand(col, p, gC, gR, s1, false);
  vec4 pl = planet(p, gC, gR, vec3(0.78, 0.55, 0.32), vec3(0.95, 0.82, 0.55), 26.0, s2); col = mix(col, pl.rgb, pl.a);
  col = ringBand(col, p, gC, gR, s1, true);
  pl = planet(p, toP(vec2(0.06, 0.14)), 0.06, vec3(0.12, 0.35, 0.72), vec3(0.3, 0.62, 0.42), 9.0, s2); col = mix(col, pl.rgb, pl.a);
  pl = planet(p, toP(vec2(0.20, 0.40)), 0.026, vec3(0.75, 0.28, 0.12), vec3(0.92, 0.5, 0.25), 7.0, s2); col = mix(col, pl.rgb, pl.a);

  // Solar storm: a surge of chrome-yellow strokes rolling out from the Sun.
  float front = exp(-sq((ls - uStormR) / 0.05));
  float surge = uStorm * (front * 0.9 + 0.35 * exp(-ls * 1.5));
  col = mix(col, mix(vec3(0.96, 0.74, 0.18), vec3(1.0, 0.95, 0.62), s1), clamp(surge * (0.35 + 0.8 * s1), 0.0, 1.0));

  // Black hole: brushstrokes spiral into a dark well with a golden accretion ring.
  if (uBH > 0.001) {
    float rc = 0.06 * uBH;
    col *= 1.0 - 0.55 * uBH * exp(-lbh / (0.06 * 2.5));
    float disk = exp(-sq((lbh - rc * 1.65) / (rc * 0.45)));
    col = mix(col, mix(vec3(0.92, 0.48, 0.12), vec3(1.0, 0.9, 0.5), s1), clamp(disk * uBH * (0.5 + 0.6 * s1), 0.0, 1.0));
    col = mix(col, vec3(0.01, 0.01, 0.035), sstep(rc * 1.05, rc * 0.8, lbh));
  }

  // Alien light: emerald pulsing rings.
  if (uAlien > 0.001) {
    float da = length(p - uAlienPos);
    float pr = 0.5 + 0.5 * sin(da * 120.0 - t * 4.0 + s1 * 2.0);
    float ma = uAlien * exp(-da / 0.06);
    col = mix(col, mix(vec3(0.2, 0.55, 0.35), vec3(0.6, 0.98, 0.7), pr), clamp(ma * (0.4 + 0.6 * pr), 0.0, 1.0));
    col = mix(col, vec3(0.9, 1.0, 0.9), uAlien * sstep(0.014, 0.006, da));
  }

  // Thruster plume (behind the hull).
  vec2 ax = normalize(uTail - uShip + 1e-5); vec2 qp = p - uTail;
  float along = dot(qp, ax), perp = dot(qp, vec2(-ax.y, ax.x));
  float L = 0.04 + 0.3 * uBurn; float pw = 0.007 + max(along, 0.0) * 0.22;
  float pm = sstep(-0.015, 0.01, along) * exp(-perp * perp / (pw * pw)) * (1.0 - sstep(0.0, L, along));
  pm *= 0.45 + 0.75 * s2;
  vec3 pc = mix(vec3(1.0, 0.97, 0.8), mix(vec3(0.98, 0.6, 0.15), vec3(0.85, 0.2, 0.1), sstep(0.3, 1.0, along / L)), sstep(0.0, 0.4, along / L));
  col = mix(col, pc, clamp(pm * (0.2 + uBurn), 0.0, 1.0));

  // Ship: Kuwahara-painted FBO with an ultramarine contour.
  vec2 tx = 1.0 / uSceneRes;
  float probe = max(max(texture2D(uScene, uv).a, texture2D(uScene, uv + tx * vec2(4, 4)).a),
                    max(texture2D(uScene, uv - tx * vec2(4, 4)).a, max(texture2D(uScene, uv + tx * vec2(4, -4)).a, texture2D(uScene, uv - tx * vec2(4, -4)).a)));
  if (probe > 0.001) {
    vec4 k = kuwahara(uv);
    vec3 sc = pow(clamp(k.rgb * 1.25, 0.0, 1.0), vec3(1.0 / 2.2));
    float lum = dot(sc, vec3(0.3, 0.59, 0.11));
    sc = mix(sc, floor(sc * 6.0 + 0.5) / 6.0, 0.45);
    sc += vec3(0.03, 0.05, 0.13) * (1.0 - lum);
    sc *= vec3(1.04, 1.0, 0.92) * (0.9 + 0.2 * s2);
    sc = mix(sc, sc * vec3(1.25, 0.7, 0.6) + vec3(0.1, 0.0, 0.0), uAlert * 0.25);
    float fl = uFire * (0.6 + 0.4 * sin(t * 13.0 + p.x * 40.0));
    sc = mix(sc, vec3(1.0, 0.55, 0.15), fl * 0.35 * sstep(0.2, 0.8, lum));
    float ea = abs(texture2D(uScene, uv + vec2(2.5, 0) * tx).a - texture2D(uScene, uv - vec2(2.5, 0) * tx).a)
             + abs(texture2D(uScene, uv + vec2(0, 2.5) * tx).a - texture2D(uScene, uv - vec2(0, 2.5) * tx).a);
    col = mix(col, sc, sstep(0.15, 0.6, k.a));
    col = mix(col, vec3(0.04, 0.07, 0.2), clamp(ea, 0.0, 1.0) * 0.7);
  }

  // Shield: an elliptical ring of pale strokes around the hull.
  if (uShield > 0.001) {
    vec2 sd = (p - uShip) / (uShipR * vec2(1.25, 0.8));
    float dd = length(sd);
    float ring = exp(-sq((dd - 1.0) / 0.06)) * uShield * (0.35 + 0.85 * s2);
    col = mix(col, vec3(0.72, 0.9, 1.0), clamp(ring, 0.0, 1.0) * 0.75);
  }

  // Meteors as comets with stroke tails (in front of the hull).
  col = comet(col, p, uComet0, uCometA.x, s1);
  col = comet(col, p, uComet1, uCometA.y, s1);
  col = comet(col, p, uComet2, uCometA.z, s1);

  // Canvas weave, grain, varnish vignette.
  vec2 px = uv * uRes;
  float weave = sin(px.x * 1.7) * sin(px.y * 1.7) * 0.03 + (hash(px) - 0.5) * 0.05;
  col += weave;
  col *= mix(1.0, 0.62, sstep(0.42, 0.95, length((uv - 0.5) * vec2(1.25, 1.4))));
  col = mix(col, col * vec3(1.05, 1.0, 0.88), 0.35);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
