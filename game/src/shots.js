// Deterministic screenshot staging for Neon Bay Heist: ?shot=1|2|3|4 places the player,
// cars and police, runs the world forward a few seconds, and leaves a fixed camera,
// so the same seed always gives the same frame.
import { createCar, updateTraffic } from './vehicles.js';
import { createPed, updatePeds } from './peds.js';
import { addWanted, updatePolice } from './police.js';
import { startMission, updateMissions } from './missions.js';
import { setObjective } from './hud.js';
import { updateEffects } from './effects.js';

const STEP = 1 / 60;

function snapCamera(G, target, yaw, pitch, dist, height) {
  G.camYaw = yaw;
  G.camPitch = pitch;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  G.camera.position.set(
    target.x - fwdX * dist,
    target.y + height + Math.sin(pitch) * dist * 0.55,
    target.z - fwdZ * dist,
  );
  G.camera.lookAt(target.x, target.y + 1.6, target.z);
}

function settle(G, steps, withPolice) {
  for (let i = 0; i < steps; i += 1) {
    updateTraffic(G, STEP);
    updatePeds(G, STEP);
    if (withPolice) updatePolice(G, STEP);
    updateMissions(G, STEP);
    updateEffects(G, STEP);
    G.time += STEP;
  }
}

function putPlayerInCar(G, kind, x, z, heading, speed) {
  const car = createCar(G, { kind, color: 0xff2ea6, x, z, heading, driver: 'player' });
  G.cars.push(car);
  G.player.car = car;
  G.player.onFoot = false;
  if (G.player.mesh) G.player.mesh.visible = false;
  G.player.pos.copy(car.pos);
  G.player.heading = heading;
  car.speed = speed === undefined ? 0 : speed;
  return car;
}

// Shot 1 — cover: sunset avenue, player in a pink sportscar, traffic, HUD + minimap.
function stageCover(G) {
  G.player.cash = 1250;
  const car = putPlayerInCar(G, 'sport', 0, 130, Math.PI, 14);
  const taxi = createCar(G, { kind: 'taxi', color: 0xffc93c, x: -7, z: 96, heading: Math.PI, driver: 'traffic' });
  taxi.speed = 11;
  G.cars.push(taxi);
  const sedan = createCar(G, { kind: 'sedan', color: 0x35c4ff, x: 7, z: 70, heading: 0, driver: 'traffic' });
  sedan.speed = 10;
  G.cars.push(sedan);
  setObjective(G, 'Cruise Neon Bay — steal a car, run the jobs, get rich.');
  settle(G, 90, false);
  car.speed = 14;
  G.player.speed = 14;
  snapCamera(G, car.pos, Math.PI, 0.3, 10.5, 4.4);
}

// The wrapper updatePolice expects around a cop car (with its flashing light-bar mats).
function copWrapper(G, car) {
  let red = null;
  let blue = null;
  car.group.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.color === undefined) return;
    const hex = o.material.color.getHex();
    if (hex === 0xff2222) red = o.material;
    else if (hex === 0x2255ff) blue = o.material;
  });
  return {
    car,
    lightMats: red && blue ? { red, blue } : null,
    lightTimer: 0, lightRed: true, ramTimer: 0, deployed: 0,
  };
}

// Shot 2 — police chase: wanted 3, two cop cars closing in behind the player.
function stageChase(G) {
  G.player.cash = 2350;
  const car = putPlayerInCar(G, 'sport', 0, 60, Math.PI, 20);
  addWanted(G, 3);
  const cop1 = createCar(G, { kind: 'cop', color: 0x11131a, x: -5, z: 64, heading: Math.PI, driver: 'cop' });
  const cop2 = createCar(G, { kind: 'cop', color: 0x11131a, x: 6, z: 52, heading: Math.PI, driver: 'cop' });
  cop1.speed = 24;
  cop2.speed = 22;
  G.cars.push(cop1, cop2);
  G.cops.cars.push(copWrapper(G, cop1), copWrapper(G, cop2));
  setObjective(G, 'Lose the cops — break line of sight and lay low.');
  settle(G, 45, true);
  car.speed = 20;
  G.player.speed = 20;
  snapCamera(G, car.pos, Math.PI, 0.32, 11, 4.6);
}

// Shot 3 — mission on foot: Harbor Snatch, player at the container with the beacon.
function stageMission(G) {
  G.player.cash = 900;
  const spot = G.world.missionSpots.harbor;
  // Close enough that the 'goto' step completes during settle, leaving the
  // 'grab' step (and its beacon) on screen; stand south-east of the beacon
  // so the camera looks back toward the city.
  G.player.pos.set(spot.x + 4, 0, spot.z + 4);
  G.player.group.position.copy(G.player.pos);
  G.player.heading = Math.atan2(spot.x - G.player.pos.x, spot.z - G.player.pos.z);
  createPed(G, spot.x - 12, spot.z + 10);
  createPed(G, spot.x + 14, spot.z - 6);
  createPed(G, spot.x - 4, spot.z - 14);
  const parked = createCar(G, { kind: 'van', color: 0x27ae60, x: spot.x + 16, z: spot.z + 12, heading: Math.PI / 2, driver: 'parked' });
  G.cars.push(parked);
  startMission(G, 'm3');
  settle(G, 150, false);
  const target = new THREE.Vector3(spot.x, 0, spot.z);
  const yaw = Math.atan2(target.x - G.player.pos.x, target.z - G.player.pos.z);
  snapCamera(G, G.player.pos, yaw, 0.38, 9, 4.6);
}

// Shot 4 — night on the Neon Strip: neon signs, streetlights, one cop car in the distance.
function stageNight(G) {
  G.night = true;
  G.time = 3 * 3600; // 20:30 on the HUD clock, so the night sky matches the time
  G.player.cash = 1800;
  const spot = G.world.missionSpots.strip;
  G.player.pos.set(spot.x + 4, 0, spot.z + 18);
  G.player.group.position.copy(G.player.pos);
  G.player.heading = Math.PI;
  addWanted(G, 1);
  const cop = createCar(G, { kind: 'cop', color: 0x11131a, x: 8, z: -20, heading: 0, driver: 'cop' });
  cop.speed = 12;
  G.cars.push(cop);
  G.cops.cars.push(copWrapper(G, cop));
  setObjective(G, 'Explore the Neon Strip — and mind the patrol car.');
  settle(G, 60, true);
  snapCamera(G, G.player.pos, Math.PI, 0.28, 7, 3.4);
}

export function stageShot(G, name) {
  G.state = 'playing';
  // Shots stage any mission, locked or not: the frame is what matters.
  G.missions.unlocked = ['m1', 'm2', 'm3', 'm4'];
  if (name === '2') stageChase(G);
  else if (name === '3') stageMission(G);
  else if (name === '4') stageNight(G);
  else stageCover(G);
}
