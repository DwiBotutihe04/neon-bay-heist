// Pedestrians for Neon Bay Heist: low-poly walkers who stroll between sidewalk
// spawns, flee gunfire and wanted heat, and get knocked down by speeding cars.
// This file imports nothing: police raises wanted from the crime events it pushes.
const SHIRTS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0xecf0f1, 0xe67e22, 0x16a085, 0xd63384];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const FLEE_SPEED = 5.5;
const FLEE_TIME = 4;
const DEAD_TIME = 12;

let lastWanted = 0;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function pickSpawn(G) {
  const spawns = (G.world && G.world.pedSpawns) || [];
  if (!spawns.length) return { x: 0, z: 0 };
  return G.rng.pick(spawns);
}

export function createPed(G, x, z, opts) {
  opts = opts || {};
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: G.rng.pick(SHIRTS) });
  const skin = new THREE.MeshStandardMaterial({ color: G.rng.pick(SKINS) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f36 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.15);
  armGeo.translate(0, -0.27, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.35, 1.32, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.35, 1.32, 0);
  group.add(armR);

  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  legGeo.translate(0, -0.31, 0);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.14, 0.66, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, dark);
  legR.position.set(0.14, 0.66, 0);
  group.add(legR);

  group.position.set(x, 0, z);
  const heading = G.rng.range(0, Math.PI * 2);
  group.rotation.y = heading;
  G.scene.add(group);

  const ped = {
    group,
    pos: group.position,
    heading,
    speed: G.rng.range(1.2, 2),
    state: opts.state || (opts.flee ? 'flee' : 'walk'),
    target: null,
    walkPhase: G.rng.range(0, Math.PI * 2),
    dead: false,
    deadTimer: 0,
    hp: 100,
    fleeTimer: opts.flee ? FLEE_TIME : 0,
    legL,
    legR,
  };
  // Raycasts in combat.js resolve a hit mesh back to its ped through this ref.
  group.traverse((o) => {
    if (o.isMesh) o.userData.ref = ped;
  });
  if (G.peds && G.peds.indexOf(ped) === -1) G.peds.push(ped);
  return ped;
}

export function spawnPeds(G, n) {
  for (let i = 0; i < n; i += 1) {
    const s = pickSpawn(G);
    createPed(G, s.x + G.rng.range(-2, 2), s.z + G.rng.range(-2, 2));
  }
}

function pickTarget(G, ped) {
  const s = pickSpawn(G);
  ped.target = new THREE.Vector3(s.x, 0, s.z);
}

function animateWalk(ped, dt, amount) {
  ped.walkPhase += dt * (3 + ped.speed * 2.2);
  const swing = Math.sin(ped.walkPhase) * 0.5 * amount;
  ped.legL.rotation.x = swing;
  ped.legR.rotation.x = -swing;
}

function killPed(G, ped) {
  ped.state = 'dead';
  ped.dead = true;
  ped.deadTimer = DEAD_TIME;
  ped.group.rotation.x = -Math.PI / 2;
  ped.legL.rotation.x = 0;
  ped.legR.rotation.x = 0;
}

export function updatePeds(G, dt) {
  if (!G.peds || !G.world) return;

  // New gunfire or a rising wanted level scares nearby pedestrians. G.events
  // is drained by main.js every frame, so whatever is in it now is fresh.
  let scare = false;
  for (const ev of G.events) {
    if (ev.type === 'shot') { scare = true; break; }
  }
  if (G.player && G.player.wanted > lastWanted) scare = true;
  lastWanted = G.player ? G.player.wanted : 0;
  if (scare && G.player) {
    for (const ped of G.peds) {
      if (ped.state === 'dead') continue;
      const d = Math.hypot(ped.pos.x - G.player.pos.x, ped.pos.z - G.player.pos.z);
      if (d < 25) {
        ped.state = 'flee';
        ped.fleeTimer = FLEE_TIME;
        ped.target = null;
      }
    }
  }

  for (let i = G.peds.length - 1; i >= 0; i -= 1) {
    const ped = G.peds[i];

    if (ped.state === 'dead') {
      ped.deadTimer -= dt;
      if (ped.deadTimer <= 0) {
        G.scene.remove(ped.group);
        G.peds.splice(i, 1);
      }
      continue;
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      // Run directly away from the player.
      const dx = ped.pos.x - G.player.pos.x;
      const dz = ped.pos.z - G.player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx / d, dz / d);
      ped.heading = lerpAngle(ped.heading, targetHeading, Math.min(1, dt * 8));
      ped.group.rotation.y = ped.heading;
      ped.pos.x += Math.sin(ped.heading) * FLEE_SPEED * dt;
      ped.pos.z += Math.cos(ped.heading) * FLEE_SPEED * dt;
      animateWalk(ped, dt, 1.4);
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = null;
      }
      continue;
    }

    // Walk: pick a new sidewalk target whenever the old one is done.
    if (!ped.target) pickTarget(G, ped);
    const dx = ped.target.x - ped.pos.x;
    const dz = ped.target.z - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      ped.target = null;
    } else {
      const targetHeading = Math.atan2(dx / d, dz / d);
      ped.heading = lerpAngle(ped.heading, targetHeading, Math.min(1, dt * 6));
      ped.group.rotation.y = ped.heading;
      ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
      animateWalk(ped, dt, 1);
    }

    // Run over by a speeding car: knocked down, and it counts as a crime.
    for (const car of G.cars) {
      if (!car.speed || car.speed <= 3) continue;
      const cd = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
      if (cd < 1.6) {
        killPed(G, ped);
        G.events.push({ type: 'crime', level: 1 });
        break;
      }
    }
  }
}
