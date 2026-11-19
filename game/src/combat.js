// Pistol combat for Neon Bay Heist: equip/holster, raycast shooting with tracer
// and muzzle flash, and a close-range punch. Hits resolve through userData.ref.
import { burst, tracer } from './effects.js';

const FIRE_COOLDOWN = 0.28;
const RANGE = 80;
const PED_DAMAGE = 34; // 3 hits to drop a ped (100 hp)
const CAR_DAMAGE = 12;
const MELEE_DAMAGE = 25;
const MELEE_RANGE = 2.2;
const MAG_SIZE = 12;

let cooldown = 0;
let muzzleLight = null;
let muzzleTimer = 0;
let raycaster = null;

const tmpVec = { x: 0, y: 0, z: 0 };
const tmpFwd = { x: 0, y: 0, z: 0 };

function ensureMuzzle(G) {
  if (!muzzleLight) {
    muzzleLight = new THREE.PointLight(0xffc266, 0, 12);
    G.scene.add(muzzleLight);
  }
  return muzzleLight;
}

function muzzlePos(G, out) {
  const p = G.player;
  const heading = p.car ? p.car.heading : p.heading;
  out.x = p.pos.x + Math.sin(heading) * 1;
  out.y = p.pos.y + 1.4;
  out.z = p.pos.z + Math.cos(heading) * 1;
  return out;
}

// Gather everything a bullet can hit. userData.ref is set by peds.js / police.js;
// anything missing it here is tagged defensively so a hit still resolves.
function collectShootables(G) {
  const list = [];
  for (const ped of G.peds || []) {
    if (ped.state === 'dead') continue;
    ped.group.traverse((o) => {
      if (o.isMesh) {
        if (!o.userData.ref) o.userData.ref = ped;
        list.push(o);
      }
    });
  }
  for (const cop of (G.cops && G.cops.foot) || []) {
    if (cop.dead) continue;
    cop.group.traverse((o) => {
      if (o.isMesh) {
        if (!o.userData.ref) o.userData.ref = cop;
        list.push(o);
      }
    });
  }
  for (const car of G.cars || []) {
    if (car.body) {
      if (!car.body.userData.ref) car.body.userData.ref = car;
      list.push(car.body);
    }
  }
  for (const b of (G.world && G.world.buildings) || []) {
    const mesh = b.mesh || b;
    if (mesh && mesh.isMesh) {
      if (!mesh.userData.ref) mesh.userData.ref = { kind: 'wall' };
      list.push(mesh);
    }
  }
  return list;
}

function dropPed(G, ped) {
  ped.state = 'dead';
  ped.dead = true;
  ped.deadTimer = 12;
  ped.group.rotation.x = -Math.PI / 2;
  ped.legL.rotation.x = 0;
  ped.legR.rotation.x = 0;
}

function resolveHit(G, hit) {
  const ref = hit.object.userData.ref;
  const point = hit.point;
  if (!ref) return;
  if (ref.kind === 'wall') {
    burst(G, point, 0xaaaaaa, 8, 3);
    return;
  }
  if (ref.kind === 'cop') {
    ref.hp -= PED_DAMAGE;
    burst(G, point, 0xdd2222, 12, 5);
    G.events.push({ type: 'crime', level: 2 });
    if (ref.hp <= 0 && !ref.dead) {
      ref.dead = true;
      ref.deadTimer = 8;
      ref.group.rotation.x = -Math.PI / 2;
    }
    return;
  }
  if (ref.body) {
    // A car: damage it; a wrecked car stops and loses its driver.
    const occupied = ref.driver && ref.driver !== 'parked';
    ref.hp = (ref.hp === undefined ? 100 : ref.hp) - CAR_DAMAGE;
    burst(G, point, 0xffcc44, 10, 4);
    if (ref.hp <= 0) {
      ref.speed = 0;
      if (ref.driver === 'traffic') ref.driver = 'parked';
      burst(G, point, 0x888888, 16, 3);
      if (occupied) G.events.push({ type: 'crime', level: 1 });
    }
    return;
  }
  // A pedestrian.
  ref.hp -= PED_DAMAGE;
  burst(G, point, 0xdd2222, 12, 5);
  G.events.push({ type: 'crime', level: 1 });
  if (ref.hp <= 0 && ref.state !== 'dead') dropPed(G, ref);
}

// Ray vs one building AABB ({minX, maxX, minZ, maxZ, h}): slab test, returns
// the distance along the ray, or Infinity when there is no hit within RANGE.
// City stores buildings as AABBs rather than meshes, so the raycaster alone
// would let bullets fly straight through walls.
function rayBuildingDist(origin, dir, b) {
  let tmin = 0;
  let tmax = RANGE;
  const axes = [
    [origin.x, dir.x, b.minX, b.maxX],
    [origin.y, dir.y, 0, b.h],
    [origin.z, dir.z, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin > 0 ? tmin : Infinity;
}

export function tryShoot(G) {
  const p = G.player;
  if (!p || !p.armed || cooldown > 0 || G.state !== 'playing') return;
  if (p.ammo <= 0) {
    cooldown = 0.3; // dry trigger, throttled so the toast below is not spammed
    return;
  }
  cooldown = FIRE_COOLDOWN;
  p.ammo -= 1;
  G.stats.shotsFired += 1;
  if (p.ammo === 0 && G.hud) G.hud.toast('Amunisi habis — tekan 2 untuk isi ulang');
  if (!raycaster) raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: 0, y: 0 }, G.camera);
  raycaster.far = RANGE;

  const muzzle = muzzlePos(G, tmpVec);
  const muzzleV = new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z);
  let end;
  const hits = raycaster.intersectObjects(collectShootables(G), false);
  // Nearest building wall along the same ray (see rayBuildingDist above).
  let wallDist = Infinity;
  for (const b of (G.world && G.world.buildings) || []) {
    const d = rayBuildingDist(raycaster.ray.origin, raycaster.ray.direction, b);
    if (d < wallDist) wallDist = d;
  }
  if (wallDist < RANGE && (!hits.length || wallDist < hits[0].distance)) {
    end = new THREE.Vector3().copy(raycaster.ray.origin)
      .addScaledVector(raycaster.ray.direction, wallDist);
    burst(G, end, 0xaaaaaa, 8, 3); // dust where the bullet hits the wall
  } else if (hits.length > 0 && hits[0].distance < RANGE) {
    end = hits[0].point;
    resolveHit(G, hits[0]);
  } else {
    // Clean miss: the tracer just runs out 60 m downrange.
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    end = new THREE.Vector3().copy(G.camera.position).addScaledVector(dir, 60);
  }
  tracer(G, muzzleV, end, 0xffe08a);

  const light = ensureMuzzle(G);
  light.position.copy(muzzleV);
  light.intensity = 2;
  muzzleTimer = 0.05;
  if (G.audio) G.audio.play('shoot');
  G.events.push({ type: 'shot' });
  G.camPitch += 0.02; // small recoil, consumed by the camera controller
}

function tryMelee(G) {
  const p = G.player;
  if (!p || G.state !== 'playing') return;
  tmpFwd.x = Math.sin(p.heading);
  tmpFwd.z = Math.cos(p.heading);
  const targets = [];
  for (const ped of G.peds || []) if (ped.state !== 'dead') targets.push(ped);
  for (const cop of (G.cops && G.cops.foot) || []) if (!cop.dead) targets.push(cop);
  for (const t of targets) {
    const dx = t.pos.x - p.pos.x;
    const dz = t.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > MELEE_RANGE || d < 0.01) continue;
    if ((dx * tmpFwd.x + dz * tmpFwd.z) / d < 0.4) continue; // must be in front
    t.hp -= MELEE_DAMAGE;
    t.pos.x += (dx / d) * 2;
    t.pos.z += (dz / d) * 2;
    burst(G, new THREE.Vector3(t.pos.x, t.pos.y + 1.1, t.pos.z), 0xdd2222, 8, 4);
    if (G.audio) G.audio.play('punch');
    G.events.push({ type: 'crime', level: 1 });
    if (t.kind === 'cop') {
      if (t.hp <= 0) {
        t.dead = true;
        t.deadTimer = 8;
        t.group.rotation.x = -Math.PI / 2;
      }
    } else if (t.hp <= 0 && t.state !== 'dead') {
      dropPed(G, t);
    } else if (t.state === 'walk') {
      t.state = 'flee'; // a punched ped runs away
      t.fleeTimer = 4;
      t.target = null;
    }
    return; // one target per swing
  }
}

export function updateCombat(G, dt) {
  if (cooldown > 0) cooldown -= dt;
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0 && muzzleLight) muzzleLight.intensity = 0;
  }
  if (G.state !== 'playing' || !G.player) return;

  if (G.input.wasPressed('Digit2') && !G.player.armed) {
    G.player.armed = true;
    G.player.ammo = MAG_SIZE;
    if (G.hud) G.hud.toast('Pistol siap — klik untuk menembak');
  }
  if (G.input.wasPressed('Digit1') && G.player.armed) {
    G.player.armed = false;
    if (G.hud) G.hud.toast('Pistol disimpan');
  }
  if (G.player.armed && (G.input.takeClick() || G.input.isMouseDown())) {
    tryShoot(G);
  }
  if (G.input.wasPressed('KeyF')) tryMelee(G);
}
