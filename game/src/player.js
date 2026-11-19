// Player character for Neon Bay Heist: on-foot movement, jumping, walk animation,
// carjacking (E) and damage / regeneration. Driving itself lives in vehicles.js.
import { enterCar, exitCar } from './vehicles.js';
import { createPed } from './peds.js';
import { burst } from './effects.js';

const WALK_SPEED = 4.5;
const RUN_SPEED = 8;
const GRAVITY = 22;
const JUMP_VELOCITY = 7.5;
const REGEN_DELAY = 6; // seconds without damage before health starts coming back
const REGEN_RATE = 3; // health per second

const tmpDir = { x: 0, z: 0 };
const tmpMove = { x: 0, y: 0, z: 0 }; // candidate position for collideCircle

// Shortest-arc angle lerp, so the character turns the short way round.
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// A limb whose geometry pivot sits at its top joint, so rotation.x swings it.
function makeLimb(mat, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

export function createPlayer(G) {
  const p = G.player || {};
  G.player = p;

  const group = new THREE.Group();
  const rig = new THREE.Group(); // bobbing lives on the rig, jumping on the group
  group.add(rig);

  const jacket = new THREE.MeshStandardMaterial({ color: 0x0e7c7b }); // teal jacket
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22303c });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x101418 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), jacket);
  body.position.y = 1.12;
  body.castShadow = true;
  rig.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  rig.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 12), capMat);
  cap.position.y = 1.92;
  rig.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.24), capMat);
  brim.position.set(0, 1.88, 0.3);
  rig.add(brim);

  const armL = makeLimb(jacket, 0.16, 0.62, 0.18);
  armL.position.set(-0.4, 1.45, 0);
  rig.add(armL);
  const armR = makeLimb(jacket, 0.16, 0.62, 0.18);
  armR.position.set(0.4, 1.45, 0);
  rig.add(armR);
  const legL = makeLimb(dark, 0.2, 0.72, 0.22);
  legL.position.set(-0.16, 0.78, 0);
  rig.add(legL);
  const legR = makeLimb(dark, 0.2, 0.72, 0.22);
  legR.position.set(0.16, 0.78, 0);
  rig.add(legR);

  const spawn = (G.world && G.world.spawn) || { x: 0, z: 0, heading: 0 };
  group.position.set(spawn.x, 0, spawn.z);
  group.rotation.y = spawn.heading;
  G.scene.add(group);

  p.group = group;
  p.mesh = group;
  p.rig = rig;
  p.pos = group.position;
  p.heading = spawn.heading;
  p.vel = new THREE.Vector3();
  p.vy = 0;
  p.onFoot = true;
  p.car = null;
  p.health = 100;
  p.maxHealth = 100;
  p.cash = p.cash || 0;
  p.wanted = p.wanted || 0;
  p.armed = false;
  p.ammo = p.ammo || 12;
  p.speed = 0;
  p.walkPhase = 0;
  p.lastDamageAt = -100;
  p.limbs = { armL, armR, legL, legR };
  return p;
}

function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    const dx = car.pos.x - G.player.pos.x;
    const dz = car.pos.z - G.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function handleInteract(G) {
  const p = G.player;
  if (p.car) {
    exitCar(G);
    return;
  }
  const car = nearestCar(G, 3.4);
  if (!car) return;
  if (car.driver === 'traffic') {
    // Yank the driver out: they flee on foot, and the theft is a crime.
    // The wanted level itself comes from the crime event (main.js drains it
    // into addWanted once) — never add it here as well, or it counts twice.
    const driver = createPed(G, car.pos.x + 1.2, car.pos.z + 1.2, { flee: true });
    void driver;
    if (!car.stolen) {
      car.stolen = true;
      G.stats.carsStolen += 1;
    }
    G.events.push({ type: 'crime', level: 1 });
    if (G.hud) G.hud.toast('Mobil dicuri!');
  } else if (car.driver === 'parked') {
    if (!car.stolen) {
      car.stolen = true;
      G.stats.carsStolen += 1;
    }
  } else {
    return; // cop cars and anything else cannot be taken
  }
  enterCar(G, car);
}

export function updatePlayer(G, dt) {
  if (G.state !== 'playing') return;
  const p = G.player;
  if (!p || !p.group) return;
  const input = G.input;

  // Driving: the car owns the position; the on-foot mesh stays hidden.
  // E still works here so the player can get out.
  if (p.car) {
    p.group.position.copy(p.car.pos);
    p.group.position.y = 0;
    p.group.visible = false;
    p.speed = p.car.speed || 0;
    if (input.wasPressed('KeyE')) handleInteract(G);
    return;
  }
  p.group.visible = true;

  const basis = G.moveBasis || { fwd: { x: 0, z: 1 }, right: { x: 1, z: 0 } };
  tmpDir.x = 0;
  tmpDir.z = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) { tmpDir.x += basis.fwd.x; tmpDir.z += basis.fwd.z; }
  if (input.down('KeyS') || input.down('ArrowDown')) { tmpDir.x -= basis.fwd.x; tmpDir.z -= basis.fwd.z; }
  if (input.down('KeyD') || input.down('ArrowRight')) { tmpDir.x += basis.right.x; tmpDir.z += basis.right.z; }
  if (input.down('KeyA') || input.down('ArrowLeft')) { tmpDir.x -= basis.right.x; tmpDir.z -= basis.right.z; }
  const len = Math.hypot(tmpDir.x, tmpDir.z);
  const moving = len > 0.01;
  const running = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = running ? RUN_SPEED : WALK_SPEED;
  if (moving) {
    tmpDir.x /= len;
    tmpDir.z /= len;
  }
  p.vel.x = tmpDir.x * (moving ? speed : 0);
  p.vel.z = tmpDir.z * (moving ? speed : 0);
  p.speed = moving ? speed : 0;

  // Move; collideCircle takes a position object and pushes it out of
  // buildings (and the world edge) in place, so sliding comes for free.
  const collide = G.world && G.world.collideCircle;
  tmpMove.x = p.pos.x + p.vel.x * dt;
  tmpMove.y = 0;
  tmpMove.z = p.pos.z + p.vel.z * dt;
  if (collide) collide(tmpMove, 0.6);
  p.pos.x = tmpMove.x;
  p.pos.z = tmpMove.z;

  // Jump + gravity, landing back on y = 0.
  if (input.wasPressed('Space') && p.pos.y <= 0.01) p.vy = JUMP_VELOCITY;
  p.vy -= GRAVITY * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vy = 0;
  }

  // Face the direction of travel.
  if (moving) {
    const targetHeading = Math.atan2(tmpDir.x, tmpDir.z);
    p.heading = lerpAngle(p.heading, targetHeading, Math.min(1, dt * 12));
    p.group.rotation.y = p.heading;
  }

  // Walk cycle: swinging limbs and a small bob.
  if (moving) p.walkPhase += dt * (4 + p.speed * 1.1);
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const { armL, armR, legL, legR } = p.limbs;
  armL.rotation.x = swing;
  armR.rotation.x = -swing;
  legL.rotation.x = -swing;
  legR.rotation.x = swing;
  p.rig.position.y = moving ? Math.abs(Math.sin(p.walkPhase)) * 0.06 : 0;

  // Health regen after a quiet spell.
  if (p.health > 0 && p.health < p.maxHealth && G.time - p.lastDamageAt > REGEN_DELAY) {
    p.health = Math.min(p.maxHealth, p.health + REGEN_RATE * dt);
  }

  if (input.wasPressed('KeyE')) handleInteract(G);
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (!p || p.health <= 0 || G.state !== 'playing') return;
  p.health -= amount;
  p.lastDamageAt = G.time;
  const hit = new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z);
  burst(G, hit, 0xdd2222, 10, 5);
  if (p.health <= 0) {
    p.health = 0;
    G.state = 'wasted';
    G.events.push({ type: 'wasted' });
    if (G.audio) G.audio.play('wasted');
  }
}
