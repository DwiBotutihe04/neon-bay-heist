// Police for Neon Bay Heist: wanted level, cop-car pursuits with flashing light bars,
// foot cops who chase and bust the player, and wanted decay when the heat dies down.
// Cop cars also live in G.cars (driver 'cop'); foot cops are built here.
import { createCar } from './vehicles.js';
import { burst } from './effects.js';

const MAX_WANTED = 5;
const COP_CAR_TURN = 2.2; // rad per second
const BUST_TIME = 2; // seconds held within 2 m before the bust lands
const DECAY_QUIET = 20; // seconds without a crime before decay can start
const DECAY_STEP = 8; // seconds per wanted level lost

let lastCrimeAt = -1000, trimTimer = 0, decayTimer = 0;
const tmpSlide = { x: 0, y: 0, z: 0 }; // candidate position for collideCircle

function wrapAngle(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
// Wrapped (b - a) in [-PI, PI]: the signed turn needed to face b from a.
const angleDelta = (a, b) => wrapAngle(b - a);
function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z || 0); m.castShadow = true;
  return m;
}

// Move with slide: collideCircle takes a position object and pushes it out of
// buildings in place, so the push-out gives sliding for free.
function slide(collide, pos, nx, nz, r) {
  if (!collide) { pos.x = nx; pos.z = nz; return; }
  tmpSlide.x = nx; tmpSlide.y = 0; tmpSlide.z = nz;
  collide(tmpSlide, r);
  pos.x = tmpSlide.x; pos.z = tmpSlide.z;
}
function toPoint(n) {
  if (!n) return null;
  if (typeof n.x === 'number' && typeof n.z === 'number') return { x: n.x, z: n.z };
  if (n.position) return { x: n.position.x, z: n.position.z };
  return null;
}

// A random road point 60-100 m from the player, or null after a few tries.
function pickCopSpawn(G) {
  const spots = [];
  for (const list of [G.world.nodes || [], G.world.carSpawns || []]) {
    for (const n of list) { const pt = toPoint(n); if (pt) spots.push(pt); }
  }
  if (!spots.length) return null;
  for (let i = 0; i < 10; i += 1) {
    const pt = G.rng.pick(spots);
    const d = Math.hypot(pt.x - G.player.pos.x, pt.z - G.player.pos.z);
    if (d >= 60 && d <= 100) return pt;
  }
  return null;
}
function makeFootCop(G, x, z) {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1c2f57 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0e1626 });
  group.add(box(navy, 0.6, 0.78, 0.36, 0, 1.12, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.72; group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 10), capMat);
  cap.position.y = 1.9; group.add(cap);
  group.position.set(x, 0, z); G.scene.add(group);
  const cop = { kind: 'cop', group, pos: group.position, heading: 0, speed: 5.5,
    bustTimer: 0, hp: 100, dead: false, deadTimer: 0 };
  group.traverse((o) => { if (o.isMesh) o.userData.ref = cop; });
  G.cops.foot.push(cop);
  return cop;
}

// The cop car already carries a red/blue roof bar (vehicles.js); find its two
// materials so updatePolice can flash them. Returns null on a stub car.
function findLightMats(car) {
  let red = null, blue = null;
  car.group.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.color === undefined) return;
    const hex = o.material.color.getHex();
    if (hex === 0xff2222) red = o.material;
    else if (hex === 0x2255ff) blue = o.material;
  });
  return red && blue ? { red, blue } : null;
}

function spawnCopCar(G) {
  const spot = pickCopSpawn(G);
  if (!spot) return false;
  const heading = Math.atan2(G.player.pos.x - spot.x, G.player.pos.z - spot.z);
  const car = createCar(G, { kind: 'cop', driver: 'cop', x: spot.x, z: spot.z, heading });
  if (!car) return false;
  G.cars.push(car); // createCar only builds; the traffic list owns the car
  const lightMats = car.group ? findLightMats(car) : null;
  G.cops.cars.push({ car, lightMats, lightTimer: 0, lightRed: true, ramTimer: 0, deployed: 0 });
  return true;
}
// Remove one unit from a cops list: its mesh from the scene, a cop car also
// from G.cars. Works for both wrappers ({car}) and foot cops ({group}).
function removeFrom(G, list, idx) {
  const u = list[idx];
  if (!u) return;
  const group = u.group || (u.car && u.car.group);
  if (group) G.scene.remove(group);
  if (u.car) { const ci = G.cars.indexOf(u.car); if (ci !== -1) G.cars.splice(ci, 1); }
  list.splice(idx, 1);
}

// Remove the first unit in `list` farther than 60 m from the player, if any.
function trimFar(G, list, getPos) {
  for (let i = 0; i < list.length; i += 1) {
    const pos = getPos(list[i]);
    if (Math.hypot(pos.x - G.player.pos.x, pos.z - G.player.pos.z) > 60) {
      removeFrom(G, list, i);
      return true;
    }
  }
  return false;
}
export function addWanted(G, n) {
  const p = G.player;
  if (!p) return;
  const before = p.wanted || 0;
  p.wanted = Math.max(0, Math.min(MAX_WANTED, before + n));
  if (n > 0) G.stats.crimes += n;
  // The siren itself is driven by updateAudio while wanted > 0.
  if (p.wanted >= 1 && before === 0 && G.hud) G.hud.toast('★ WANTED — polisi mengejarmu!');
  if (p.wanted >= MAX_WANTED && before < MAX_WANTED && G.hud) G.hud.toast('★ ★ ★ ★ ★ BURONAN UTAMA');
}

export function updatePolice(G, dt) {
  if (!G.player || !G.world || !G.cops) return;
  // Note new crimes so the decay clock knows when the player went quiet.
  // G.events is drained by main.js every frame, so whatever is in it is fresh.
  for (const ev of G.events) if (ev.type === 'crime') lastCrimeAt = G.time;
  if (G.state !== 'playing') return;
  const p = G.player;
  const wanted = p.wanted || 0;
  const collide = G.world.collideCircle;
  const targetCars = Math.min(wanted, 3);
  const targetFoot = p.onFoot ? Math.min(wanted * 2, 6) : 0;

  // Trim excess cops one per second, only once they are far away; disengaged
  // units drive/walk off first (see the chase loops below).
  trimTimer += dt;
  if (trimTimer >= 1) {
    trimTimer = 0;
    if (G.cops.cars.length > targetCars) trimFar(G, G.cops.cars, (w) => w.car.pos);
    else if (G.cops.foot.length > targetFoot) trimFar(G, G.cops.foot, (c) => c.pos);
  }

  // Spawn cop cars until the wanted level's quota is met.
  if (G.cops.cars.length < targetCars) spawnCopCar(G);

  // Chase: steer toward the player and close in. Units past the wanted quota
  // (or all of them once wanted hits 0) disengage and drive away instead.
  for (let ci = 0; ci < G.cops.cars.length; ci += 1) {
    const wrapper = G.cops.cars[ci];
    const car = wrapper.car;
    const leaving = ci >= targetCars;
    const dx = p.pos.x - car.pos.x;
    const dz = p.pos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = leaving ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    const maxTurn = COP_CAR_TURN * dt;
    car.heading += Math.max(-maxTurn, Math.min(maxTurn, angleDelta(car.heading, wantHeading)));
    car.speed = leaving ? 12 : Math.min(car.maxSpeed || 20, 12 + wanted * 3 + dist * 0.05);
    slide(collide, car.pos,
      car.pos.x + Math.sin(car.heading) * car.speed * dt,
      car.pos.z + Math.cos(car.heading) * car.speed * dt, 1.1);
    car.group.rotation.y = car.heading;

    // Ram the player's car: shove its speed down, once a second at most.
    wrapper.ramTimer += dt;
    if (!leaving && p.car && dist < 4 && wrapper.ramTimer >= 1) {
      wrapper.ramTimer = 0;
      p.car.speed *= 0.7;
      if (G.audio) G.audio.play('crash');
      burst(G, new THREE.Vector3(car.pos.x, car.pos.y + 0.8, car.pos.z), 0xffcc44, 10, 4);
      if (G.hud) G.hud.toast('Polisi menabrak mobilmu!');
    }

    // On foot and close in: two officers pile out of the car.
    if (!leaving && p.onFoot && dist < 6 && wrapper.deployed < 2 && G.cops.foot.length < targetFoot) {
      for (let k = 0; k < 2 && G.cops.foot.length < targetFoot; k += 1) {
        makeFootCop(G, car.pos.x + (k === 0 ? 1.5 : -1.5), car.pos.z + 1);
      }
      wrapper.deployed = 2;
    }

    // Flashing light bar, red / blue every 0.4 s.
    if (wrapper.lightMats) {
      wrapper.lightTimer += dt;
      if (wrapper.lightTimer >= 0.4) {
        wrapper.lightTimer = 0;
        wrapper.lightRed = !wrapper.lightRed;
        wrapper.lightMats.red.color.setHex(wrapper.lightRed ? 0xff2222 : 0x551111);
        wrapper.lightMats.blue.color.setHex(wrapper.lightRed ? 0x111133 : 0x2255ff);
      }
    }
  }

  // Foot cops: run the player down, hold them to make the bust. Units past the
  // wanted quota walk away from the player instead, until the trim removes them.
  for (let i = G.cops.foot.length - 1; i >= 0; i -= 1) {
    const cop = G.cops.foot[i];
    if (cop.dead) {
      cop.deadTimer -= dt;
      if (cop.deadTimer <= 0) removeFrom(G, G.cops.foot, i);
      continue;
    }
    const leaving = i >= targetFoot;
    const dx = p.pos.x - cop.pos.x;
    const dz = p.pos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = leaving ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    cop.heading = lerpAngle(cop.heading, wantHeading, Math.min(1, dt * 8));
    cop.group.rotation.y = cop.heading;
    const speed = leaving ? 3.5 : 5.2 + wanted * 0.2;
    cop.pos.x += Math.sin(cop.heading) * speed * dt;
    cop.pos.z += Math.cos(cop.heading) * speed * dt;
    if (leaving) { cop.bustTimer = 0; continue; }
    if (dist < 2) {
      cop.bustTimer += dt;
      if (cop.bustTimer > BUST_TIME) {
        G.state = 'busted';
        G.events.push({ type: 'busted' });
        if (G.audio) G.audio.play('busted');
        if (G.hud) G.hud.toast('TERTANGKAP!');
        return;
      }
    } else if (dist > 3) {
      cop.bustTimer = 0;
    }
  }

  // Wanted decay: quiet for 20 s and no cop within 40 m, then -1 per 8 s.
  const near = (pos) => Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < 40;
  const copNear = G.cops.cars.some((w) => near(w.car.pos)) || G.cops.foot.some((c) => near(c.pos));
  if (wanted > 0 && G.time - lastCrimeAt > DECAY_QUIET && !copNear) {
    decayTimer += dt;
    if (decayTimer >= DECAY_STEP) {
      decayTimer = 0;
      p.wanted = Math.max(0, p.wanted - 1);
      if (G.hud) G.hud.toast('Wanted turun');
    }
  } else {
    decayTimer = 0;
  }
}
export function clearPolice(G) {
  if (!G.cops) return;
  for (let i = G.cops.cars.length - 1; i >= 0; i -= 1) removeFrom(G, G.cops.cars, i);
  for (let i = G.cops.foot.length - 1; i >= 0; i -= 1) removeFrom(G, G.cops.foot, i);
  if (G.player) G.player.wanted = 0;
}
