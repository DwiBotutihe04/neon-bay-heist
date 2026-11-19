// Neon Bay Heist — boot and the one loop: input is read every frame, the world advances
// in fixed 1/60 s steps, and the camera chases the player on foot or behind the wheel.
// Screens: menu, playing, paused, busted, wasted. ?seed=N fixes the world.
// ?shot=1|2|3|4 (with &seed=N) stages that scene, paints it twice and sets
// window.__shotReady for a screenshot.
import { createRandom } from './rng.js';
import { createInput } from './input.js';
import { initEffects, updateEffects } from './effects.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTraffic, drivePlayerCar } from './vehicles.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnPeds, updatePeds } from './peds.js';
import { updateCombat } from './combat.js';
import { addWanted, updatePolice, clearPolice } from './police.js';
import { MISSIONS, initMissions, startMission, updateMissions, abortMission } from './missions.js';
import { initHud, updateHud, toast, setObjective } from './hud.js';
import { initAudio, updateAudio } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 15;

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('end-screen');
const endTitleEl = document.getElementById('end-title');
const endSubEl = document.getElementById('end-sub');
const missionListEl = document.getElementById('mission-list');

// ---------- shared context ----------
const G = {
  three: THREE,
  scene: null,
  camera: null,
  renderer: null,
  rng: createRandom(seed),
  input: null,
  time: 0,
  state: 'menu',
  night: false,
  camYaw: Math.PI,
  camPitch: 0.32,
  moveBasis: { fwd: null, right: null },
  world: null,
  player: null,
  cars: [],
  peds: [],
  cops: { cars: [], foot: [] },
  missions: null,
  events: [],
  stats: { crimes: 0, carsStolen: 0, shotsFired: 0, missionsDone: 0, playSeconds: 0 },
  hud: null,
  audio: null,
  saveGame: null,
  lastMouseMove: -10,
  lastCrimeAt: -100,
  lastHurtAt: -100,
  bustTimer: 0,
};

function announce(message) {
  statusEl.textContent = message;
}

function buildWorld() {
  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(0xff9a56);
  G.scene.fog = new THREE.Fog(0xff9a56, 120, 700);
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x3a2b4d, 0.85);
  hemi.name = 'hemiLight';
  G.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98a, 1.6);
  sun.name = 'sunLight';
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  G.scene.add(sun);
  G.lights = { hemi, sun };

  G.moveBasis.fwd = new THREE.Vector3(0, 0, 1);
  G.moveBasis.right = new THREE.Vector3(1, 0, 0);
  G.input = createInput(canvas);
  initEffects(G);
  buildCity(G);
  G.player = {
    group: null, mesh: null, limbs: null,
    pos: new THREE.Vector3(G.world.spawn.x, 0, G.world.spawn.z),
    heading: G.world.spawn.heading, vel: new THREE.Vector3(),
    onFoot: true, car: null, health: 100, maxHealth: 100,
    cash: 0, wanted: 0, armed: false, ammo: 12, speed: 0,
  };
  createPlayer(G);
  spawnTraffic(G, 26);
  spawnPeds(G, 42);
  initMissions(G);
  initHud(G);
  G.saveGame = () => saveGame(G);
  window.__nbh = G;
}

function applyNight(on) {
  G.night = on;
  if (on) {
    G.scene.background.setHex(0x0b1030);
    G.scene.fog.color.setHex(0x0b1030);
    G.scene.fog.near = 60;
    G.scene.fog.far = 420;
    G.lights.hemi.intensity = 0.25;
    G.lights.sun.intensity = 0.25;
    G.lights.sun.color.setHex(0x8fb2ff);
  } else {
    G.scene.background.setHex(0xff9a56);
    G.scene.fog.color.setHex(0xff9a56);
    G.scene.fog.near = 120;
    G.scene.fog.far = 700;
    G.lights.hemi.intensity = 0.85;
    G.lights.sun.intensity = 1.6;
    G.lights.sun.color.setHex(0xffc98a);
  }
  if (G.world && G.world.nightLights) {
    for (const mat of G.world.nightLights) mat.emissiveIntensity = on ? 2.4 : 1.0;
  }
}

// ---------- menus ----------
function refreshMissionList() {
  missionListEl.innerHTML = '';
  for (const m of MISSIONS) {
    const done = G.missions.done.includes(m.id);
    const unlocked = G.missions.unlocked.includes(m.id);
    const row = document.createElement('div');
    row.className = 'mission-row' + (done ? ' done' : '') + (!unlocked ? ' locked' : '');
    const left = document.createElement('span');
    left.textContent = (done ? '✓ ' : unlocked ? '▶ ' : '🔒 ') + m.title + ' — ' + m.giver;
    const right = document.createElement('span');
    right.className = 'reward';
    right.textContent = done ? 'DONE' : '$' + m.reward.toLocaleString('en-US');
    row.appendChild(left);
    row.appendChild(right);
    if (unlocked && !done) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => startGame(m.id));
    }
    missionListEl.appendChild(row);
  }
}

function showMenu() {
  G.state = 'menu';
  hudEl.classList.remove('on');
  pauseEl.classList.remove('on');
  endEl.classList.remove('on');
  menuEl.classList.add('on');
  document.getElementById('btn-continue').style.display = loadGame() ? '' : 'none';
  refreshMissionList();
  announce('Neon Bay Heist. Pick a mission or press New Game.');
}

function startGame(missionId) {
  initAudio(G);
  menuEl.classList.remove('on');
  endEl.classList.remove('on');
  pauseEl.classList.remove('on');
  hudEl.classList.add('on');
  G.state = 'playing';
  G.input.lockPointer();
  if (missionId) startMission(G, missionId);
  else if (!G.missions.active) setObjective(G, 'Pick a job: open the menu with P, or drive around Neon Bay.');
  announce('Playing. Follow the yellow beacon for your mission.');
}

function continueGame() {
  const save = loadGame();
  if (!save) {
    startGame(null);
    return;
  }
  G.player.cash = save.cash || 0;
  G.player.health = save.health || 100;
  G.missions.done = save.missionsDone || [];
  G.missions.unlocked = save.unlocked && save.unlocked.length ? save.unlocked : ['m1'];
  G.stats = Object.assign(G.stats, save.stats || {});
  if (save.playerPos) {
    G.player.pos.set(save.playerPos.x, 0, save.playerPos.z);
    G.player.group.position.copy(G.player.pos);
  }
  startGame(null);
  toast(G, 'Save loaded. Welcome back to Neon Bay.');
}

function newGame() {
  clearSave();
  G.player.cash = 0;
  G.player.health = 100;
  G.player.wanted = 0;
  G.missions.done = [];
  G.missions.unlocked = ['m1'];
  G.missions.active = null;
  G.stats = { crimes: 0, carsStolen: 0, shotsFired: 0, missionsDone: 0, playSeconds: 0 };
  clearPolice(G);
  G.player.pos.set(G.world.spawn.x, 0, G.world.spawn.z);
  G.player.group.position.copy(G.player.pos);
  G.player.heading = G.world.spawn.heading;
  startGame('m1');
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.unlockPointer();
  saveGame(G);
  pauseEl.classList.add('on');
  announce('Paused.');
}

function resumeGame() {
  if (G.state !== 'paused') return;
  pauseEl.classList.remove('on');
  G.state = 'playing';
  G.input.lockPointer();
  announce('Playing.');
}

function endGame(kind, detail) {
  saveGame(G);
  G.input.unlockPointer();
  G.state = kind;
  endTitleEl.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  endTitleEl.className = 'bad';
  endSubEl.textContent = detail;
  endEl.classList.add('on');
  announce(kind === 'busted' ? 'Busted. The Neon Bay police got you.' : 'Wasted.');
}

function respawn() {
  G.player.health = 100;
  G.player.cash = Math.max(0, G.player.cash - 100);
  G.player.wanted = 0;
  clearPolice(G);
  abortMission(G);
  if (G.player.car) {
    G.player.car.driver = 'parked';
    G.player.car = null;
  }
  G.player.onFoot = true;
  if (G.player.mesh) G.player.mesh.visible = true;
  G.player.pos.set(G.world.spawn.x, 0, G.world.spawn.z);
  G.player.group.position.copy(G.player.pos);
  G.player.heading = G.world.spawn.heading;
  endEl.classList.remove('on');
  hudEl.classList.add('on');
  G.state = 'playing';
  G.input.lockPointer();
  setObjective(G, 'Pick a job: open the menu with P, or drive around Neon Bay.');
  toast(G, 'Back on the streets. Lay low for a while.');
}

function drainEvents() {
  for (const event of G.events) {
    if (event.type === 'crime') {
      G.lastCrimeAt = G.time;
      addWanted(G, event.level || 1);
    } else if (event.type === 'busted') {
      endGame('busted', 'A Neon Bay officer grabbed you on foot. You lost $100 in fines — and your ride.');
    } else if (event.type === 'wasted') {
      endGame('wasted', 'You went down in Neon Bay. The crew patched you up — minus $100.');
    } else if (event.type === 'cash') {
      G.player.cash += event.amount;
    } else if (event.type === 'mission') {
      toast(G, event.text);
    }
  }
  G.events.length = 0;
}

function updateCamera(dt) {
  const mouse = G.input.takeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) {
    G.camYaw -= mouse.dx * 0.0028;
    G.camPitch = Math.max(0.05, Math.min(0.9, G.camPitch + mouse.dy * 0.0022));
    G.lastMouseMove = G.time;
  }
  // When driving and the mouse is idle, ease the camera behind the car.
  if (G.player.car && G.time - G.lastMouseMove > 1.5) {
    let diff = G.player.car.heading - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.camYaw += diff * Math.min(1, dt * 1.6);
  }
  const fwd = G.moveBasis.fwd.set(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
  G.moveBasis.right.set(fwd.z, 0, -fwd.x);
  const target = G.player.car ? G.player.car.pos : G.player.pos;
  const dist = G.player.car ? 10.5 : 7;
  const height = G.player.car ? 4.4 : 3.4;
  const desired = new THREE.Vector3(
    target.x - fwd.x * dist,
    target.y + height + Math.sin(G.camPitch) * dist * 0.55,
    target.z - fwd.z * dist,
  );
  const k = 1 - Math.exp(-10 * dt);
  G.camera.position.lerp(desired, k);
  G.camera.lookAt(target.x, target.y + 1.6, target.z);
}

function stepWorld(dt) {
  updatePlayer(G, dt);
  if (G.player.car) drivePlayerCar(G, G.player.car, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updateCombat(G, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);
  updateEffects(G, dt);
  G.stats.playSeconds += dt;
}

function runShot(name) {
  buildWorld();
  stageShot(G, name);
  applyNight(G.night);
  menuEl.classList.remove('on');
  pauseEl.classList.remove('on');
  endEl.classList.remove('on');
  hudEl.classList.add('on');
  let painted = 0;
  function paint() {
    updateCamera(1 / 60);
    updateHud(G, 1 / 60);
    G.renderer.render(G.scene, G.camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  buildWorld();
  applyNight(false);
  showMenu();

  document.getElementById('btn-continue').addEventListener('click', continueGame);
  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('btn-howto').addEventListener('click', () => {
    const howto = document.getElementById('howto');
    howto.style.display = howto.style.display === 'block' ? 'none' : 'block';
  });
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-quit-menu').addEventListener('click', () => {
    saveGame(G);
    pauseEl.classList.remove('on');
    showMenu();
  });
  document.getElementById('btn-retry').addEventListener('click', respawn);
  document.getElementById('btn-end-menu').addEventListener('click', () => {
    endEl.classList.remove('on');
    showMenu();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && G.state === 'playing') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') pauseGame();
  });
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (G.state === 'playing') {
      G.time += frameDt;
      if (G.input.wasPressed('KeyP')) {
        pauseGame();
      } else {
        accumulator += frameDt;
        let guard = 0;
        while (accumulator >= STEP && guard < 8) {
          stepWorld(STEP);
          // Edge-triggered presses live for exactly ONE substep: without this,
          // a slow frame (several substeps) sees the same E press in every
          // substep, so enter-car toggles straight back to exit-car.
          G.input.endFrame();
          accumulator -= STEP;
          guard += 1;
        }
        if (guard >= 8) accumulator = 0;
        drainEvents();
        updateCamera(frameDt);
        updateHud(G, frameDt);
        updateAudio(G, frameDt);
        saveTimer += frameDt;
        if (saveTimer > AUTOSAVE_SECONDS) {
          saveTimer = 0;
          saveGame(G);
        }
      }
    } else if (G.state === 'menu') {
      // Idle city behind the menu: traffic and pedestrians keep moving.
      accumulator += frameDt;
      let guard = 0;
      while (accumulator >= STEP && guard < 8) {
        updateTraffic(G, STEP);
        updatePeds(G, STEP);
        updateEffects(G, STEP);
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulator = 0;
      G.time += frameDt;
      G.camYaw += frameDt * 0.02;
      updateCamera(frameDt);
    }
    G.renderer.render(G.scene, G.camera);
    G.input.endFrame();
  }
  announce('Neon Bay Heist. Pick a mission or press New Game.');
  requestAnimationFrame(frame);
}

if (shotParam) runShot(shotParam);
else runGame();
