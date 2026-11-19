// Lightweight particles and tracers for Neon Bay Heist: one pooled THREE.Points cloud
// for sparks and a small pool of fading lines, no textures and no geometry per burst.
const MAX_PARTICLES = 240;
const MAX_TRACERS = 8;

let points = null;
let positions = null;
let colors = null;
let life = null;
let velocity = null;
let tracers = [];
let nextTracer = 0;

const tmpColor = { r: 0, g: 0, b: 0 };

function hexToRgb(hex) {
  tmpColor.r = ((hex >> 16) & 255) / 255;
  tmpColor.g = ((hex >> 8) & 255) / 255;
  tmpColor.b = (hex & 255) / 255;
  return tmpColor;
}

export function initEffects(G) {
  const geo = new THREE.BufferGeometry();
  positions = new Float32Array(MAX_PARTICLES * 3);
  colors = new Float32Array(MAX_PARTICLES * 3);
  life = new Float32Array(MAX_PARTICLES);
  velocity = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i += 1) positions[i * 3 + 1] = -100;
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.4, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  G.scene.add(points);

  tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    const line = new THREE.Line(lineGeo, lineMat);
    line.frustumCulled = false;
    line.visible = false;
    G.scene.add(line);
    tracers.push({ line, life: 0 });
  }
}

// A burst of sparks at `pos` (a THREE.Vector3), coloured by a hex number.
export function burst(G, pos, colorHex, count, speed) {
  if (!points) return;
  const n = count === undefined ? 14 : count;
  const sp = speed === undefined ? 6 : speed;
  const rgb = hexToRgb(colorHex);
  let spawned = 0;
  for (let i = 0; i < MAX_PARTICLES && spawned < n; i += 1) {
    if (life[i] > 0) continue;
    life[i] = 0.45 + Math.random() * 0.35;
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random() * 0.9 + 0.3;
    const v = sp * (0.5 + Math.random() * 0.8);
    velocity[i * 3] = Math.cos(a) * v;
    velocity[i * 3 + 1] = up * v;
    velocity[i * 3 + 2] = Math.sin(a) * v;
    colors[i * 3] = rgb.r;
    colors[i * 3 + 1] = rgb.g;
    colors[i * 3 + 2] = rgb.b;
    spawned += 1;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}

// A bright line from `from` to `to` that fades out in a tenth of a second.
export function tracer(G, from, to, colorHex) {
  const slot = tracers[nextTracer];
  nextTracer = (nextTracer + 1) % MAX_TRACERS;
  if (!slot) return;
  const attr = slot.line.geometry.attributes.position;
  attr.array[0] = from.x;
  attr.array[1] = from.y;
  attr.array[2] = from.z;
  attr.array[3] = to.x;
  attr.array[4] = to.y;
  attr.array[5] = to.z;
  attr.needsUpdate = true;
  slot.line.material.color.setHex(colorHex === undefined ? 0xffe08a : colorHex);
  slot.line.visible = true;
  slot.life = 0.12;
}

export function updateEffects(G, dt) {
  if (!points) return;
  let anyAlive = false;
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    if (life[i] <= 0) continue;
    anyAlive = true;
    life[i] -= dt;
    if (life[i] <= 0) {
      positions[i * 3 + 1] = -100;
      continue;
    }
    velocity[i * 3 + 1] -= 12 * dt;
    positions[i * 3] += velocity[i * 3] * dt;
    positions[i * 3 + 1] += velocity[i * 3 + 1] * dt;
    positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
    if (positions[i * 3 + 1] < 0.05) {
      positions[i * 3 + 1] = 0.05;
      velocity[i * 3 + 1] *= -0.4;
    }
  }
  if (anyAlive) points.geometry.attributes.position.needsUpdate = true;
  for (const slot of tracers) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    slot.line.material.opacity = Math.max(0, slot.life / 0.12);
    if (slot.life <= 0) slot.line.visible = false;
  }
}
