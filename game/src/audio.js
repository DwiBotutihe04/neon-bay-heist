// Audio sintetis Neon Bay Heist: semua bunyi dibuat dengan WebAudio,
// tanpa file atau aset eksternal. AudioContext dibuat di initAudio, yang
// dipanggil koordinator dari klik tombol Start (gesture pengguna).

const BPM = 100;
const BEAT = 60 / BPM;          // 0.6 detik per ketuk
const HAT_STEP = BEAT / 2;      // hi-hat tiap 0.3 detik
// Bassline loop 8 not (A minor): A2 C3 E3 G2 A2 C3 E3 D3.
const BASSLINE = [110, 130.81, 164.81, 98, 110, 130.81, 164.81, 146.83];

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenPhase = 0;
let sirenTimer = 0;
let musicTimer = 0;
let musicStep = 0;

function tone(freq, dur, type, vol, slideTo, when) {
  if (!ctx || !master) return;
  const t0 = when === undefined ? ctx.currentTime : when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol === undefined ? 0.2 : vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, filterFreq, vol, when) {
  if (!ctx || !master) return;
  const t0 = when === undefined ? ctx.currentTime : when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol === undefined ? 0.25 : vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function playSfx(G, name, opts) {
  if (!ctx || !master) return;
  switch (name) {
    case 'shoot':
      noise(0.08, 3000, 0.35);
      tone(200, 0.08, 'sine', 0.3, 60);
      break;
    case 'punch':
      tone(120, 0.1, 'sine', 0.35, 50);
      break;
    case 'crash':
      noise(0.25, 400, 0.4);
      break;
    case 'pickup':
      tone(660, 0.1, 'sine', 0.25);
      tone(880, 0.14, 'sine', 0.25, undefined, ctx.currentTime + 0.09);
      break;
    case 'jingle': {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, 0.12, 'sine', 0.25, undefined, ctx.currentTime + i * 0.11));
      break;
    }
    case 'click':
      tone(800, 0.05, 'square', 0.12);
      break;
    case 'door':
      noise(0.06, 1200, 0.2);
      tone(300, 0.05, 'square', 0.1, 180);
      break;
    case 'mission': {
      const notes = [440, 554.37, 659.25];
      notes.forEach((f, i) => tone(f, 0.14, 'sine', 0.25, undefined, ctx.currentTime + i * 0.12));
      break;
    }
    case 'busted':
      tone(400, 0.5, 'sine', 0.3, 150);
      break;
    case 'wasted':
      tone(300, 1.2, 'sine', 0.3, 80);
      break;
    case 'horn':
      tone(220, 0.3, 'sawtooth', 0.18);
      break;
    default:
      // Nama sfx tidak dikenal: diam saja.
      break;
  }
}

export function initAudio(G) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no AudioContext');
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch (err) {
    G.audio = { play() {} };
    return;
  }

  // Engine: satu osilator sawtooth kontinyu, gain diatur per frame.
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 60;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();

  // Sirene: satu osilator, frekuensi digeser 700/950 Hz tiap 0.35 detik.
  sirenOsc = ctx.createOscillator();
  sirenOsc.type = 'sine';
  sirenOsc.frequency.value = 700;
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(master);
  sirenOsc.start();

  G.audio = {
    play: (name, opts) => playSfx(G, name, opts),
    ctx,
    master,
    musicOn: true,
  };
}

function updateEngine(G) {
  if (!engineOsc || !engineGain) return;
  const driving = G.state === 'playing' && G.player.car;
  if (!driving) {
    engineGain.gain.value = 0;
    return;
  }
  const speed = Math.abs(G.player.speed || 0);
  engineOsc.frequency.value = 60 + speed * 6;
  engineGain.gain.value = 0.05 + Math.min(0.07, speed * 0.002);
}

function updateSiren(G, dt) {
  if (!sirenOsc || !sirenGain) return;
  if (G.state !== 'playing' || G.player.wanted <= 0) {
    sirenGain.gain.value = 0;
    return;
  }
  sirenTimer += dt;
  if (sirenTimer >= 0.35) {
    sirenTimer = 0;
    sirenPhase = 1 - sirenPhase;
    sirenOsc.frequency.value = sirenPhase === 0 ? 700 : 950;
  }
  sirenGain.gain.value = 0.06;
}

function updateMusic(G, dt) {
  if (!G.audio || !G.audio.musicOn) return;
  if (G.state !== 'playing') return;
  musicTimer += dt;
  while (musicTimer >= HAT_STEP) {
    musicTimer -= HAT_STEP;
    // Hi-hat tiap setengah ketuk; bass tiap ketuk (langkah genap).
    noise(0.03, 6000, 0.05);
    if (musicStep % 2 === 0) {
      const note = BASSLINE[(musicStep / 2) % BASSLINE.length];
      tone(note, BEAT * 0.9, 'triangle', 0.16);
    }
    musicStep += 1;
  }
}

export function updateAudio(G, dt) {
  if (!ctx) return;
  if (G.input.wasPressed('KeyM') && G.audio) {
    G.audio.musicOn = !G.audio.musicOn;
    if (G.hud) G.hud.toast('Musik: ' + (G.audio.musicOn ? 'ON' : 'OFF'));
  }
  updateEngine(G);
  updateSiren(G, dt);
  updateMusic(G, dt);
}
