// Low-poly traffic for Neon Bay: car factory, road-graph traffic,
// player driving, enter / exit. No imports from sibling systems —
// everything comes through G (world, rng, input, events, audio).
import { burst } from './effects.js';

const PALETTE = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xf1c40f, 0x16a085];
const STATS = {
  sedan: { maxSpeed: 26, accel: 12, bodyH: 0.7, bodyY: 0.55, cabH: 0.6, cabY: 1.2, len: 4.2, wid: 2.0 },
  taxi: { maxSpeed: 24, accel: 11, bodyH: 0.7, bodyY: 0.55, cabH: 0.6, cabY: 1.2, len: 4.2, wid: 2.0 },
  sport: { maxSpeed: 34, accel: 14, bodyH: 0.55, bodyY: 0.45, cabH: 0.5, cabY: 1.0, len: 4.4, wid: 2.0 },
  van: { maxSpeed: 20, accel: 10, bodyH: 1.1, bodyY: 0.75, cabH: 0.9, cabY: 1.6, len: 4.8, wid: 2.2 },
  cop: { maxSpeed: 30, accel: 13, bodyH: 0.7, bodyY: 0.55, cabH: 0.6, cabY: 1.2, len: 4.2, wid: 2.0 },
};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x182430 });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function createCar(G, opts) {
  const o = opts || {};
  const kind = o.kind || 'sedan';
  const st = STATS[kind] || STATS.sedan;
  const color = o.color === undefined ? G.rng.pick(PALETTE) : o.color;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });

  // Body + cabin. Length runs along local +z (forward); cop cars are
  // white with a black cabin band.
  const bodyColor = kind === 'cop' ? 0xf2f2f2 : color;
  const body = box(st.wid, st.bodyH, st.len, new THREE.MeshLambertMaterial({ color: bodyColor }), 0, st.bodyY, 0);
  group.add(body);
  const cabin = box(st.wid * 0.88, st.cabH, st.len * 0.52, glassMat, 0, st.cabY, -st.len * 0.05);
  group.add(cabin);
  if (kind === 'van') {
    group.add(box(st.wid * 0.9, 0.25, st.len * 0.8, bodyMat, 0, st.cabY + st.cabH / 2 + 0.1, 0));
  }
  if (kind === 'sport') {
    group.add(box(st.wid * 0.9, 0.08, 0.25, bodyMat, 0, st.bodyY + st.bodyH / 2 + 0.35, -st.len / 2 + 0.15));
  }
  if (kind === 'taxi') {
    group.add(box(0.5, 0.3, 0.9, new THREE.MeshLambertMaterial({ color: 0x222222 }), 0, st.cabY + st.cabH / 2 + 0.15, 0));
    group.add(box(0.4, 0.22, 0.7, new THREE.MeshBasicMaterial({ color: 0xffe14d }), 0, st.cabY + st.cabH / 2 + 0.4, 0));
  }
  if (kind === 'cop') {
    // Red / blue light bar across the roof.
    const bar = new THREE.Group();
    bar.add(box(0.9, 0.18, 0.5, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.45, 0, 0));
    bar.add(box(0.9, 0.18, 0.5, new THREE.MeshBasicMaterial({ color: 0x2255ff }), 0.45, 0, 0));
    bar.position.set(0, st.cabY + st.cabH / 2 + 0.1, 0);
    group.add(bar);
    group.add(box(st.wid * 0.92, 0.06, st.len * 0.4, new THREE.MeshLambertMaterial({ color: 0x111111 }), 0, st.bodyY + st.bodyH / 2 + 0.02, st.len * 0.25));
  }

  // Headlights (front = +z in local space, forward = (sin h, 0, cos h)).
  const fz = st.len / 2 + 0.02;
  group.add(box(0.3, 0.18, 0.08, headMat, 0.6, st.bodyY, fz));
  group.add(box(0.3, 0.18, 0.08, headMat, -0.6, st.bodyY, fz));
  group.add(box(0.3, 0.18, 0.08, tailMat, 0.6, st.bodyY, -fz));
  group.add(box(0.3, 0.18, 0.08, tailMat, -0.6, st.bodyY, -fz));

  // Wheels: cylinders with the axle across the car (local x).
  // rotation.z tips the cylinder axis onto x; spinning is rotation.x.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  for (const [wx, wz] of [[st.wid / 2, st.len * 0.32], [-st.wid / 2, st.len * 0.32], [st.wid / 2, -st.len * 0.32], [-st.wid / 2, -st.len * 0.32]]) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.36, wz);
    group.add(wheel); wheels.push(wheel);
  }

  const heading = o.heading === undefined ? 0 : o.heading;
  group.position.set(o.x || 0, 0, o.z || 0);
  group.rotation.y = heading;
  G.scene.add(group);

  return {
    group, body, wheels, pos: group.position, heading, speed: 0,
    maxSpeed: st.maxSpeed, accel: st.accel, steer: 0, color, kind,
    driver: o.driver || 'traffic', hp: 100, edge: -1, edgeT: 0, edgeDir: 1,
    cruise: G.rng.range(10, 14), prevNode: -1,
  };
}

// Put a traffic car on a random road edge, part-way along it.
function placeOnEdge(G, car) {
  const edges = G.world.edges;
  const nodes = G.world.nodes;
  const e = G.rng.int(0, edges.length - 1);
  const edge = edges[e];
  const from = edge.a, to = edge.b;
  car.edge = e;
  car.edgeT = G.rng.range(0.05, 0.95);
  car.edgeDir = G.rng.chance(0.5) ? 1 : -1;
  car.prevNode = car.edgeDir === 1 ? from : to;
  const A = nodes[car.edgeDir === 1 ? from : to];
  const B = nodes[car.edgeDir === 1 ? to : from];
  car.pos.set(A.x + (B.x - A.x) * car.edgeT, 0, A.z + (B.z - A.z) * car.edgeT);
  car.heading = Math.atan2(B.x - A.x, B.z - A.z);
  car.group.rotation.y = car.heading;
  car.speed = car.cruise;
}

export function spawnTraffic(G, n) {
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'van'];
  for (let i = 0; i < n; i += 1) {
    const s = G.rng.pick(G.world.carSpawns);
    const car = createCar(G, { kind: G.rng.pick(kinds), x: s.x, z: s.z, heading: s.heading, driver: 'traffic' });
    placeOnEdge(G, car);
    G.cars.push(car);
  }
  // Parked cars hugging the road edge, out of the driving lane.
  for (let i = 0; i < 10; i += 1) {
    const s = G.rng.pick(G.world.carSpawns);
    const side = G.rng.chance(0.5) ? 1 : -1;
    const car = createCar(G, { kind: G.rng.pick(kinds),
      x: s.x + Math.cos(s.heading) * 4.6 * side, z: s.z - Math.sin(s.heading) * 4.6 * side,
      heading: s.heading, driver: 'parked' });
    G.cars.push(car);
  }
  // Mission sport car parked by the garage (south avenue).
  const sport = createCar(G, { kind: 'sport', color: 0xff3d7f, x: 6.5, z: 206, heading: Math.PI, driver: 'parked' });
  G.cars.push(sport);
  return G.cars;
}

function outgoingEdges(G, nodeIdx, excludeEdge) {
  const out = [];
  G.world.edges.forEach((e, i) => {
    if (i === excludeEdge) return;
    if (e.a === nodeIdx) out.push({ edge: i, dir: 1, to: e.b });
    else if (e.b === nodeIdx) out.push({ edge: i, dir: -1, to: e.a });
  });
  return out;
}

export function updateTraffic(G, dt) {
  const cars = G.cars;
  const nodes = G.world.nodes;
  for (const car of cars) {
    if (car.driver !== 'traffic') continue;
    if (car.edge < 0) { placeOnEdge(G, car); continue; }
    const edge = G.world.edges[car.edge];
    const A = nodes[car.edgeDir === 1 ? edge.a : edge.b];
    const B = nodes[car.edgeDir === 1 ? edge.b : edge.a];
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.5);
    car.edgeT += (car.speed * dt) / len;
    if (car.edgeT >= 1) { // reached node B: pick a random exit, avoid U-turn if possible
      const nodeIdx = car.edgeDir === 1 ? edge.b : edge.a;
      const options = outgoingEdges(G, nodeIdx, car.edge);
      const forward = options.filter((o) => o.to !== car.prevNode);
      const pick = (forward.length ? forward : options);
      if (!pick.length) { car.edgeDir *= -1; car.edgeT = 0; continue; }
      const next = G.rng.pick(pick);
      car.prevNode = nodeIdx; car.edge = next.edge; car.edgeDir = next.dir; car.edgeT = 0;
      continue;
    }
    car.pos.set(A.x + (B.x - A.x) * car.edgeT, 0, A.z + (B.z - A.z) * car.edgeT);
    car.heading = Math.atan2(B.x - A.x, B.z - A.z);
    car.group.rotation.y = car.heading;
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    // Ran into a building (bad spawn or drift): turn around.
    if (G.world.collideCircle(car.pos, 1.6)) {
      car.edgeDir *= -1;
      car.edgeT = 1 - car.edgeT;
    }
  }
  // Circle repulsion between nearby cars so traffic does not stack.
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i], b = cars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.01 && d2 < 3.2 * 3.2) {
        const d = Math.sqrt(d2), push = (3.2 - d) / 2, nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }
}

export function drivePlayerCar(G, car, dt) {
  const input = G.input;
  const gas = input.down('KeyW') || input.down('ArrowUp');
  const brake = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const handbrake = input.down('Space');

  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget * 0.55 - car.steer) * Math.min(1, dt * 8);
  if (gas) car.speed += car.accel * dt;
  if (brake) car.speed -= car.speed > 0.5 ? car.accel * 1.4 * dt : car.accel * 0.7 * dt;
  if (!gas && !brake) car.speed -= car.speed * Math.min(1, dt * 1.2);
  if (handbrake) { car.speed -= car.speed * Math.min(1, dt * 4); car.steer *= 1.4; } // a little slide
  car.speed = Math.max(-8, Math.min(car.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05 && !gas && !brake) car.speed = 0;

  car.heading += car.steer * car.speed * 0.045 * dt * (car.speed >= 0 ? 1 : -1);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.group.rotation.y = car.heading;
  car.group.rotation.z = -car.steer * car.speed * 0.004;

  if (G.world.collideCircle(car.pos, 1.6)) {
    if (Math.abs(car.speed) > 6) {
      G.events.push({ type: 'crash' });
      burst(G, car.pos, 0xffc46a, 16, 7);
      if (G.audio) G.audio.play('crash');
    }
    car.speed *= -0.25;
  }
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
  if (G.player) {
    G.player.pos.copy(car.pos);
    G.player.heading = car.heading;
    G.player.speed = Math.abs(car.speed);
  }
}

export function enterCar(G, car) {
  G.player.car = car;
  car.driver = 'player';
  G.player.onFoot = false;
  if (G.player.mesh) G.player.mesh.visible = false;
  G.player.pos.copy(car.pos);
  G.player.heading = car.heading;
  if (G.audio) G.audio.play('door');
  // One headlight spot for the player car only, removed on exit.
  if (!car._spot) {
    const spot = new THREE.SpotLight(0xfff2c0, 0, 40, 0.5, 0.5, 1.2);
    spot.position.set(0, 1, 2.4);
    const target = new THREE.Object3D();
    target.position.set(0, 0, 14);
    car.group.add(target);
    spot.target = target;
    car.group.add(spot);
    car._spot = spot;
  }
  car._spot.intensity = G.night ? 60 : 0;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  G.player.pos.set(car.pos.x + rx * 2.2, 0, car.pos.z + rz * 2.2);
  G.world.collideCircle(G.player.pos, 0.6);
  car.driver = 'parked';
  car.speed = 0;
  G.player.car = null;
  G.player.onFoot = true;
  if (G.player.mesh) G.player.mesh.visible = true;
  if (G.player.group) G.player.group.position.copy(G.player.pos);
  if (car._spot) car._spot.intensity = 0;
  if (G.audio) G.audio.play('door');
}
