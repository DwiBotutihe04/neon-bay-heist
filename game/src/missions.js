// Misi berantai Neon Bay Heist: Rio Kade, sopir pelarian di kota Neon Bay.
// Pemberi misi: Dex (montir bengkel) dan Madame Sol (pemilik klub malam).
// Tidak ada impor — semua sistem lain diakses lewat G.

export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Wheels',
    giver: 'Dex',
    brief: 'Dex: "Butuh roda, Rio. Curi mobil apa saja, bawa ke bengkelku."',
    reward: 300,
    steps: [
      { type: 'stealCar', text: 'Curi sebuah mobil (dekati mobil lalu tekan E)' },
      { type: 'driveTo', pos: 'garage', radius: 10, text: 'Bawa mobilnya ke bengkel Dex' },
    ],
  },
  {
    id: 'm2',
    name: 'Neon Delivery',
    giver: 'Madame Sol',
    brief: 'Madame Sol: "Paket untuk Marina Row. Jangan telat — 90 detik."',
    reward: 600,
    steps: [
      { type: 'driveTo', pos: 'marina', radius: 10, timeLimit: 90, text: 'Antar paket ke Marina Row (90 detik)' },
      { type: 'goto', pos: 'marina', radius: 6, text: 'Turun dan serahkan paket (tekan E)' },
    ],
  },
  {
    id: 'm3',
    name: 'Harbor Snatch',
    giver: 'Madame Sol',
    brief: 'Madame Sol: "Koper di pelabuhan. Ambil, lalu hilang dari sana."',
    reward: 1200,
    steps: [
      { type: 'goto', pos: 'harbor', radius: 6, text: 'Capai kontainer pelabuhan' },
      { type: 'grab', pos: 'harbor', radius: 5, text: 'Ambil koper (tekan E)' },
      { type: 'escape', pos: 'garage', radius: 10, text: 'Kabur ke bengkel — polisi mengejarmu!' },
    ],
  },
  {
    id: 'm4',
    name: 'The Big One',
    giver: 'Dex',
    brief: 'Dex: "Sportscar, Rio. Curi, bersihkan buronanmu, antar ke Cannery."',
    reward: 2500,
    steps: [
      { type: 'stealCar', kind: 'sport', text: 'Curi sebuah sportscar' },
      { type: 'loseWanted', text: 'Hilangkan buronan sampai 0 bintang' },
      { type: 'driveTo', pos: 'cannery', radius: 10, text: 'Antar sportscar ke Cannery' },
    ],
  },
];

function stepPos(G, step) {
  if (!step || !step.pos) return null;
  const spot = G.world && G.world.missionSpots ? G.world.missionSpots[step.pos] : null;
  return spot || null;
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function moveMarker(G) {
  const m = G.missions;
  if (!m || !m.marker) return;
  const step = m.active ? m.active.steps[m.stepIndex] : null;
  const pos = stepPos(G, step);
  if (pos) {
    m.marker.position.set(pos.x, 0, pos.z);
    m.marker.visible = true;
    m.blipPos = { x: pos.x, z: pos.z };
  } else {
    m.marker.visible = false;
    m.blipPos = null;
  }
}

function showStep(G) {
  const m = G.missions;
  const step = m.active.steps[m.stepIndex];
  m.timer = step.timeLimit || 0;
  moveMarker(G);
  if (G.hud) G.hud.setObjective(step.text);
  if (G.hud) G.hud.toast(step.text);
}

export function initMissions(G) {
  G.missions = {
    list: MISSIONS,
    active: null,
    stepIndex: 0,
    timer: 0,
    done: [],
    unlocked: ['m1'],
    blipPos: null,
    marker: null,
  };
  // Beacon: beam kuning transparan + cincin tanah yang berputar.
  const marker = new THREE.Group();
  const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 30, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd34d, transparent: true, opacity: 0.25,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 15;
  const ringGeo = new THREE.RingGeometry(2.2, 3, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd34d, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  marker.add(beam);
  marker.add(ring);
  marker.userData.ring = ring;
  marker.visible = false;
  G.scene.add(marker);
  G.missions.marker = marker;
}

export function startMission(G, id) {
  const m = G.missions;
  if (!m) return;
  const def = MISSIONS.find((x) => x.id === id);
  if (!def) return;
  if (!m.unlocked.includes(id)) {
    if (G.hud) G.hud.toast('Selesaikan misi sebelumnya dulu.');
    return;
  }
  if (m.active) abortMission(G);
  m.active = def;
  m.stepIndex = 0;
  showStep(G);
  if (G.hud) G.hud.toast(def.brief, 4200);
  if (G.audio) G.audio.play('mission');
  if (G.events) G.events.push({ type: 'mission', text: def.name + ' dimulai' });
}

function completeMission(G) {
  const m = G.missions;
  const def = m.active;
  // Cash comes ONLY from the 'cash' event below (main.js drains it once).
  // Adding it here too credited the reward twice ($300 became $600).
  G.stats.missionsDone += 1;
  m.done.push(def.id);
  const idx = MISSIONS.findIndex((x) => x.id === def.id);
  const next = MISSIONS[idx + 1];
  if (next && !m.unlocked.includes(next.id)) m.unlocked.push(next.id);
  if (G.events) G.events.push({ type: 'mission', text: def.name + ' selesai' });
  if (G.events) G.events.push({ type: 'cash', amount: def.reward });
  if (G.hud) G.hud.toast('Misi selesai! +$' + def.reward.toLocaleString('en-US'), 3600);
  if (G.audio) G.audio.play('jingle');
  m.active = null;
  m.stepIndex = 0;
  m.timer = 0;
  m.blipPos = null;
  if (m.marker) m.marker.visible = false;
  if (G.hud) G.hud.setObjective('');
  if (G.saveGame) G.saveGame(G);
}

function failMission(G, reason) {
  if (G.hud) G.hud.toast('Misi gagal — ' + reason, 3600);
  if (G.audio) G.audio.play('busted');
  abortMission(G);
}

function stepDone(G, step) {
  const p = G.player;
  switch (step.type) {
    case 'stealCar':
      if (!p.car) return false;
      if (step.kind && p.car.kind !== step.kind) return false;
      return true;
    case 'goto':
    case 'driveTo':
    case 'escape': {
      const pos = stepPos(G, step);
      if (!pos) return false;
      if (step.type === 'driveTo' && !p.car) return false;
      return dist2D(p.pos, pos) < step.radius;
    }
    case 'grab': {
      const pos = stepPos(G, step);
      if (!pos) return false;
      return dist2D(p.pos, pos) < step.radius && G.input.wasPressed('KeyE');
    }
    case 'loseWanted':
      return p.wanted === 0;
    default:
      return false;
  }
}

function onStepComplete(G, step) {
  // Efek samping cerita saat step tertentu selesai.
  const m = G.missions;
  if (m.active.id === 'm3' && step.type === 'grab') {
    G.player.wanted = 2;
    if (G.hud) G.hud.toast('Polisi mengejarmu! Kabur ke bengkel!', 3600);
  }
  if (m.active.id === 'm4' && step.type === 'stealCar') {
    G.player.wanted = 3;
    if (G.hud) G.hud.toast('Alarm berbunyi! Buronan 3 bintang!', 3600);
  }
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (!m || !m.active) return;
  const step = m.active.steps[m.stepIndex];
  if (!step) return;

  // Cincin beacon berputar pelan.
  if (m.marker && m.marker.visible && m.marker.userData.ring) {
    m.marker.userData.ring.rotation.z += dt * 0.8;
  }

  if (step.timeLimit) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G, 'waktu habis!');
      return;
    }
  }

  if (!stepDone(G, step)) return;
  onStepComplete(G, step);
  m.stepIndex += 1;
  if (m.stepIndex >= m.active.steps.length) {
    completeMission(G);
  } else {
    showStep(G);
  }
}

export function abortMission(G) {
  const m = G.missions;
  if (!m) return;
  m.active = null;
  m.stepIndex = 0;
  m.timer = 0;
  m.blipPos = null;
  if (m.marker) m.marker.visible = false;
  if (G.hud) G.hud.setObjective('');
}
