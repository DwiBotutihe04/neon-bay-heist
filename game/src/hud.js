// HUD Neon Bay Heist: cash, health, bintang buronan, kecepatan, jam game,
// objektif, toast, crosshair, dan minimap canvas. Semua elemen DOM sudah
// disiapkan koordinator di index.html — file ini hanya membaca id-nya.

const HUD_IDS = [
  'hud', 'cash', 'health-fill', 'health-num', 'stars', 'speed',
  'objective', 'objective-title', 'toast', 'minimap', 'crosshair',
  'ammo', 'clock', 'wanted-label', 'hint',
];

const MAP_SIZE = 180;      // canvas minimap 180x180
const MAP_SCALE = 180 / 520; // kota ~478 unit dipetakan ke 180px (margin)
const MAP_CENTER = 90;     // titik tengah canvas = pusat kota (0,0)

let toastTimer = 0;

function $(id) {
  return document.getElementById(id);
}

export function initHud(G) {
  const els = {};
  for (const id of HUD_IDS) els[id] = $(id);
  G.hudEls = els;
  G.hud = {
    toast: (msg, ms) => toast(G, msg, ms),
    setObjective: (text) => setObjective(G, text),
  };
  if (els.minimap) {
    G.hudEls.mapCtx = els.minimap.getContext('2d');
  }
}

export function toast(G, msg, ms) {
  const el = G.hudEls && G.hudEls.toast;
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  toastTimer = ms === undefined ? 2600 : ms;
}

export function setObjective(G, text) {
  const els = G.hudEls;
  if (!els) return;
  const show = !!text;
  if (els.objective) {
    els.objective.textContent = text || '';
    els.objective.style.display = show ? 'block' : 'none';
  }
  if (els['objective-title']) {
    els['objective-title'].style.display = show ? 'block' : 'none';
  }
}

// Jam game: mulai 17:30, 1 detik nyata = 1 menit game.
function gameClock(G) {
  const totalMin = 17 * 60 + 30 + Math.floor(G.time / 60);
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return hh + ':' + mm;
}

// Minimap: x dunia -> kanan, z dunia -> bawah (utara = -z di atas).
// Laut ada di z > 300, jadi strip biru digambar di bawah canvas.
function drawMinimap(G) {
  const ctx = G.hudEls.mapCtx;
  const canvas = G.hudEls.minimap;
  if (!ctx || !canvas || !G.world) return;
  const toMapX = (x) => MAP_CENTER + x * MAP_SCALE;
  const toMapY = (z) => MAP_CENTER + z * MAP_SCALE;

  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  // Laut di tepi bawah (z besar).
  ctx.fillStyle = '#123a5c';
  ctx.fillRect(0, toMapY(300), MAP_SIZE, MAP_SIZE - toMapY(300));

  // Jalan.
  ctx.strokeStyle = '#5a6478';
  ctx.lineWidth = 2;
  for (const road of G.world.roads) {
    ctx.beginPath();
    ctx.moveTo(toMapX(road.x1), toMapY(road.z1));
    ctx.lineTo(toMapX(road.x2), toMapY(road.z2));
    ctx.stroke();
  }

  // Blip misi (denyut kuning).
  const blip = G.missions && G.missions.blipPos;
  if (blip) {
    const pulse = 4 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(toMapX(blip.x), toMapY(blip.z), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff2b0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(toMapX(blip.x), toMapY(blip.z), pulse + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Mobil traffic (putih) dan mobil polisi (biru/merah berkedip).
  for (const car of G.cars) {
    let color = '#e8ecf4';
    if (car.kind === 'cop') {
      color = Math.floor(G.time * 2) % 2 === 0 ? '#3b82f6' : '#ef4444';
    }
    ctx.fillStyle = color;
    ctx.fillRect(toMapX(car.pos.x) - 1.5, toMapY(car.pos.z) - 1.5, 3, 3);
  }

  // Pemain: panah segitiga kuning menghadap heading.
  const p = G.player;
  const px = toMapX(p.pos.x);
  const py = toMapY(p.pos.z);
  const a = Math.atan2(Math.sin(p.heading), -Math.cos(p.heading));
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function updateHud(G, dt) {
  const els = G.hudEls;
  if (!els) return;
  const playing = G.state === 'playing';
  if (els.hud) els.hud.style.display = playing ? 'block' : 'none';
  if (!playing) return;

  // Toast: hitung mundur lalu sembunyikan.
  if (toastTimer > 0) {
    toastTimer -= dt * 1000;
    if (toastTimer <= 0 && els.toast) els.toast.style.display = 'none';
  }

  if (els.cash) els.cash.textContent = '$' + G.player.cash.toLocaleString('en-US');

  const hpPct = Math.max(0, Math.min(100, (G.player.health / G.player.maxHealth) * 100));
  if (els['health-fill']) els['health-fill'].style.width = hpPct + '%';
  if (els['health-num']) els['health-num'].textContent = String(Math.ceil(G.player.health));

  const wanted = Math.max(0, Math.min(5, G.player.wanted));
  if (els.stars) {
    els.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    els.stars.style.color = wanted > 0 ? '#ff5252' : '#cbd5e1';
  }
  if (els['wanted-label']) {
    els['wanted-label'].style.display = wanted > 0 ? 'block' : 'none';
    if (wanted > 0) els['wanted-label'].textContent = 'WANTED ' + '★'.repeat(wanted);
  }

  // Kecepatan: mobil atau jalan kaki, keduanya dalam km/h.
  const speed = Math.abs(G.player.speed || 0);
  if (els.speed) els.speed.textContent = Math.round(speed * 3.6) + ' km/h';

  if (els.ammo) els.ammo.textContent = G.player.armed ? 'AMMO ' + G.player.ammo : '';
  if (els.crosshair) els.crosshair.style.display = G.player.armed ? 'block' : 'none';
  if (els.clock) els.clock.textContent = gameClock(G);

  drawMinimap(G);
}
